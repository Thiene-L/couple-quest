import { eq } from "drizzle-orm";
import { tasks } from "@/db/schema";
import { getDb } from "@/lib/db";
import { getSession, unauthorizedResponse } from "@/lib/session";

// DELETE /api/tasks/[id]：仅创建者可归档（软删，status=archived）
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return unauthorizedResponse();

  const { id } = await ctx.params;
  const db = await getDb();

  const task = (
    await db.select().from(tasks).where(eq(tasks.id, id)).limit(1)
  )[0];
  if (!task) {
    return Response.json({ error: "任务不存在" }, { status: 404 });
  }
  if (task.creatorId !== session.userId) {
    return Response.json(
      { error: "只有创建者才能归档这个任务" },
      { status: 403 },
    );
  }

  await db.update(tasks).set({ status: "archived" }).where(eq(tasks.id, id));

  return Response.json({ ok: true });
}
