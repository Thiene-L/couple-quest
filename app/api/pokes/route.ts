import { getCloudflareContext } from "@opennextjs/cloudflare";
import { and, count, desc, eq, gte, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { pokes, users } from "@/db/schema";
import { getDb, todayKey } from "@/lib/db";
import { notifyInBackground } from "@/lib/push";
import { getSession, unauthorizedResponse } from "@/lib/session";
import { getPartner } from "@/lib/users";

// 五种戳法 → 推送标题；body / url / tag 五种共用
const POKE_TITLES = {
  miss: (me: string) => `${me} 想你了 🥺`,
  hug: (me: string) => `${me} 给你一个抱抱 🤗`,
  what: (me: string) => `${me} 在问你干嘛呢 👀`,
  kiss: (me: string) => `${me} 亲了你一下 😘`,
  cheer: (me: string) => `${me} 在给你加油 💪`,
} as const;

type PokeKind = keyof typeof POKE_TITLES;

// 同一人 1 分钟内最多 5 次
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 5;

function isPokeKind(v: unknown): v is PokeKind {
  return typeof v === "string" && Object.hasOwn(POKE_TITLES, v);
}

// todayKey() 那一天的起点：Asia/Shanghai 零点对应的 UTC 时刻。
// 用区间比时间戳，等价于按 todayKey() 比对，但能走 created_at 索引
function startOfToday(): Date {
  return new Date(Date.parse(`${todayKey()}T00:00:00Z`) - 8 * 3600_000);
}

// GET /api/pokes：最近一条戳我的 + 我的未读数 + 我今天戳出去的条数
export async function GET() {
  const session = await getSession();
  if (!session) return unauthorizedResponse();

  const db = await getDb();

  const [partner, latestRows, unseenRows, sentTodayRows] = await Promise.all([
    getPartner(db, session.userId),
    db
      .select({
        id: pokes.id,
        kind: pokes.kind,
        fromName: users.displayName,
        createdAt: pokes.createdAt,
        seenAt: pokes.seenAt,
      })
      .from(pokes)
      .innerJoin(users, eq(pokes.fromUserId, users.id))
      .where(eq(pokes.toUserId, session.userId))
      .orderBy(desc(pokes.createdAt))
      .limit(1),
    db
      .select({ n: count() })
      .from(pokes)
      .where(and(eq(pokes.toUserId, session.userId), isNull(pokes.seenAt))),
    db
      .select({ n: count() })
      .from(pokes)
      .where(
        and(
          eq(pokes.fromUserId, session.userId),
          gte(pokes.createdAt, startOfToday()),
        ),
      ),
  ]);

  return Response.json({
    latestReceived: latestRows[0] ?? null,
    unseenCount: unseenRows[0]?.n ?? 0,
    sentToday: sentTodayRows[0]?.n ?? 0,
    // 附带给前端判断要不要渲染「戳一下」，没绑另一半时整个组件不出现
    partnerName: partner?.displayName ?? null,
  });
}

// POST /api/pokes：戳对方一下
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return unauthorizedResponse();

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "请求格式错误" }, { status: 400 });
  }

  const kind = body.kind;
  if (!isPokeKind(kind)) {
    return Response.json({ error: "不认识这种戳法" }, { status: 400 });
  }

  const db = await getDb();
  const partner = await getPartner(db, session.userId);
  if (!partner) {
    return Response.json({ error: "还没有另一半，戳不到人" }, { status: 400 });
  }

  // 限流：最近 60 秒我发出去的条数够 5 条就拦下，不写库也不推送
  const recent = await db
    .select({ n: count() })
    .from(pokes)
    .where(
      and(
        eq(pokes.fromUserId, session.userId),
        gte(pokes.createdAt, new Date(Date.now() - RATE_WINDOW_MS)),
      ),
    );
  if ((recent[0]?.n ?? 0) >= RATE_MAX) {
    return Response.json({ error: "慢一点，TA 会被戳晕的" }, { status: 429 });
  }

  await db.insert(pokes).values({
    id: nanoid(),
    fromUserId: session.userId,
    toUserId: partner.id,
    kind,
    createdAt: new Date(),
    seenAt: null,
  });

  // 落库成功后才推送，只推给对方；tag 固定为 poke，连戳时通知会合并不刷屏
  const { ctx } = await getCloudflareContext({ async: true });
  await notifyInBackground(ctx, partner.id, {
    title: POKE_TITLES[kind](session.displayName),
    body: "点开看看",
    url: "/tasks",
    tag: "poke",
  });

  return Response.json({ ok: true, kind }, { status: 201 });
}

// PATCH /api/pokes：把发给我的未读全部标记已读。
// 条件写（seen_at is null）：改到 0 行只说明本来就没未读，不接后续动作，照常返回 200
export async function PATCH() {
  const session = await getSession();
  if (!session) return unauthorizedResponse();

  const db = await getDb();
  const marked = await db
    .update(pokes)
    .set({ seenAt: new Date() })
    .where(and(eq(pokes.toUserId, session.userId), isNull(pokes.seenAt)))
    .returning({ id: pokes.id });

  return Response.json({ ok: true, marked: marked.length });
}
