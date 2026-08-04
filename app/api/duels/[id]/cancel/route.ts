import { and, eq } from "drizzle-orm";
import { duels } from "@/db/schema";
import { getDb } from "@/lib/db";
import { getSession, unauthorizedResponse } from "@/lib/session";

// POST /api/duels/[id]/cancel：发起方撤回还没人应战的对局
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return unauthorizedResponse();

  const { id } = await ctx.params;
  const db = await getDb();
  const duel = (
    await db.select().from(duels).where(eq(duels.id, id)).limit(1)
  )[0];

  if (!duel) {
    return Response.json({ error: "这局对战不存在" }, { status: 404 });
  }
  if (duel.challengerId !== session.userId) {
    return Response.json({ error: "只能撤回自己发起的挑战" }, { status: 403 });
  }
  // 友好提示，真正的并发保护是下面的条件更新
  if (duel.status !== "pending") {
    return Response.json({ error: "这局已经打完啦" }, { status: 400 });
  }

  // 和对方的 respond 抢同一局时，改不到行的那次直接出局：
  // 不会出现「既撤回又结算」，赌注也就不会转错
  const cancelled = await db
    .update(duels)
    .set({ status: "cancelled" })
    .where(and(eq(duels.id, id), eq(duels.status, "pending")))
    .returning({ id: duels.id });

  if (cancelled.length === 0) {
    return Response.json({ error: "这局已经打完啦" }, { status: 400 });
  }

  return Response.json({ ok: true });
}
