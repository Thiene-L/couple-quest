import { eq } from "drizzle-orm";
import { invites, users } from "@/db/schema";
import { getDb } from "@/lib/db";
import { createSession } from "@/lib/session";
import { getUserById } from "@/lib/users";
import { consumeInvite, findUsableInvite, isFull } from "@/lib/invites";
import {
  buildUserRow,
  parseAccountInput,
  usernameTaken,
  validateAccount,
} from "@/lib/accounts";

// 校验邀请码是否还能用，顺带把邀请人昵称给前端展示
export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get("code") ?? "";
  if (!code) return Response.json({ valid: false, reason: "缺少邀请码" });

  const db = await getDb();
  if (await isFull(db)) {
    return Response.json({ valid: false, reason: "两个人都已经注册过啦" });
  }

  const invite = await findUsableInvite(db, code);
  if (!invite) {
    return Response.json({ valid: false, reason: "邀请链接无效或已被使用" });
  }

  const inviter = await getUserById(db, invite.createdBy);
  return Response.json({
    valid: true,
    inviterName: inviter?.displayName ?? "TA",
  });
}

interface JoinBody {
  code?: unknown;
  username?: unknown;
  password?: unknown;
  displayName?: unknown;
}

// 另一半凭邀请码注册自己的账号，密码只有本人知道
export async function POST(req: Request) {
  let body: JoinBody;
  try {
    body = (await req.json()) as JoinBody;
  } catch {
    return Response.json({ error: "请求格式不对" }, { status: 400 });
  }

  const code = typeof body?.code === "string" ? body.code : "";
  if (!code) return Response.json({ error: "缺少邀请码" }, { status: 400 });

  const db = await getDb();
  if (await isFull(db)) {
    return Response.json({ error: "两个人都已经注册过啦" }, { status: 409 });
  }

  const account = parseAccountInput(body);
  const invalid = validateAccount(account);
  if (invalid) return Response.json({ error: invalid }, { status: 400 });

  if (await usernameTaken(db, account.username)) {
    return Response.json({ error: "这个用户名被占用了，换一个" }, { status: 409 });
  }

  const row = await buildUserRow(account);

  // 先条件消费邀请码：并发用同一个码只有一个能过，另一个拿不到行
  if (!(await consumeInvite(db, code, row.id))) {
    return Response.json(
      { error: "邀请链接无效或已被使用" },
      { status: 409 },
    );
  }

  try {
    await db.insert(users).values(row);
  } catch {
    // 建号失败就把码放回去，否则这个码白白作废、对方再也注册不了
    await db
      .update(invites)
      .set({ usedAt: null, usedBy: null })
      .where(eq(invites.code, code));
    return Response.json({ error: "注册失败，请重试" }, { status: 500 });
  }

  await createSession({
    userId: row.id,
    username: row.username,
    displayName: row.displayName,
  });

  return Response.json({ ok: true });
}
