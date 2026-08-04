"use client";

import { useCallback, useEffect, useState } from "react";
import BackLink from "@/components/BackLink";

type Move = "rock" | "paper" | "scissors";
type Result = "win" | "lose" | "draw";

const MOVES: { key: Move; emoji: string; label: string }[] = [
  { key: "rock", emoji: "✊", label: "石头" },
  { key: "paper", emoji: "✋", label: "布" },
  { key: "scissors", emoji: "✌️", label: "剪刀" },
];

const STAKES = [0, 10, 30, 50];

function handOf(move: string | null): string {
  return MOVES.find((m) => m.key === move)?.emoji ?? "❔";
}

interface PendingDuel {
  id: string;
  stake: number;
  waitingMe: boolean;
  waitingPartner: boolean;
  challengerName: string;
  opponentName: string;
  // 等我应战时后端不会给出招，这里永远是 null
  myMove: string | null;
}

interface RecentDuel {
  id: string;
  stake: number;
  result: Result;
  myMove: string | null;
  partnerMove: string | null;
  settledAt: string | null;
}

interface DuelData {
  pending: PendingDuel[];
  recent: RecentDuel[];
  myRecord: { win: number; lose: number; draw: number };
  partnerName: string;
}

interface Reveal {
  myMove: Move;
  partnerMove: string;
  result: Result;
  stake: number;
}

const RESULT_TEXT: Record<Result, string> = {
  win: "你赢了！🎉",
  lose: "你输了 😝",
  draw: "平局，再来一局？",
};

