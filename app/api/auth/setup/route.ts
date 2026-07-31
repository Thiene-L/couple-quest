import { nanoid } from "nanoid";
import { users } from "@/db/schema";
import { getDb, getEnv } from "@/lib/db";
import { hashPassword } from "@/lib/crypto";
import { createSession } from "@/lib/session";
import { getAllUsers } from "@/lib/users";

const MIN_PASSWORD_LENGTH = 10;

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

// 是否需要首次初始化（users 表为空）
export async function GET() {
  const db = await getDb();
  const all = await getAllUsers(db);
  return Response.json({ needsSetup: all.length === 0 });
}

interface SetupUserInput {
  username?: unknown;
  password?: unknown;
  displayName?: unknown;
}

interface SetupBody {
  bootstrapSecret?: unknown;
  users?: SetupUserInput[];
}

// 首次初始化：一次建满两个账号，建完自动登录第一个。
// 该端点无需登录即可访问，靠部署时配置的 BOOTSTRAP_SECRET 把门
export async function POST(req: Request) {
  const env = await getEnv();
  if (!env.BOOTSTRAP_SECRET) {
    return Response.json(
      { error: "服务端未配置初始化口令" },
      { status: 500 },
    );
  }

  let body: SetupBody;
  try {
    body = (await req.json()) as SetupBody;
  } catch {
    return Response.json({ error: "请求格式不对" }, { status: 400 });
  }

  const bootstrapSecret =
    typeof body?.bootstrapSecret === "string" ? body.bootstrapSecret : "";
  if (!timingSafeEqual(bootstrapSecret, env.BOOTSTRAP_SECRET)) {
    return Response.json({ error: "初始化口令不对" }, { status: 401 });
  }

  const db = await getDb();
  const existing = await getAllUsers(db);
  if (existing.length > 0) {
    return Response.json({ error: "账号已经创建过了" }, { status: 409 });
  }

  const inputs = body?.users;
  if (!Array.isArray(inputs) || inputs.length !== 2) {
    return Response.json(
      { error: "需要提供两个人的账号信息" },
      { status: 400 },
    );
  }

  const parsed = inputs.map((u) => ({
    username: typeof u?.username === "string" ? u.username.trim() : "",
    password: typeof u?.password === "string" ? u.password : "",
    displayName: typeof u?.displayName === "string" ? u.displayName.trim() : "",
  }));

  for (const u of parsed) {
    if (!u.username) {
      return Response.json({ error: "用户名不能为空" }, { status: 400 });
    }
    if (!u.displayName) {
      return Response.json({ error: "昵称不能为空" }, { status: 400 });
    }
    if (u.password.length < MIN_PASSWORD_LENGTH) {
      return Response.json(
        { error: `密码至少要 ${MIN_PASSWORD_LENGTH} 位` },
        { status: 400 },
      );
    }
  }
  if (parsed[0].username === parsed[1].username) {
    return Response.json(
      { error: "两个人的用户名不能相同" },
      { status: 400 },
    );
  }

  const rows = [];
  for (const u of parsed) {
    const { hash, salt, iterations } = await hashPassword(u.password);
    rows.push({
      id: nanoid(),
      username: u.username,
      passwordHash: hash,
      passwordSalt: salt,
      passwordIterations: iterations,
      displayName: u.displayName,
      createdAt: new Date(),
    });
  }

  await db.batch([
    db.insert(users).values(rows[0]),
    db.insert(users).values(rows[1]),
  ]);

  await createSession({
    userId: rows[0].id,
    username: rows[0].username,
    displayName: rows[0].displayName,
  });

  return Response.json({ ok: true });
}
