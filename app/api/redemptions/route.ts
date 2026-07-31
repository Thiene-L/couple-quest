import { desc, eq } from "drizzle-orm";
import { redemptions, rewards } from "@/db/schema";
import { getDb } from "@/lib/db";
import { getSession, unauthorizedResponse } from "@/lib/session";
import { getAllUsers } from "@/lib/users";

// GET /api/redemptions：两人全部兑换记录，倒序；awaitingMe=等我兑现的单
export async function GET() {
  const session = await getSession();
  if (!session) return unauthorizedResponse();

  const db = await getDb();
  const rows = await db
    .select({
      id: redemptions.id,
      rewardId: redemptions.rewardId,
      redeemedBy: redemptions.redeemedBy,
      cost: redemptions.cost,
      status: redemptions.status,
      createdAt: redemptions.createdAt,
      fulfilledAt: redemptions.fulfilledAt,
      rewardTitle: rewards.title,
      ownerId: rewards.ownerId,
    })
    .from(redemptions)
    .innerJoin(rewards, eq(redemptions.rewardId, rewards.id))
    .orderBy(desc(redemptions.createdAt));

  // 只有两个人，直接查全量用户映射 displayName，省掉双别名 join
  const allUsers = await getAllUsers(db);
  const nameOf = (id: string) =>
    allUsers.find((u) => u.id === id)?.displayName ?? "";

  return Response.json({
    redemptions: rows.map((r) => ({
      ...r,
      redeemerName: nameOf(r.redeemedBy),
      ownerName: nameOf(r.ownerId),
      mine: r.redeemedBy === session.userId,
      awaitingMe: r.status === "pending" && r.ownerId === session.userId,
    })),
  });
}
