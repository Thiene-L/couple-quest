import { and, eq, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { invites, users } from "@/db/schema";
import type { Db } from "@/lib/db";

// 这个应用只服务两个人，用户数即注册通道的开关
export const MAX_USERS = 2;

export async function countUsers(db: Db): Promise<number> {
  const rows = await db.select({ id: users.id }).from(users);
  return rows.length;
}

export async function isFull(db: Db): Promise<boolean> {
  return (await countUsers(db)) >= MAX_USERS;
}

// 未使用的邀请码；同一个人反复打开邀请页拿到的是同一个码
export async function getActiveInvite(db: Db, createdBy: string) {
  const rows = await db
    .select()
    .from(invites)
    .where(and(eq(invites.createdBy, createdBy), isNull(invites.usedAt)))
    .limit(1);
  return rows[0] ?? null;
}

export async function createInvite(db: Db, createdBy: string) {
  const existing = await getActiveInvite(db, createdBy);
  if (existing) return existing;
  const row = {
    code: nanoid(16),
    createdBy,
    createdAt: new Date(),
    usedAt: null,
    usedBy: null,
  };
  await db.insert(invites).values(row);
  return row;
}

// 条件更新即消费：并发用同一个码只有一个能成功
export async function consumeInvite(
  db: Db,
  code: string,
  usedBy: string,
): Promise<boolean> {
  const rows = await db
    .update(invites)
    .set({ usedAt: new Date(), usedBy })
    .where(and(eq(invites.code, code), isNull(invites.usedAt)))
    .returning({ code: invites.code });
  return rows.length > 0;
}

export async function findUsableInvite(db: Db, code: string) {
  const rows = await db
    .select()
    .from(invites)
    .where(and(eq(invites.code, code), isNull(invites.usedAt)))
    .limit(1);
  return rows[0] ?? null;
}
