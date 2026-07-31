import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { pointLedger } from "@/db/schema";
import type { Db } from "@/lib/db";

// 余额永远由账本求和得出，不存冗余字段
export async function getBalance(db: Db, userId: string): Promise<number> {
  const rows = await db
    .select({
      total: sql<number>`coalesce(sum(${pointLedger.delta}), 0)`,
    })
    .from(pointLedger)
    .where(eq(pointLedger.userId, userId));
  return rows[0]?.total ?? 0;
}

export interface LedgerEntryInput {
  userId: string;
  delta: number;
  reason: string;
  refType: "task" | "redemption" | "adjust";
  refId?: string;
  // 幂等键；给定后同一笔账重复写入会被唯一索引挡掉
  dedupeKey?: string;
}

// 组装一行账本记录（配合 db.batch 使用可保证多写原子性）
export function ledgerRow(input: LedgerEntryInput) {
  return {
    id: nanoid(),
    userId: input.userId,
    delta: input.delta,
    reason: input.reason,
    refType: input.refType,
    refId: input.refId ?? null,
    dedupeKey: input.dedupeKey ?? null,
    createdAt: new Date(),
  };
}

export async function addLedgerEntry(
  db: Db,
  input: LedgerEntryInput,
): Promise<void> {
  await db.insert(pointLedger).values(ledgerRow(input));
}
