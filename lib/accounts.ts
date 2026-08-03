import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { users } from "@/db/schema";
import { hashPassword } from "@/lib/crypto";
import type { Db } from "@/lib/db";

export const MIN_PASSWORD_LENGTH = 10;

export interface AccountInput {
  username: string;
  password: string;
  displayName: string;
}

export function parseAccountInput(raw: unknown): AccountInput {
  const u = (raw ?? {}) as Record<string, unknown>;
  return {
    username: typeof u.username === "string" ? u.username.trim() : "",
    password: typeof u.password === "string" ? u.password : "",
    displayName: typeof u.displayName === "string" ? u.displayName.trim() : "",
  };
}

// 返回中文错误信息，没问题则返回 null
export function validateAccount(a: AccountInput): string | null {
  if (!a.username) return "用户名不能为空";
  if (!/^[a-zA-Z0-9_-]{2,20}$/.test(a.username)) {
    return "用户名只能用字母、数字、下划线或减号，2-20 位";
  }
  if (!a.displayName) return "昵称不能为空";
  if (a.displayName.length > 20) return "昵称最多 20 个字";
  if (a.password.length < MIN_PASSWORD_LENGTH) {
    return `密码至少要 ${MIN_PASSWORD_LENGTH} 位`;
  }
  return null;
}

export async function usernameTaken(
  db: Db,
  username: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  return rows.length > 0;
}

export async function buildUserRow(a: AccountInput) {
  const { hash, salt, iterations } = await hashPassword(a.password);
  return {
    id: nanoid(),
    username: a.username,
    passwordHash: hash,
    passwordSalt: salt,
    passwordIterations: iterations,
    displayName: a.displayName,
    createdAt: new Date(),
  };
}
