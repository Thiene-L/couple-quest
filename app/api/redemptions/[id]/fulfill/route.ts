import { and, eq } from "drizzle-orm";
import { redemptions, rewards } from "@/db/schema";
import { getDb } from "@/lib/db";
import { getSession, unauthorizedResponse } from "@/lib/session";

// POST /api/redemptions/[id]/fulfill：奖励提供者兑现一笔 pending 兑换
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
      status: redemptions.status,
      ownerId: rewards.ownerId,
    })
    .from(redemptions)
    .innerJoin(rewards, eq(redemptions.rewardId, rewards.id))
    .where(eq(redemptions.id, id))
    .limit(1);
  const record = rows[0];

  if (!record) {
    return Response.json({ error: "兑换记录不存在" }, { status: 404 });
  }
  if (record.ownerId !== session.userId) {
    return Response.json({ error: "只有奖励提供者才能兑现" }, { status: 403 });
  }
  // 友好提示，真正的并发保护是下面的条件更新
  if (record.status !== "pending") {
    return Response.json(
      { error: "这笔兑换不在等待兑现状态" },
      { status: 400 },
    );
  }

  // 只改 pending 的那一行：双击的第二次请求、以及和 cancel 抢同一笔单子时的
  // 败者，在这里拿到空数组，不会出现「既兑现又退款」
  const fulfilled = await db
    .update(redemptions)
    .set({ status: "fulfilled", fulfilledAt: new Date() })
    .where(and(eq(redemptions.id, id), eq(redemptions.status, "pending")))
    .returning({ id: redemptions.id });

  if (fulfilled.length === 0) {
    return Response.json(
      { error: "这笔兑换已经处理过了" },
      { status: 400 },
    );
  }

  return Response.json({ ok: true });
}
