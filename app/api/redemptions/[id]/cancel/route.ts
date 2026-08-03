import { getCloudflareContext } from "@opennextjs/cloudflare";
import { and, eq } from "drizzle-orm";
import { pointLedger, redemptions, rewards } from "@/db/schema";
import { getDb } from "@/lib/db";
import { ledgerRow } from "@/lib/points";
import { notifyInBackground } from "@/lib/push";
import { getSession, unauthorizedResponse } from "@/lib/session";

// POST /api/redemptions/[id]/cancel：兑换人本人取消 pending 兑换并退回积分
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return unauthorizedResponse();

  const { id } = await ctx.params;
  const db = await getDb();
  const rows = await db
    .select({
      id: redemptions.id,
      redeemedBy: redemptions.redeemedBy,
      cost: redemptions.cost,
      status: redemptions.status,
      ownerId: rewards.ownerId,
      rewardTitle: rewards.title,
    })
    .from(redemptions)
    .innerJoin(rewards, eq(redemptions.rewardId, rewards.id))
    .where(eq(redemptions.id, id))
    .limit(1);
  const record = rows[0];

  if (!record) {
    return Response.json({ error: "兑换记录不存在" }, { status: 404 });
  }
  if (record.redeemedBy !== session.userId) {
    return Response.json({ error: "只能取消自己的兑换" }, { status: 403 });
  }
  // 友好提示，真正的并发保护是下面的条件更新
  if (record.status !== "pending") {
    return Response.json(
      { error: "这笔兑换已处理，不能取消了" },
      { status: 400 },
    );
  }

  // 只有把 pending 改成 cancelled 的那次请求才继续退款；双击的第二次请求、
  // 以及和 fulfill 抢同一笔单子时的败者，在这里拿到空数组直接出局
  const cancelled = await db
    .update(redemptions)
    .set({ status: "cancelled" })
    .where(and(eq(redemptions.id, id), eq(redemptions.status, "pending")))
    .returning({ id: redemptions.id });

  if (cancelled.length === 0) {
    return Response.json(
      { error: "这笔兑换已经处理过了" },
      { status: 400 },
    );
  }

  // 退款账本带幂等键，唯一索引 + onConflictDoNothing 保证一笔兑换只退一次分
  await db
    .insert(pointLedger)
    .values(
      ledgerRow({
        userId: session.userId,
        delta: record.cost,
        reason: `取消兑换：${record.rewardTitle}`,
        refType: "redemption",
        refId: record.id,
        dedupeKey: `refund:${record.id}`,
      }),
    )
    .onConflictDoNothing();

  // 状态改成 cancelled、分也退回之后才通知奖励提供者；被并发挤掉的请求上面已返回。
  // 取消的是兑换人本人，和提供者必然不是同一个人
  const { ctx: cfCtx } = await getCloudflareContext({ async: true });
  await notifyInBackground(cfCtx, record.ownerId, {
    title: `${session.displayName} 取消了兑换`,
    body: `${record.rewardTitle} · ${record.cost} 分已退回`,
    url: "/store",
  });

  return Response.json({ ok: true });
}
