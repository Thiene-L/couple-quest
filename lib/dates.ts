// 纪念日按「哪一天」算，不按时间戳，避免时区把日期算偏。
// 全应用统一用 Asia/Shanghai。

export const TZ_OFFSET_MS = 8 * 3600_000;

/** Asia/Shanghai 的今天，YYYY-MM-DD */
export function todayLocal(now: Date = new Date()): string {
  return new Date(now.getTime() + TZ_OFFSET_MS).toISOString().slice(0, 10);
}

/** YYYY-MM-DD 是否合法 */
export function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function toUTCDays(s: string): number {
  return Math.floor(new Date(`${s}T00:00:00Z`).getTime() / 86400_000);
}

/** from 到 to 相差几天（to 在后为正） */
export function daysBetween(from: string, to: string): number {
  return toUTCDays(to) - toUTCDays(from);
}

/**
 * 距离下一次发生还有几天。
 * anniversary 每年重复，取今年或明年的同月日；countdown 只算一次，过期返回负数。
 */
export function daysUntil(
  date: string,
  kind: "anniversary" | "countdown",
  today: string = todayLocal(),
): number {
  if (kind === "countdown") return daysBetween(today, date);

  const [, mm, dd] = date.split("-");
  const thisYear = today.slice(0, 4);
  const candidate = `${thisYear}-${mm}-${dd}`;
  const diff = daysBetween(today, candidate);
  if (diff >= 0) return diff;
  const nextYear = String(Number(thisYear) + 1);
  return daysBetween(today, `${nextYear}-${mm}-${dd}`);
}

/** 每年重复的纪念日，下一次是第几周年（在一起那天为第 0 年） */
export function anniversaryOrdinal(
  date: string,
  today: string = todayLocal(),
): number {
  const startYear = Number(date.slice(0, 4));
  const [, mm, dd] = date.split("-");
  const thisYear = Number(today.slice(0, 4));
  const passedThisYear = daysBetween(today, `${thisYear}-${mm}-${dd}`) >= 0;
  return (passedThisYear ? thisYear : thisYear + 1) - startYear;
}
