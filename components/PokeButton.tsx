"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// 五种戳法，和后端 kind 一一对应
const OPTIONS = [
  { kind: "miss", label: "想你了", emoji: "🥺" },
  { kind: "hug", label: "抱抱", emoji: "🤗" },
  { kind: "what", label: "干嘛呢", emoji: "👀" },
  { kind: "kiss", label: "亲一下", emoji: "😘" },
  { kind: "cheer", label: "加油", emoji: "💪" },
] as const;

const KIND_TEXT: Record<string, string | undefined> = {
  miss: "想你了 🥺",
  hug: "抱了抱你 🤗",
  what: "问你干嘛呢 👀",
  kiss: "亲了你一下 😘",
  cheer: "给你加油 💪",
};

// 「已戳到 TA ✓」停留时长
const FEEDBACK_MS = 1500;

interface LatestReceived {
  id: string;
  kind: string;
  fromName: string;
  createdAt: string;
  seenAt: string | null;
}

interface PokeState {
  latestReceived: LatestReceived | null;
  unseenCount: number;
  sentToday: number;
  partnerName: string | null;
}

// 首页顶部的「戳一下」：主按钮展开五个选项，选中即发
export default function PokeButton() {
  const [state, setState] = useState<PokeState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [justSent, setJustSent] = useState(false);
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/pokes");
      if (!res.ok) return;
      const j = (await res.json()) as PokeState;
      setState(j);
    } catch {
      // 拉不到就当没有，按钮不显示，不打扰主流程
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    // load 的第一条语句就是 await，setState 全发生在其后；规则看不穿 useCallback
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  // 组件卸载时清掉「已戳到」的定时器，避免在卸载后 setState
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function send(kind: string) {
    if (sending) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/pokes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "没戳出去，再试一次");
        return;
      }
      setOpen(false);
      setJustSent(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setJustSent(false), FEEDBACK_MS);
      await load();
    } catch {
      setError("网络不太好，再试一次");
    } finally {
      setSending(false);
    }
  }

  // 展开选项时顺手把对方戳我的那些标记已读
  async function markSeen() {
    if (!state || state.unseenCount === 0) return;
    setState({ ...state, unseenCount: 0 });
    try {
      await fetch("/api/pokes", { method: "PATCH" });
    } catch {
      // 标已读失败无所谓，下次进页面还会再标
    }
  }

  function toggle() {
    setError("");
    const next = !open;
    setOpen(next);
    if (next) void markSeen();
  }

  if (!loaded) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <p className="text-sm text-muted">加载中…</p>
      </div>
    );
  }

  // 还没绑另一半就整个不渲染
  if (!state?.partnerName) return null;

  const received = state.latestReceived;
  const unseenCount = state.unseenCount;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-foreground">
            戳一下 {state.partnerName}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {state.sentToday > 0
              ? `今天已经戳了 ${state.sentToday} 次`
              : "想 TA 的时候，就戳一下"}
          </p>
        </div>

        <button
          type="button"
          onClick={toggle}
          disabled={sending}
          aria-expanded={open}
          className={`min-w-40 shrink-0 rounded-full bg-primary px-5 py-2.5 font-semibold text-white transition-transform duration-200 active:opacity-80 disabled:opacity-40 ${
            justSent ? "scale-105" : "scale-100"
          }`}
        >
          {justSent ? "已戳到 TA ✓" : sending ? "戳出去中…" : "戳一下 👉"}
        </button>
      </div>

      {received && unseenCount > 0 && (
        <p className="mt-3 rounded-xl bg-primary-soft px-3 py-2 text-sm text-primary">
          {received.fromName} {KIND_TEXT[received.kind] ?? "戳了你一下 👉"}
        </p>
      )}

      {open && (
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
          {OPTIONS.map((o) => (
            <button
              key={o.kind}
              type="button"
              onClick={() => void send(o.kind)}
              disabled={sending}
              className="flex flex-col items-center gap-1 rounded-xl border border-border bg-background px-2 py-2.5 text-xs text-foreground active:opacity-80 disabled:opacity-40"
            >
              <span className="text-xl leading-none">{o.emoji}</span>
              <span className="truncate">{o.label}</span>
            </button>
          ))}
        </div>
      )}

      {error && <p className="mt-2 text-sm text-accent">{error}</p>}
    </div>
  );
}
