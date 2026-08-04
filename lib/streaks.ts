import { and, eq, gte } from "drizzle-orm";
import { dailyAnswers, dailyQuestions, taskCompletions } from "@/db/schema";
import type { Db } from "@/lib/db";
import { todayLocal } from "@/lib/dates";

export interface Streak {
  current: number;
  best: number;
  // 今天是否已经续上，用来决定要不要提醒「别断了」
  activeToday: boolean;
}

function dayKeyOf(offsetDays: number, today = todayLocal()): string {
  const base = new Date(`${today}T00:00:00Z`).getTime();
  return new Date(base + offsetDays * 86400_000).toISOString().slice(0, 10);
}

// 从今天（或昨天）往回数连续的天数。
// 允许从昨天起算：今天还没做不代表断了，得等今天过完
function measure(days: Set<string>, today: string): Streak {
  const activeToday = days.has(today);
  let current = 0;
  if (activeToday || days.has(dayKeyOf(-1, today))) {
    let i = activeToday ? 0 : -1;
    while (days.has(dayKeyOf(i, today))) {
      current += 1;
      i -= 1;
    }
  }

  // 历史最长：按日期排序后扫一遍
  const sorted = [...days].sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    if (prev !== null) {
      const gap =
        (new Date(`${d}T00:00:00Z`).getTime() -
          new Date(`${prev}T00:00:00Z`).getTime()) /
        86400_000;
      run = gap === 1 ? run + 1 : 1;
    } else {
      run = 1;
    }
    if (run > best) best = run;
    prev = d;
  }

  return { current, best: Math.max(best, current), activeToday };
}

// 只看最近 400 天，够算火花也不至于全表扫
function windowStart(today: string): Date {
  return new Date(new Date(`${today}T00:00:00Z`).getTime() - 400 * 86400_000);
}

// 任务打卡火花：两个人任意一人当天有确认过的打卡就算续上
export async function getTaskStreak(db: Db): Promise<Streak> {
  const today = todayLocal();
  const rows = await db
    .select({ dayKey: taskCompletions.dayKey })
    .from(taskCompletions)
    .where(
      and(
        eq(taskCompletions.status, "confirmed"),
        gte(taskCompletions.createdAt, windowStart(today)),
      ),
    );
  return measure(new Set(rows.map((r) => r.dayKey)), today);
}

// 每日一问火花：两个人都答了才算这一天续上
export async function getAnswerStreak(db: Db): Promise<Streak> {
  const today = todayLocal();
  // 日期在题目表上，答案表只有 questionId
  const rows = await db
    .select({ dayKey: dailyQuestions.dayKey, userId: dailyAnswers.userId })
    .from(dailyAnswers)
    .innerJoin(dailyQuestions, eq(dailyAnswers.questionId, dailyQuestions.id))
    .where(gte(dailyAnswers.createdAt, windowStart(today)));

  const byDay = new Map<string, Set<string>>();
  for (const r of rows) {
    const s = byDay.get(r.dayKey) ?? new Set<string>();
    s.add(r.userId);
    byDay.set(r.dayKey, s);
  }
  const bothDays = new Set(
    [...byDay.entries()].filter(([, u]) => u.size >= 2).map(([d]) => d),
  );
  return measure(bothDays, today);
}
