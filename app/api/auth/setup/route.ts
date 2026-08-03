import { users } from "@/db/schema";
import { getDb, getEnv } from "@/lib/db";
import { createSession } from "@/lib/session";
import { countUsers, MAX_USERS } from "@/lib/invites";
import {
  buildUserRow,
  parseAccountInput,
  validateAccount,
} from "@/lib/accounts";

// 定长时间比较，长度不同也走完整循环
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  let diff = ab.length ^ bb.length;
  const len = Math.max(ab.length, bb.length, 1);
  for (let i = 0; i < len; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

// needsSetup=还没有任何人注册；isFull=两个人都注册了
export async function GET() {
  const db = await getDb();
  const n = await countUsers(db);
  return Response.json({ needsSetup: n === 0, isFull: n >= MAX_USERS });
}

interface SetupBody {
  bootstrapSecret?: unknown;
  username?: unknown;
  password?: unknown;
  displayName?: unknown;
}

// 第一个人注册自己的账号。无需登录，靠部署时配置的 BOOTSTRAP_SECRET 把门；
// 另一半由第一个人生成邀请链接后自行注册（见 /api/invites 与 /api/auth/join）
export async function POST(req: Request) {
  const env = await getEnv();
  if (!env.BOOTSTRAP_SECRET) {
    return Response.json({ error: "服务端未配置初始化口令" }, { status: 500 });
  }

  let body: SetupBody;
  try {
    body = (await req.json()) as SetupBody;
  } catch {
    return Response.json({ error: "请求格式不对" }, { status: 400 });
  }

  const secret =
    typeof body?.bootstrapSecret === "string" ? body.bootstrapSecret : "";
  if (!timingSafeEqual(secret, env.BOOTSTRAP_SECRET)) {
    return Response.json({ error: "初始化口令不对" }, { status: 401 });
  }

  const db = await getDb();
  if ((await countUsers(db)) > 0) {
    return Response.json(
      { error: "已经有人注册过了，去登录页吧" },
      { status: 409 },
    );
  }

  const account = parseAccountInput(body);
  const invalid = validateAccount(account);
  if (invalid) return Response.json({ error: invalid }, { status: 400 });

  const row = await buildUserRow(account);
  await db.insert(users).values(row);

  await createSession({
    userId: row.id,
    username: row.username,
    displayName: row.displayName,
  });

  return Response.json({ ok: true });
}
