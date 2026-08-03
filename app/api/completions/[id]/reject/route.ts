import { getCloudflareContext } from "@opennextjs/cloudflare";
import { and, eq } from "drizzle-orm";
import { taskCompletions, tasks } from "@/db/schema";
import { getDb } from "@/lib/db";
import { notifyInBackground } from "@/lib/push";
import { getSession, unauthorizedResponse } from "@/lib/session";

// POST /api/completions/[id]/reject：打回对方的完成记录，不记分；daily 当天可重新提交
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return unauthorizedResponse();

  const { id } = await ctx.params;
  const db = await getDb();

  const completion = (
    await db
      .select()
      .from(taskCompletions)
      .where(eq(taskCompletions.id, id))
      .limit(1)
  )[0];
  if (!completion) {
    return Response.json({ error: "完成记录不存在" }, { status: 404 });
  }
  if (completion.completedBy === session.userId) {
    return Response.json({ error: "不能打回自己提交的记录" }, { status: 403 });
  }

  const task = (
    await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, completion.taskId))
      .limit(1)
  )[0];
  if (!task) {
    return Response.json({ error: "任务不存在" }, { status: 404 });
  }
  // 只有任务的创建者或执行者能处理这条打卡
  if (task.creatorId !== session.userId && task.assigneeId !== session.userId) {
    return Response.json({ error: "无权处理这条打卡" }, { status: 403 });
  }

  // 条件更新：只有把 pending 改成 rejected 的那次请求才算数，
  // 并发的第二次请求改不到行，returning 为空
  const rejected = await db
    .update(taskCompletions)
    .set({
      status: "rejected",
      confirmedBy: session.userId,
      confirmedAt: new Date(),
    })
    .where(
      and(eq(taskCompletions.id, id), eq(taskCompletions.status, "pending")),
    )
    .returning({ id: taskCompletions.id });
  if (rejected.length === 0) {
    return Response.json({ error: "这条打卡已经处理过了" }, { status: 400 });
  }

  // 打回真正生效后再通知完成者；抢输的那次请求在上面的条件更新处已经出局
  // 路由第二个参数已经叫 ctx，这里把 Cloudflare 的 ctx 换个名字
  const { ctx: cfCtx } = await getCloudflareContext({ async: true });
  await notifyInBackground(cfCtx, completion.completedBy, {
    title: `${session.displayName} 把打卡打回了`,
    body: `${task.title} · 再补个证据吧`,
    url: "/tasks",
  });

  return Response.json({ ok: true });
}
