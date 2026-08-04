import { getCloudflareContext } from "@opennextjs/cloudflare";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { duels } from "@/db/schema";
import { getDb } from "@/lib/db";
import { getBalance } from "@/lib/points";
import { notifyInBackground } from "@/lib/push";
import { getSession, unauthorizedResponse } from "@/lib/session";
import { getAllUsers, getPartner } from "@/lib/users";

const MOVES = ["rock", "paper", "scissors"] as const;
type Move = (typeof MOVES)[number];

const STAKE_MAX = 100;

function isMove(v: unknown): v is Move {
  return typeof v === "string" && (MOVES as readonly string[]).includes(v);
}

// GET /api/duels：待应战/待对方应战的对局 + 最近 10 局战果 + 我的战绩
export async function GET() {
  const session = await getSession();
  if (!session) return unauthorizedResponse();

  const db = await getDb();
  const me = session.userId;
  const involvesMe = or(eq(duels.challengerId, me), eq(duels.opponentId, me));

  const [pendingRows, recentRows, recordRows, allUsers] = await Promise.all([
    db
      .select()
      .from(duels)
      .where(and(eq(duels.status, "pending"), involvesMe))
      .orderBy(desc(duels.createdAt)),
    db
      .select()
      .from(duels)
      .where(and(eq(duels.status, "settled"), involvesMe))
      .orderBy(desc(duels.settledAt))
      .limit(10),
    db
      .select({
        win: sql<number>`coalesce(sum(case when (${duels.winner} = 'challenger' and ${duels.challengerId} = ${me}) or (${duels.winner} = 'opponent' and ${duels.opponentId} = ${me}) then 1 else 0 end), 0)`,
        lose: sql<number>`coalesce(sum(case when (${duels.winner} = 'challenger' and ${duels.opponentId} = ${me}) or (${duels.winner} = 'opponent' and ${duels.challengerId} = ${me}) then 1 else 0 end), 0)`,
        draw: sql<number>`coalesce(sum(case when ${duels.winner} = 'draw' then 1 else 0 end), 0)`,
      })
      .from(duels)
      .where(and(eq(duels.status, "settled"), involvesMe)),
    getAllUsers(db),
  ]);

  // 只有两个人，直接查全量用户映射 displayName
  const nameOf = (id: string) =>
    allUsers.find((u) => u.id === id)?.displayName ?? "";

  const pending = pendingRows.map((d) => {
    const waitingMe = d.opponentId === me;
    return {
      id: d.id,
      stake: d.stake,
      createdAt: d.createdAt,
      waitingMe,
      waitingPartner: !waitingMe,
      challengerName: nameOf(d.challengerId),
      opponentName: nameOf(d.opponentId),
      // 等我应战时一个字都不能透出发起方的出招，否则一看就知道怎么赢；
      // 等对方应战时这里给的是我自己出的招，给我看没问题
      myMove: waitingMe ? null : d.challengerMove,
    };
  });

  const recent = recentRows.map((d) => {
    const iAmChallenger = d.challengerId === me;
    const result =
      d.winner === "challenger"
        ? iAmChallenger
          ? "win"
          : "lose"
        : d.winner === "opponent"
          ? iAmChallenger
            ? "lose"
            : "win"
          : "draw";
    return {
      id: d.id,
      stake: d.stake,
      winner: d.winner,
      result,
      challengerMove: d.challengerMove,
      opponentMove: d.opponentMove,
      challengerName: nameOf(d.challengerId),
      opponentName: nameOf(d.opponentId),
      myMove: iAmChallenger ? d.challengerMove : d.opponentMove,
      partnerMove: iAmChallenger ? d.opponentMove : d.challengerMove,
      settledAt: d.settledAt,
    };
  });

  const record = recordRows[0];

  return Response.json({
    pending,
    recent,
    myRecord: {
      win: record?.win ?? 0,
      lose: record?.lose ?? 0,
      draw: record?.draw ?? 0,
    },
    partnerName: allUsers.find((u) => u.id !== me)?.displayName ?? "",
  });
}

// POST /api/duels：发起一局猜拳，出招落库后等对方应战
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return unauthorizedResponse();

  const body = (await req.json().catch(() => null)) as {
    move?: unknown;
    stake?: unknown;
  } | null;
  const move = body?.move;
  const stake = body?.stake;

  if (!isMove(move)) {
    return Response.json({ error: "出招不合法" }, { status: 400 });
  }
  if (
    typeof stake !== "number" ||
    !Number.isInteger(stake) ||
    stake < 0 ||
    stake > STAKE_MAX
  ) {
    return Response.json(
      { error: `赌注只能是 0-${STAKE_MAX} 的整数` },
      { status: 400 },
    );
  }

  const db = await getDb();
  const partner = await getPartner(db, session.userId);
  if (!partner) {
    return Response.json({ error: "还没有另一半，先邀请 TA 加入" }, { status: 400 });
  }

  // 赌注在结算时才一次性转移，这里只拦「明显下不起」的注，不预扣分：
  // 不扣分就没有撤回/超时退钱那一套补偿逻辑
  if (stake > 0) {
    const balance = await getBalance(db, session.userId);
    if (balance < stake) {
      return Response.json({ error: "积分不够下这个注" }, { status: 400 });
    }
  }

  const id = nanoid();
  const now = new Date();

  // 「同时只能有一局 pending」用条件插入保证：两人同时发起时，
  // WHERE 不成立的那次一行都不写，不会出现两局并存
  const created = await db.run(sql`
    insert into duels (id, challenger_id, opponent_id, game, stake, challenger_move, opponent_move, status, winner, created_at, settled_at)
    select ${id}, ${session.userId}, ${partner.id}, 'rps', ${stake}, ${move}, null, 'pending', null, ${now.getTime()}, null
    where not exists (select 1 from duels where status = 'pending')
  `);

  if ((created.meta?.changes ?? 0) === 0) {
    return Response.json({ error: "还有一局没打完呢" }, { status: 409 });
  }

  // 对局真的落库之后才通知；抢输的那次请求上面已经出局。
  // 通知对象是对方，不会发给自己
  const { ctx: cfCtx } = await getCloudflareContext({ async: true });
  await notifyInBackground(cfCtx, partner.id, {
    title: `${session.displayName} 发起了猜拳挑战`,
    body: stake > 0 ? `赌注 ${stake} 分，快应战` : "快来应战",
    url: "/duel",
    tag: "duel",
  });

  return Response.json({ ok: true, id });
}
