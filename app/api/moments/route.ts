import { desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { taskCompletions, tasks, users } from "@/db/schema";
import { getDb } from "@/lib/db";
import { getSession, unauthorizedResponse } from "@/lib/session";

const MAX_MOMENTS = 200;

// GET /api/moments：已确认的打卡记录（时光轴），按时间倒序，最多 200 条。
// 没拍照的打卡也是一个瞬间，只是 proofKey 为 null
export async function GET() {
  const session = await getSession();
  if (!session) return unauthorizedResponse();

  const db = await getDb();
  const completer = alias(users, "completer");

  const [moments, statRows] = await Promise.all([
    db
      .select({
        id: taskCompletions.id,
        taskTitle: tasks.title,
        points: tasks.points,
        completedByName: completer.displayName,
        completedById: taskCompletions.completedBy,
        note: taskCompletions.note,
        proofKey: taskCompletions.proofKey,
        confirmedAt: taskCompletions.confirmedAt,
        createdAt: taskCompletions.createdAt,
      })
      .from(taskCompletions)
      .innerJoin(tasks, eq(taskCompletions.taskId, tasks.id))
      .innerJoin(completer, eq(taskCompletions.completedBy, completer.id))
      .where(eq(taskCompletions.status, "confirmed"))
      .orderBy(desc(taskCompletions.createdAt))
      .limit(MAX_MOMENTS),
    // 统计走全量聚合，不受上面 200 条截断影响；有照片 = proof_key 非空字符串
    db
      .select({
        total: sql<number>`count(*)`,
        withPhoto: sql<number>`sum(case when ${taskCompletions.proofKey} is not null and ${taskCompletions.proofKey} <> '' then 1 else 0 end)`,
        firstAt: sql<number | null>`min(${taskCompletions.createdAt})`,
      })
      .from(taskCompletions)
      .where(eq(taskCompletions.status, "confirmed")),
  ]);

  const stat = statRows[0];
  const firstAt = stat?.firstAt ?? null;

  return Response.json({
    moments,
    stats: {
      total: Number(stat?.total ?? 0),
      withPhoto: Number(stat?.withPhoto ?? 0),
      firstAt: firstAt === null ? null : new Date(firstAt).toISOString(),
    },
  });
}
