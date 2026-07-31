import { ne, eq } from "drizzle-orm";
import { users } from "@/db/schema";
import type { Db } from "@/lib/db";

export type UserRow = typeof users.$inferSelect;

// 两人世界：对方 = 唯一一个不是我的用户
export async function getPartner(
  db: Db,
  myUserId: string,
): Promise<UserRow | null> {
  const rows = await db
    .select()
    .from(users)
    .where(ne(users.id, myUserId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getUserById(
  db: Db,
  userId: string,
): Promise<UserRow | null> {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getAllUsers(db: Db): Promise<UserRow[]> {
  return db.select().from(users);
}
