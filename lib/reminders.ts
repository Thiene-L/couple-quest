import { and, eq, lt, ne } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import {
  dailyAnswers,
  dailyQuestions,
  milestones,
  reminderLog,
  taskCompletions,
  tasks,
  users,
} from "@/db/schema";
import * as schema from "@/db/schema";
import { daysUntil, todayLocal } from "@/lib/dates";
import { sendPushTo } from "@/lib/push";

// 定时任务跑在 scheduled 处理器里，拿不到请求上下文，
// 所以这里直接用 env 建连接，不能走 getCloudflareContext
export async function runReminders(env: CloudflareEnv): Promise<void> {
  const db = drizzle(env.DB, { schema });
  const today = todayLocal();

  // 同一天同一类提醒只发一次：cron 每小时跑，靠这张表去重
  async function once(key: string, fn: () => Promise<void>): Promise<void> {
    const inserted = await db
      .insert(reminderLog)
      .values({ key, sentAt: new Date() })
      .onConflictDoNothing()
      .returning({ key: reminderLog.key });
    if (inserted.length > 0) await fn();
  }

  const allUsers = await db.select().from(users);
  if (allUsers.length === 0) return;

  // 1. 纪念日当天提醒（每人各发一条）
  const stones = await db.select().from(milestones);
  for (const m of stones) {
    if (m.kind === "together") continue;
    const left = daysUntil(m.date, m.kind as "anniversary" | "countdown", today);
    if (left !== 0) continue;
    for (const u of allUsers) {
      await once(`milestone:${m.id}:${today}:${u.id}`, () =>
        sendPushTo(env, db, u.id, {
          title: `${m.emoji ?? "🎉"} 今天是${m.title}`,
          body: "别忘了跟 TA 说点什么",
          url: "/tasks",
        }),
      );
    }
  }

  // 2. 每日一问：今天的题还没答就提醒（只提醒没答的那个人）
  const q = (
    await db
      .select()
      .from(dailyQuestions)
      .where(eq(dailyQuestions.dayKey, today))
      .limit(1)
  )[0];
  if (q) {
    const answered = await db
      .select({ userId: dailyAnswers.userId })
      .from(dailyAnswers)
      .where(eq(dailyAnswers.questionId, q.id));
    const answeredIds = new Set(answered.map((a) => a.userId));
    for (const u of allUsers) {
      if (answeredIds.has(u.id)) continue;
      await once(`daily-q:${today}:${u.id}`, () =>
        sendPushTo(env, db, u.id, {
          title: "今天的问题还没答",
          body: q.question,
          url: "/daily",
        }),
      );
    }
  }

  // 3. 每日任务未完成提醒
  const openDaily = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.status, "open"), eq(tasks.repeat, "daily")));
  for (const t of openDaily) {
    const done = await db
      .select({ id: taskCompletions.id })
      .from(taskCompletions)
      .where(
        and(
          eq(taskCompletions.taskId, t.id),
          eq(taskCompletions.dayKey, today),
          ne(taskCompletions.status, "rejected"),
        ),
      )
      .limit(1);
    if (done.length > 0) continue;
    await once(`daily-task:${t.id}:${today}`, () =>
      sendPushTo(env, db, t.assigneeId, {
        title: "今天还有件事没做",
        body: `${t.title} · ${t.points} 分`,
        url: "/tasks",
      }),
    );
  }

  // 4. 待确认超过 24 小时，催一下确认方
  const stale = await db
    .select({
      id: taskCompletions.id,
      taskTitle: tasks.title,
      creatorId: tasks.creatorId,
      completedBy: taskCompletions.completedBy,
    })
    .from(taskCompletions)
    .innerJoin(tasks, eq(taskCompletions.taskId, tasks.id))
    .where(
      and(
        eq(taskCompletions.status, "pending"),
        lt(taskCompletions.createdAt, new Date(Date.now() - 24 * 3600_000)),
      ),
    );
  for (const c of stale) {
    if (c.creatorId === c.completedBy) continue;
    await once(`stale-confirm:${c.id}:${today}`, () =>
      sendPushTo(env, db, c.creatorId, {
        title: "有个打卡等你确认好久了",
        body: `${c.taskTitle} · 去看看吧`,
        url: "/tasks",
      }),
    );
  }
}
