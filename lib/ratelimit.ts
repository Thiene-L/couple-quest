import { eq } from "drizzle-orm";
import { loginAttempts } from "@/db/schema";
import type { Db } from "@/lib/db";

const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 8;

// 登录失败次数计数，放 D1（KV 免费版每天只有 1000 次写）
export async function isLocked(db: Db, key: string): Promise<boolean> {
  const rows = await db
    .select()
    .from(loginAttempts)
    .where(eq(loginAttempts.key, key))
    .limit(1);
  const row = rows[0];
  if (!row) return false;
  if (Date.now() - row.windowStartedAt.getTime() > WINDOW_MS) return false;
  return row.failures >= MAX_FAILURES;
}

export async function recordFailure(db: Db, key: string): Promise<void> {
  const now = new Date();
  const rows = await db
    .select()
    .from(loginAttempts)
    .where(eq(loginAttempts.key, key))
    .limit(1);
  const row = rows[0];

  if (!row || Date.now() - row.windowStartedAt.getTime() > WINDOW_MS) {
    await db
      .insert(loginAttempts)
      .values({ key, failures: 1, windowStartedAt: now })
      .onConflictDoUpdate({
        target: loginAttempts.key,
        set: { failures: 1, windowStartedAt: now },
      });
    return;
  }

  await db
    .update(loginAttempts)
    .set({ failures: row.failures + 1 })
    .where(eq(loginAttempts.key, key));
}

export async function clearFailures(db: Db, key: string): Promise<void> {
  await db.delete(loginAttempts).where(eq(loginAttempts.key, key));
}

export function clientKey(req: Request): string {
  return req.headers.get("cf-connecting-ip") ?? "unknown-ip";
}
