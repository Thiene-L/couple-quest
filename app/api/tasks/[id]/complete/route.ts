import { and, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { taskCompletions, tasks } from "@/db/schema";
import { getDb, getEnv, todayKey } from "@/lib/db";
import { getSession, unauthorizedResponse } from "@/lib/session";

// 允许上传的图片类型白名单：MIME -> R2 key 扩展名。
// 只认这五种，svg+xml / html 等能被浏览器当文档解析的类型一律拒绝
const ALLOWED_IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
} as const;

type AllowedImageType = keyof typeof ALLOWED_IMAGE_TYPES;

// 归一化客户端上报的 type 后查白名单，命中才返回服务端自己的 MIME 和扩展名
function resolveImageType(
  rawType: string,
): { contentType: AllowedImageType; ext: string } | null {
  const mime = rawType.split(";")[0].trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(ALLOWED_IMAGE_TYPES, mime)) {
    return null;
  }
  const contentType = mime as AllowedImageType;
  return { contentType, ext: ALLOWED_IMAGE_TYPES[contentType] };
}

// POST /api/tasks/[id]/complete：提交完成打卡（multipart：note?, photo?），进入待确认状态
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return unauthorizedResponse();

  const { id } = await ctx.params;
  const db = await getDb();

  const task = (
    await db.select().from(tasks).where(eq(tasks.id, id)).limit(1)
  )[0];
  if (!task) {
    return Response.json({ error: "任务不存在" }, { status: 404 });
  }
  if (task.status !== "open") {
    return Response.json({ error: "任务已关闭，不能打卡了" }, { status: 400 });
  }
  if (task.assigneeId !== session.userId) {
    return Response.json({ error: "这不是你的任务哦" }, { status: 400 });
  }

  const today = todayKey();
  // once：历史上只要有 pending/confirmed 就不能再交；daily：当天有 pending/confirmed 就不能再交
  // rejected 不算数，被打回后可重新提交
  const dupWhere =
    task.repeat === "once"
      ? and(
          eq(taskCompletions.taskId, id),
          inArray(taskCompletions.status, ["pending", "confirmed"]),
        )
      : and(
          eq(taskCompletions.taskId, id),
          eq(taskCompletions.dayKey, today),
          inArray(taskCompletions.status, ["pending", "confirmed"]),
        );
  const dup = await db
    .select({ id: taskCompletions.id })
    .from(taskCompletions)
    .where(dupWhere)
    .limit(1);
  if (dup.length > 0) {
    return Response.json(
      {
        error:
          task.repeat === "once"
            ? "这个任务已经提交过了，等 TA 确认吧"
            : "今天已经打过卡啦",
      },
      { status: 400 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "请求格式错误" }, { status: 400 });
  }

  const noteRaw = form.get("note");
  const note =
    typeof noteRaw === "string" && noteRaw.trim() ? noteRaw.trim() : null;

  const env = await getEnv();

  let proofKey: string | null = null;
  const photo = form.get("photo");
  if (photo instanceof File && photo.size > 0) {
    const imageType = resolveImageType(photo.type);
    if (!imageType) {
      return Response.json(
        { error: "只支持 jpg / png / webp / heic 图片" },
        { status: 400 },
      );
    }
    if (photo.size > 8 * 1024 * 1024) {
      return Response.json({ error: "图片不能超过 8MB" }, { status: 400 });
    }
    proofKey = `proofs/${id}/${nanoid()}.${imageType.ext}`;
    // 扩展名和 contentType 都取白名单推导出的值，不用客户端原始字符串
    await env.PHOTOS.put(proofKey, await photo.arrayBuffer(), {
      httpMetadata: { contentType: imageType.contentType },
    });
  }

  const completion = {
    id: nanoid(),
    taskId: id,
    completedBy: session.userId,
    dayKey: today,
    note,
    proofKey,
    status: "pending" as const,
    createdAt: new Date(),
  };
  // 并发双击时上面的查重会同时放行两条，由 completions_active_uniq 兜底：
  // 冲突的那条不插入，returning 为空
  const inserted = await db
    .insert(taskCompletions)
    .values(completion)
    .onConflictDoNothing()
    .returning({ id: taskCompletions.id });
  if (inserted.length === 0) {
    if (proofKey) {
      // 没落库就删掉刚上传的图，不在 R2 里留孤儿对象
      await env.PHOTOS.delete(proofKey).catch(() => {});
    }
    return Response.json(
      { error: "已经提交过啦，等 TA 确认吧" },
      { status: 400 },
    );
  }

  return Response.json({ completion }, { status: 201 });
}
