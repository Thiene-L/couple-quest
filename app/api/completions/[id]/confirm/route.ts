import { getCloudflareContext } from "@opennextjs/cloudflare";
import { and, eq } from "drizzle-orm";
import { pointLedger, taskCompletions, tasks } from "@/db/schema";
import { getDb } from "@/lib/db";
import { ledgerRow } from "@/lib/points";
import { notifyInBackground } from "@/lib/push";
import { getSession, unauthorizedResponse } from "@/lib/session";

// POST /api/completions/[id]/confirm：确认对方的完成记录，记分；once 任务同时关闭
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
    return Response.json({ error: "不能确认自己提交的记录" }, { status: 403 });
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

  // 条件更新：只有把 pending 改成 confirmed 的那次请求才算数，
  // 并发的第二次请求改不到行，returning 为空，直接出局不记账
  const confirmed = await db
    .update(taskCompletions)
    .set({
      status: "confirmed",
      confirmedBy: session.userId,
      confirmedAt: new Date(),
    })
    .where(
      and(eq(taskCompletions.id, id), eq(taskCompletions.status, "pending")),
    )
    .returning({ id: taskCompletions.id });
  if (confirmed.length === 0) {
    return Response.json({ error: "这条打卡已经处理过了" }, { status: 400 });
  }

  // dedupeKey + 唯一索引：同一条打卡的分永远只入账一次
  const addPoints = db
    .insert(pointLedger)
    .values(
      ledgerRow({
        userId: completion.completedBy,
        delta: task.points,
        reason: `完成任务：${task.title}`,
        refType: "task",
        refId: completion.id,
        dedupeKey: `task:${completion.id}`,
      }),
    )
    .onConflictDoNothing();

  // once 任务确认后关闭，和记分放同一个 batch
  if (task.repeat === "once") {
    await db.batch([
      addPoints,
      db.update(tasks).set({ status: "done" }).where(eq(tasks.id, task.id)),
    ]);
  } else {
    await db.batch([addPoints]);
  }

  // 记分之后再通知完成者；抢输的那次请求在上面的条件更新处已经出局
  // 路由第二个参数已经叫 ctx，这里把 Cloudflare 的 ctx 换个名字
  const { ctx: cfCtx } = await getCloudflareContext({ async: true });
  await notifyInBackground(cfCtx, completion.completedBy, {
    title: `${session.displayName} 确认了你的打卡`,
    body: `${task.title} · +${task.points} 分到手 🎉`,
    url: "/ledger",
  });

  return Response.json({ ok: true });
}
