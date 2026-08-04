import { getCloudflareContext } from "@opennextjs/cloudflare";
import { and, eq } from "drizzle-orm";
import { duels, pointLedger } from "@/db/schema";
import { getDb } from "@/lib/db";
import { getBalance, ledgerRow } from "@/lib/points";
import { notifyInBackground } from "@/lib/push";
import { getSession, unauthorizedResponse } from "@/lib/session";

const MOVES = ["rock", "paper", "scissors"] as const;
type Move = (typeof MOVES)[number];

// 谁克谁：键克值
const BEATS: Record<Move, Move> = {
  rock: "scissors",
  paper: "rock",
  scissors: "paper",
};

const HAND: Record<Move, string> = {
  rock: "✊",
  paper: "✋",
  scissors: "✌️",
};

function isMove(v: unknown): v is Move {
  return typeof v === "string" && (MOVES as readonly string[]).includes(v);
}

// POST /api/duels/[id]/respond：应战并当场结算
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return unauthorizedResponse();

  const body = (await req.json().catch(() => null)) as {
    move?: unknown;
  } | null;
  const move = body?.move;
  if (!isMove(move)) {
    return Response.json({ error: "出招不合法" }, { status: 400 });
  }

  const { id } = await ctx.params;
  const db = await getDb();
  const duel = (
    await db.select().from(duels).where(eq(duels.id, id)).limit(1)
  )[0];

  if (!duel) {
    return Response.json({ error: "这局对战不存在" }, { status: 404 });
  }
  if (duel.opponentId !== session.userId) {
    return Response.json({ error: "这局不是发给你的" }, { status: 403 });
  }
  // 友好提示，真正的并发保护是下面的条件更新
  if (duel.status !== "pending") {
    return Response.json({ error: "这局已经打完啦" }, { status: 400 });
  }
  if (!isMove(duel.challengerMove)) {
    return Response.json({ error: "这局对战数据异常" }, { status: 400 });
  }
  // 应战方也得付得起赌注，否则输了会变负分
  if (duel.stake > 0 && (await getBalance(db, session.userId)) < duel.stake) {
    return Response.json(
      { error: `你的积分不够 ${duel.stake} 分的赌注，先去做几个任务吧` },
      { status: 400 },
    );
  }

  // 胜负在更新前算好，一条 UPDATE 就把出招和结果一起定死
  const challengerMove = duel.challengerMove;
  const winner =
    challengerMove === move
      ? "draw"
      : BEATS[challengerMove] === move
        ? "challenger"
        : "opponent";

  const settled = await db
    .update(duels)
    .set({
      opponentMove: move,
      status: "settled",
      winner,
      settledAt: new Date(),
    })
    .where(and(eq(duels.id, id), eq(duels.status, "pending")))
    .returning({ id: duels.id });

  // 双击的第二次请求、以及和 cancel 抢同一局时的败者在这里拿到空数组，
  // 不记账也不发通知
  if (settled.length === 0) {
    return Response.json({ error: "这局已经打完啦" }, { status: 400 });
  }

  // 赌注在结算时一次性转移：赢家 +stake、输家 -stake 放同一个 batch，
  // dedupeKey + 唯一索引保证同一局的分永远只转一次
  if (duel.stake > 0 && winner !== "draw") {
    const winnerId =
      winner === "challenger" ? duel.challengerId : duel.opponentId;
    const loserId =
      winner === "challenger" ? duel.opponentId : duel.challengerId;

    await db.batch([
      db
        .insert(pointLedger)
        .values(
          ledgerRow({
            userId: winnerId,
            delta: duel.stake,
            reason: "猜拳赢了",
            refType: "adjust",
            refId: duel.id,
            dedupeKey: `duel:${duel.id}:win`,
          }),
        )
        .onConflictDoNothing(),
      db
        .insert(pointLedger)
        .values(
          ledgerRow({
            userId: loserId,
            delta: -duel.stake,
            reason: "猜拳输了",
            refType: "adjust",
            refId: duel.id,
            dedupeKey: `duel:${duel.id}:lose`,
          }),
        )
        .onConflictDoNothing(),
    ]);
  }

  // 结算完了才通知发起方；文案站在发起方视角
  const title =
    winner === "challenger"
      ? "你赢了！🎉"
      : winner === "opponent"
        ? "你输了 😝"
        : "平局，再来一局？";
  const stakeNote =
    duel.stake > 0 && winner !== "draw"
      ? winner === "challenger"
        ? ` · ${duel.stake} 分到手`
        : ` · ${duel.stake} 分飞了`
      : "";

  const { ctx: cfCtx } = await getCloudflareContext({ async: true });
  await notifyInBackground(cfCtx, duel.challengerId, {
    title,
    body: `你 ${HAND[challengerMove]} vs ${session.displayName} ${HAND[move]}${stakeNote}`,
    url: "/duel",
    tag: "duel",
  });

  // 应战方是我，result 是我这边的输赢，前端直接拿去放结算动画
  return Response.json({
    ok: true,
    winner,
    stake: duel.stake,
    challengerMove,
    opponentMove: move,
    result:
      winner === "draw" ? "draw" : winner === "opponent" ? "win" : "lose",
  });
}