export default function DuelPage() {
  const [data, setData] = useState<DuelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<Move | null>(null);
  const [stake, setStake] = useState(0);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  // 出招后先一起抖两下再翻牌，翻牌前两边都显示 ✊
  const [shaking, setShaking] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/duels");
      if (res.ok) setData((await res.json()) as DuelData);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // shaking 在拿到结果那一刻就置 true（见 setReveal 处），
  // 这里只负责到点收尾，不在 effect 里同步 setState
  useEffect(() => {
    if (!shaking) return;
    const timer = setTimeout(() => setShaking(false), 900);
    return () => clearTimeout(timer);
  }, [shaking]);

  // 统一动作封装：调接口 → 失败展示中文错误 → 成功后重拉数据
  async function act(url: string, body?: unknown) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const payload = (await res.json().catch(() => null)) as Record<
        string,
        unknown
      > | null;
      if (!res.ok) {
        setError(
          typeof payload?.error === "string"
            ? payload.error
            : "操作失败，请稍后再试",
        );
        return null;
      }
      await load();
      return payload ?? {};
    } catch {
      setError("网络出错了，请稍后再试");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function respond(duelId: string, move: Move) {
    const payload = await act(`/api/duels/${duelId}/respond`, { move });
    if (!payload) return;
    setShaking(true); // 先一起抖 900ms 再翻牌
    setReveal({
      myMove: move,
      partnerMove: String(payload.challengerMove ?? ""),
      result: (payload.result as Result) ?? "draw",
      stake: Number(payload.stake ?? 0),
    });
  }

  async function challenge() {
    if (!picked) return;
    const ok = await act("/api/duels", { move: picked, stake });
    if (ok) setPicked(null);
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-md md:max-w-2xl px-4 md:px-6 py-6">
        <BackLink href="/store" />
        <h1 className="text-2xl font-bold text-foreground">猜拳</h1>
        <div className="mt-4 h-40 animate-pulse rounded-2xl bg-primary-soft" />
        <div className="mt-4 h-24 animate-pulse rounded-2xl bg-primary-soft/60" />
        <p className="mt-4 text-center text-sm text-muted">加载中…</p>
      </div>
    );
  }

  const waitingMe = data?.pending.find((d) => d.waitingMe) ?? null;
  const waitingPartner = data?.pending.find((d) => d.waitingPartner) ?? null;
  const partnerName = data?.partnerName || "TA";
  const record = data?.myRecord ?? { win: 0, lose: 0, draw: 0 };
  const recent = data?.recent ?? [];

  return (
    <div className="mx-auto w-full max-w-md md:max-w-2xl px-4 md:px-6 py-6">
      <BackLink href="/store" />
      <h1 className="text-2xl font-bold text-foreground">猜拳</h1>

      {error && (
        <p className="mt-3 rounded-2xl bg-rose-50 px-4 py-2 text-sm text-rose-500">
          {error}
        </p>
      )}

      {/* 结算动画：出招后先抖再翻牌 */}
      {reveal ? (
        <section className="mt-4 rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
          <div className="flex items-center justify-center gap-6 md:gap-12">
            <div className="w-24">
              <p className="text-xs text-muted">我</p>
              <p
                className={`mt-1 text-5xl md:text-6xl ${shaking ? "animate-bounce" : ""}`}
              >
                {shaking ? "✊" : handOf(reveal.myMove)}
              </p>
            </div>
            <span className="text-lg font-bold text-muted">VS</span>
            <div className="w-24">
              <p className="truncate text-xs text-muted">{partnerName}</p>
              <p
                className={`mt-1 text-5xl md:text-6xl ${shaking ? "animate-bounce" : ""}`}
              >
                {shaking ? "✊" : handOf(reveal.partnerMove)}
              </p>
            </div>
          </div>

          {shaking ? (
            <p className="mt-5 text-sm text-muted">石头剪刀布…</p>
          ) : (
            <>
              <p className="mt-5 text-2xl font-bold text-foreground">
                {RESULT_TEXT[reveal.result]}
              </p>
              {reveal.stake > 0 && reveal.result !== "draw" && (
                <p
                  className={`mt-1 text-sm font-semibold ${
                    reveal.result === "win"
                      ? "text-emerald-600"
                      : "text-rose-500"
                  }`}
                >
                  {reveal.result === "win"
                    ? `+${reveal.stake} 分到手`
                    : `-${reveal.stake} 分飞了`}
                </p>
              )}
              <button
                onClick={() => setReveal(null)}
                className="mt-5 w-full rounded-full bg-primary py-2.5 font-semibold text-white active:opacity-80 disabled:opacity-40"
              >
                再来一局
              </button>
            </>
          )}
        </section>
      ) : waitingMe ? (
        /* 等我应战：绝不显示对方出了什么，后端也没给 */
        <section className="mt-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-center text-xl font-bold text-foreground">
            {waitingMe.challengerName || partnerName} 向你发起挑战
          </h2>
          <p className="mt-1 text-center text-sm text-muted">
            {waitingMe.stake > 0
              ? `赌注 ${waitingMe.stake} 分，赢了归你`
              : "友谊赛，不赌分"}
          </p>
          <div className="mt-5 grid grid-cols-3 gap-3 md:mx-auto md:max-w-sm">
            {MOVES.map((m) => (
              <button
                key={m.key}
                onClick={() => respond(waitingMe.id, m.key)}
                disabled={busy}
                className="flex h-20 flex-col items-center justify-center gap-1 rounded-2xl border border-border bg-background active:opacity-80 disabled:opacity-40 md:h-24"
              >
                <span className="text-3xl leading-none md:text-4xl">
                  {m.emoji}
                </span>
                <span className="text-xs text-muted">{m.label}</span>
              </button>
            ))}
          </div>
        </section>
      ) : waitingPartner ? (
        /* 我发起的，等对方 */
        <section className="mt-4 rounded-2xl border border-border bg-card p-5 text-center shadow-sm">
          <p className="text-sm text-muted">
            等 {waitingPartner.opponentName || partnerName} 应战中…
          </p>
          <p className="mt-3 text-6xl">{handOf(waitingPartner.myMove)}</p>
          <p className="mt-2 text-xs text-muted">
            {waitingPartner.stake > 0
              ? `赌注 ${waitingPartner.stake} 分`
              : "友谊赛，不赌分"}
          </p>
          <button
            onClick={() => act(`/api/duels/${waitingPartner.id}/cancel`)}
            disabled={busy}
            className="mt-5 w-full rounded-full border border-border py-2.5 font-semibold text-muted active:opacity-80 disabled:opacity-40"
          >
            撤回挑战
          </button>
        </section>
      ) : (
        /* 发起区 */
        <section className="mt-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-center text-base font-semibold text-foreground">
            出一招，等 {partnerName} 应战
          </h2>
          <div className="mt-4 grid grid-cols-3 gap-3 md:mx-auto md:max-w-sm">
            {MOVES.map((m) => {
              const active = picked === m.key;
              return (
                <button
                  key={m.key}
                  onClick={() => setPicked(m.key)}
                  className={`flex h-20 flex-col items-center justify-center gap-1 rounded-2xl border active:opacity-80 md:h-24 ${
                    active
                      ? "border-primary bg-primary-soft"
                      : "border-border bg-background"
                  }`}
                >
                  <span className="text-3xl leading-none md:text-4xl">
                    {m.emoji}
                  </span>
                  <span
                    className={`text-xs ${active ? "font-semibold text-primary" : "text-muted"}`}
                  >
                    {m.label}
                  </span>
                </button>
              );
            })}
          </div>

          <p className="mt-5 text-xs font-semibold text-muted">赌注</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {STAKES.map((s) => (
              <button
                key={s}
                onClick={() => setStake(s)}
                className={`rounded-full border px-4 py-1.5 text-sm font-semibold active:opacity-80 ${
                  stake === s
                    ? "border-primary bg-primary-soft text-primary"
                    : "border-border text-muted"
                }`}
              >
                {s === 0 ? "不赌" : `${s} 分`}
              </button>
            ))}
          </div>

          <button
            onClick={challenge}
            disabled={!picked || busy}
            className="mt-5 w-full rounded-full bg-primary py-2.5 font-semibold text-white active:opacity-80 disabled:opacity-40"
          >
            发起挑战
          </button>
        </section>
      )}

      {/* 战绩 */}
      <section className="mt-6">
        <h2 className="text-sm font-semibold text-muted">我的战绩</h2>
        <div className="mt-2 rounded-2xl border border-border bg-card p-4 text-center shadow-sm">
          <p className="text-lg font-bold text-foreground">
            <span className="text-emerald-600">{record.win}</span> 胜{" "}
            <span className="text-rose-500">{record.lose}</span> 负{" "}
            <span className="text-muted">{record.draw}</span> 平
          </p>
        </div>
      </section>

      {/* 最近战况 */}
      <section className="mt-6">
        <h2 className="text-sm font-semibold text-muted">最近战况</h2>
        {recent.length === 0 ? (
          <p className="mt-2 rounded-2xl border border-border bg-card p-4 text-center text-sm text-muted shadow-sm">
            还没打过，来第一局吧 ✊
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {recent.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm"
              >
                <span className="flex shrink-0 items-center gap-2 text-2xl">
                  {handOf(d.myMove)}
                  <span className="text-xs text-muted">vs</span>
                  {handOf(d.partnerMove)}
                </span>
                <span
                  className={`text-sm font-semibold ${
                    d.result === "win"
                      ? "text-emerald-600"
                      : d.result === "lose"
                        ? "text-rose-500"
                        : "text-muted"
                  }`}
                >
                  {d.result === "win"
                    ? "赢"
                    : d.result === "lose"
                      ? "输"
                      : "平"}
                </span>
                <span className="shrink-0 text-xs text-muted">
                  {d.stake > 0 ? `${d.stake} 分` : "友谊赛"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
