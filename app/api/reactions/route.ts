import { getCloudflareContext } from "@opennextjs/cloudflare";
import { and, asc, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  dailyAnswers,
  reactions,
  taskCompletions,
  tasks,
  users,
} from "@/db/schema";
import { getDb } from "@/lib/db";
import type { Db } from "@/lib/db";
import { notifyInBackground } from "@/lib/push";
import { getSession, unauthorizedResponse } from "@/lib/session";

// 可选表情固定六个，别的一律不收
const EMOJIS = ["❤️", "😍", "😂", "👏", "🔥", "🥺"] as const;
const TARGET_TYPES = ["completion", "answer"] as const;

type TargetType = (typeof TARGET_TYPES)[number];

// 一次批量查询的目标上限
const MAX_TARGET_IDS = 100;

function isTargetType(v: unknown): v is TargetType {
  return (
    typeof v === "string" && (TARGET_TYPES as readonly string[]).includes(v)
  );
}

function isEmoji(v: unknown): v is string {
  return typeof v === "string" && (EMOJIS as readonly string[]).includes(v);
}

interface TargetInfo {
  /** 目标是谁的东西，用来挡「给自己贴」和决定通知谁 */
  ownerId: string;
  /** 通知正文：打卡取任务标题，答案取固定文案 */
  label: string;
  url: string;
}

// 查目标归属；目标不存在返回 null
async function loadTarget(
  db: Db,
  targetType: TargetType,
  targetId: string,
): Promise<TargetInfo | null> {
  if (targetType === "completion") {
    const rows = await db
      .select({
        ownerId: taskCompletions.completedBy,
        taskTitle: tasks.title,
      })
      .from(taskCompletions)
      .innerJoin(tasks, eq(taskCompletions.taskId, tasks.id))
      .where(eq(taskCompletions.id, targetId))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return { ownerId: row.ownerId, label: row.taskTitle, url: "/moments" };
  }

  const rows = await db
    .select({ ownerId: dailyAnswers.userId })
    .from(dailyAnswers)
    .where(eq(dailyAnswers.id, targetId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return { ownerId: row.ownerId, label: "今天的回答", url: "/daily" };
}

// GET /api/reactions?targetType=completion&targetIds=a,b,c
// 批量取表情，按 targetId 分组；没有表情的目标不出现在结果里
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return unauthorizedResponse();

  const params = new URL(req.url).searchParams;
  const targetType = params.get("targetType");
  if (!isTargetType(targetType)) {
    return Response.json({ error: "目标类型不对" }, { status: 400 });
  }

  const ids = Array.from(
    new Set(
      (params.get("targetIds") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  );
  if (ids.length === 0) return Response.json({ reactions: {} });
  if (ids.length > MAX_TARGET_IDS) {
    return Response.json(
      { error: `一次最多查 ${MAX_TARGET_IDS} 个目标` },
      { status: 400 },
    );
  }

  const db = await getDb();
  const rows = await db
    .select({
      targetId: reactions.targetId,
      userId: reactions.userId,
      emoji: reactions.emoji,
      userName: users.displayName,
    })
    .from(reactions)
    .innerJoin(users, eq(reactions.userId, users.id))
    .where(
      and(
        eq(reactions.targetType, targetType),
        inArray(reactions.targetId, ids),
      ),
    )
    .orderBy(asc(reactions.createdAt));

  const grouped = new Map<
    string,
    { userId: string; emoji: string; userName: string }[]
  >();
  for (const row of rows) {
    const item = {
      userId: row.userId,
      emoji: row.emoji,
      userName: row.userName,
    };
    const list = grouped.get(row.targetId);
    if (list) list.push(item);
    else grouped.set(row.targetId, [item]);
  }

  return Response.json({ reactions: Object.fromEntries(grouped) });
}

// POST /api/reactions：贴表情。同一人对同一目标只留一个，再贴是换不是叠
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return unauthorizedResponse();

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "请求格式错误" }, { status: 400 });
  }

  const targetType = body.targetType;
  const targetId =
    typeof body.targetId === "string" ? body.targetId.trim() : "";
  const emoji = body.emoji;

  if (!isTargetType(targetType)) {
    return Response.json({ error: "目标类型不对" }, { status: 400 });
  }
  if (!targetId) {
    return Response.json({ error: "缺少目标" }, { status: 400 });
  }
  if (!isEmoji(emoji)) {
    return Response.json({ error: "这个表情不在可选范围里" }, { status: 400 });
  }

  const db = await getDb();
  const target = await loadTarget(db, targetType, targetId);
  if (!target) {
    return Response.json({ error: "目标不存在" }, { status: 404 });
  }
  if (target.ownerId === session.userId) {
    return Response.json(
      { error: "给自己贴表情就没意思啦" },
      { status: 403 },
    );
  }

  // 唯一索引 (user_id, target_type, target_id) 冲突时改成新表情并刷新时间
  await db
    .insert(reactions)
    .values({
      id: nanoid(),
      userId: session.userId,
      targetType,
      targetId,
      emoji,
      createdAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [reactions.userId, reactions.targetType, reactions.targetId],
      set: { emoji, createdAt: new Date() },
    });

  const { ctx } = await getCloudflareContext({ async: true });
  await notifyInBackground(ctx, target.ownerId, {
    title: `${session.displayName} 给你贴了 ${emoji}`,
    body: target.label,
    url: target.url,
    tag: "reaction",
  });

  return Response.json({ ok: true }, { status: 201 });
}

// DELETE /api/reactions：撤掉我自己贴的那个。
// 删到 0 行只说明本来就没贴（前端可能重复点），不是错误，也没有后续动作
export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session) return unauthorizedResponse();

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "请求格式错误" }, { status: 400 });
  }

  const targetType = body.targetType;
  const targetId =
    typeof body.targetId === "string" ? body.targetId.trim() : "";
  if (!isTargetType(targetType)) {
    return Response.json({ error: "目标类型不对" }, { status: 400 });
  }
  if (!targetId) {
    return Response.json({ error: "缺少目标" }, { status: 400 });
  }

  const db = await getDb();
  const removed = await db
    .delete(reactions)
    .where(
      and(
        eq(reactions.userId, session.userId),
        eq(reactions.targetType, targetType),
        eq(reactions.targetId, targetId),
      ),
    )
    .returning({ id: reactions.id });

  return Response.json({ ok: true, removed: removed.length });
}
