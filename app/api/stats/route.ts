import { and, eq, isNotNull, sql } from "drizzle-orm";
import {
  dailyAnswers,
  dailyQuestions,
  duels,
  milestones,
  pokes,
  redemptions,
  taskCompletions,
} from "@/db/schema";
import { type AchievementStat, evaluate } from "@/lib/achievements";
import { daysBetween, todayLocal } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { getSession, unauthorizedResponse } from "@/lib/session";
import { getAnswerStreak, getTaskStreak } from "@/lib/streaks";

// GET /api/stats：首页火花条和成就页共用的一份统计。
// 统计口径是「两个人加起来」，不区分是谁做的
export async function GET() {
  const session = await getSession();
  if (!session) return unauthorizedResponse();

  const db = await getDb();
  const today = todayLocal();

  const [
    taskStreak,
    answerStreak,
    confirmedRows,
    photoRows,
    bothAnsweredRows,
    redemptionRows,
    duelRows,
    pokeRows,
    togetherRows,
  ] = await Promise.all([
    getTaskStreak(db),
    getAnswerStreak(db),
    db
      .select({ n: sql<number>`count(*)` })
      .from(taskCompletions)
      .where(eq(taskCompletions.status, "confirmed")),
    db
      .select({ n: sql<number>`count(*)` })
      .from(taskCompletions)
      .where(
        and(
          eq(taskCompletions.status, "confirmed"),
          isNotNull(taskCompletions.proofKey),
        ),
      ),
    // 两个人都答了才算这一天：答案表本身没有日期，按题目所在的 dayKey 分组
    db
      .select({ dayKey: dailyQuestions.dayKey })
      .from(dailyAnswers)
      .innerJoin(dailyQuestions, eq(dailyAnswers.questionId, dailyQuestions.id))
      .groupBy(dailyQuestions.dayKey)
      .having(sql`count(distinct ${dailyAnswers.userId}) >= 2`),
    db
      .select({ n: sql<number>`count(*)` })
      .from(redemptions)
      .where(eq(redemptions.status, "fulfilled")),
    db
      .select({ n: sql<number>`count(*)` })
      .from(duels)
      .where(eq(duels.status, "settled")),
    db.select({ n: sql<number>`count(*)` }).from(pokes),
    db
      .select({ date: milestones.date })
      .from(milestones)
      .where(eq(milestones.kind, "together"))
      .limit(1),
  ]);

  const togetherDate = togetherRows[0]?.date;
  const stat: AchievementStat = {
    confirmedCompletions: confirmedRows[0]?.n ?? 0,
    photoCount: photoRows[0]?.n ?? 0,
    taskStreakBest: taskStreak.best,
    answerStreakBest: answerStreak.best,
    bothAnsweredDays: bothAnsweredRows.length,
    redemptionsFulfilled: redemptionRows[0]?.n ?? 0,
    duelsPlayed: duelRows[0]?.n ?? 0,
    pokesSent: pokeRows[0]?.n ?? 0,
    daysTogether: togetherDate ? daysBetween(togetherDate, today) : 0,
  };

  return Response.json({
    taskStreak,
    answerStreak,
    achievements: evaluate(stat),
    stat,
  });
}
