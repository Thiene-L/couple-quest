import { eq } from "drizzle-orm";
import { milestones } from "@/db/schema";
import { getDb } from "@/lib/db";
import { getSession, unauthorizedResponse } from "@/lib/session";

// DELETE /api/milestones/[id]：删除纪念日。纪念日是两个人共同的，谁都能删
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return unauthorizedResponse();

  const { id } = await ctx.params;
  const db = await getDb();
  const rows = await db
    .select({ id: milestones.id })
    .from(milestones)
    .where(eq(milestones.id, id))
    .limit(1);
  if (!rows[0]) {
    return Response.json({ error: "纪念日不存在或已删除" }, { status: 404 });
  }

  await db.delete(milestones).where(eq(milestones.id, id));
  return Response.json({ ok: true });
}
