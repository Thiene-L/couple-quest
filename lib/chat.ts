import { and, eq, lt } from "drizzle-orm";
import { chatRelay } from "@/db/schema";
import type { Db } from "@/lib/db";

// 一条消息最多留这么久。收件方一直不上线也不会无限堆在服务器上
export const RELAY_TTL_DAYS = 7;
export const MAX_BODY_LENGTH = 2000;
// 单次拉取上限，防一次拉爆
export const PULL_LIMIT = 200;

export function relayCutoff(now = Date.now()): Date {
  return new Date(now - RELAY_TTL_DAYS * 24 * 3600_000);
}

// 顺手清理过期消息。中转站常态应该是空的，扫描代价可忽略
export async function sweepExpired(db: Db, now = Date.now()): Promise<void> {
  await db.delete(chatRelay).where(lt(chatRelay.createdAt, relayCutoff(now)));
}

// 只允许删自己收到的那些，防止有人拿别人的 id 来删
export function ownedByRecipient(userId: string, id: string) {
  return and(eq(chatRelay.id, id), eq(chatRelay.toUserId, userId));
}
