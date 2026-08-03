import { getCloudflareContext } from "@opennextjs/cloudflare";
import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { pointLedger, redemptions, rewards } from "@/db/schema";
import { getDb } from "@/lib/db";
import { notifyInBackground } from "@/lib/push";
import { getSession, unauthorizedResponse } from "@/lib/session";

// POST /api/rewards/[id]/redeem：兑换对方提供的奖励，下单即扣分
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return unauthorizedResponse();

  const { id } = await ctx.params;
  const db = await getDb();
  const rows = await db
    .select()
    .from(rewards)
    .where(eq(rewards.id, id))
    .limit(1);
  const reward = rows[0];

  // 这两条只负责给用户友好提示，扣分的并发正确性由下面的条件写入保证
  if (!reward || !reward.active) {
    return Response.json({ error: "奖励不存在或已下架" }, { status: 404 });
  }
  if (reward.ownerId === session.userId) {
    return Response.json(
      { error: "不能兑换自己提供的奖励哦" },
      { status: 400 },
    );
  }

  const redemptionId = nanoid();
  const ledgerId = nanoid();
  const now = new Date();

  // 余额判断和扣分写在同一条语句里：WHERE 里的求和与插入在同一次执行中完成，
  // 余额不够时一行都不会写。并发兑换只会有一笔通过，积分不会被透支成负数
  const deducted = await db.run(sql`
    insert into point_ledger (id, user_id, delta, reason, ref_type, ref_id, dedupe_key, created_at)
    select ${ledgerId}, ${session.userId}, ${-reward.cost}, ${`兑换：${reward.title}`},
           'redemption', ${redemptionId}, ${`redeem:${redemptionId}`}, ${now.getTime()}
    where (
      select coalesce(sum(delta), 0) from point_ledger where user_id = ${session.userId}
    ) >= ${reward.cost}
  `);

  // 一行没写进去 = WHERE 不成立 = 余额不足
  if ((deducted.meta?.changes ?? 0) === 0) {
    return Response.json({ error: "积分不够哦" }, { status: 400 });
  }

  try {
    await db.insert(redemptions).values({
      id: redemptionId,
      rewardId: reward.id,
      redeemedBy: session.userId,
      cost: reward.cost, // 快照，之后商店改价不影响这单
      status: "pending",
      createdAt: now,
      fulfilledAt: null,
    });
  } catch {
    // 分扣了但兑换单没落库：补偿删掉刚写的那条账本，避免扣了分没单子
    try {
      await db.delete(pointLedger).where(eq(pointLedger.id, ledgerId));
    } catch {
      // 补偿也失败时不再抛错覆盖原始失败，这条账本留给人工对账
    }
    return Response.json({ error: "兑换失败，请重试" }, { status: 500 });
  }

  // 扣分和兑换单都落库之后才通知奖励提供者；上面补偿回滚的分支已经提前返回。
  // 兑换人不可能是提供者本人（上面 400 拦掉了），不会给自己发
  const { ctx: cfCtx } = await getCloudflareContext({ async: true });
  await notifyInBackground(cfCtx, reward.ownerId, {
    title: `${session.displayName} 兑换了奖励`,
    body: `${reward.title} · 花了 ${reward.cost} 分，等你兑现`,
    url: "/store",
  });

  return Response.json({ ok: true, redemptionId });
}
