import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import { getDb } from "@/lib/db";
import { verifyPassword } from "@/lib/crypto";
import {
  clearFailures,
  clientKey,
  isLocked,
  recordFailure,
} from "@/lib/ratelimit";
import { createSession } from "@/lib/session";

// 密码登录；所有失败情况统一返回同一句 401，不泄露用户是否存在。
// 按来源 IP 与用户名两个维度计失败次数，触顶后 15 分钟内直接 429
export async function POST(req: Request) {
  const fail = () =>
    Response.json({ error: "用户名或密码不对" }, { status: 401 });

  let body: { username?: unknown; password?: unknown };
  try {
    body = (await req.json()) as { username?: unknown; password?: unknown };
  } catch {
    return fail();
  }

  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!username || !password) return fail();

  const db = await getDb();
  const ipKey = `ip:${clientKey(req)}`;
  const userKey = `user:${username.toLowerCase()}`;

  if ((await isLocked(db, ipKey)) || (await isLocked(db, userKey))) {
    return Response.json(
      { error: "尝试太多次啦，过 15 分钟再试" },
      { status: 429 },
    );
  }

  // 用户不存在与密码错误走同一条失败路径，
  // 否则「有没有被锁」本身就会暴露用户名是否存在
  const failAndRecord = async () => {
    await recordFailure(db, ipKey);
    await recordFailure(db, userKey);
    return fail();
  };

  const rows = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  const user = rows[0];
  if (!user) return failAndRecord();

  const ok = await verifyPassword(
    password,
    user.passwordSalt,
    user.passwordHash,
    user.passwordIterations,
  );
  if (!ok) return failAndRecord();

  await clearFailures(db, ipKey);
  await clearFailures(db, userKey);

  await createSession({
    userId: user.id,
    username: user.username,
    displayName: user.displayName,
  });
  return Response.json({ ok: true });
}
