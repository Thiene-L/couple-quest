import { eq } from "drizzle-orm";
import { rewards } from "@/db/schema";
import { getDb } from "@/lib/db";
import { getSession, unauthorizedResponse } from "@/lib/session";

// DELETE /api/rewards/[id]：下架奖励（软删，active=false），仅提供者本人可操作
export async function DELETE(
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

  if (!reward || !reward.active) {
    return Response.json({ error: "奖励不存在或已下架" }, { status: 404 });
  }
  if (reward.ownerId !== session.userId) {
    return Response.json(
      { error: "只能下架自己提供的奖励" },
      { status: 403 },
    );
  }

  await db.update(rewards).set({ active: false }).where(eq(rewards.id, id));
  return Response.json({ ok: true });
}
