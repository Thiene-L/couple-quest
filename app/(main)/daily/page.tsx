"use client";

import { useCallback, useEffect, useState } from "react";

interface HistoryItem {
  dayKey: string;
  question: string;
  myAnswer: string;
  partnerAnswer: string;
}

interface DailyData {
  dayKey: string;
  question: string;
  myAnswer: string | null;
  partnerAnswer: string | null;
  myName: string;
  partnerName: string;
  bothAnswered: boolean;
  history: HistoryItem[];
}

const MAX_LEN = 500;
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

function formatDay(dayKey: string): string {
  const d = new Date(`${dayKey}T00:00:00Z`);
  const m = Number(dayKey.slice(5, 7));
  const day = Number(dayKey.slice(8, 10));
  return `${m} 月 ${day} 日 星期${WEEKDAYS[d.getUTCDay()]}`;
}

function Avatar({ name }: { name: string }) {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary">
      {name.slice(0, 1) || "?"}
    </span>
  );
}

function AnswerCard({
  name,
  answer,
  mine,
}: {
  name: string;
  answer: string;
  mine: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border border-border p-4 shadow-sm ${
        mine ? "bg-primary-soft" : "bg-card"
      }`}
    >
      <div className="flex items-center gap-2">
        <Avatar name={name} />
        <span className="text-sm font-semibold text-foreground">{name}</span>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-foreground">{answer}</p>
    </div>
  );
}

export default function DailyPage() {
  const [data, setData] = useState<DailyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [openDay, setOpenDay] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/daily");
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(j?.error ?? "加载失败，请重试");
        return;
      }
      setData((await res.json()) as DailyData);
      setError("");
    } catch {
      setError("网络异常，请重试");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // load 的第一条语句就是 await，setState 全部发生在其后；
    // 规则看不穿 useCallback 包装，这里是误报
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function submit() {
    if (!answer.trim()) {
      setError("答案不能为空");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/daily", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer: answer.trim() }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(j?.error ?? "提交失败，请重试");
        return;
      }
      setAnswer("");
      await load();
    } catch {
      setError("网络异常，请重试");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-md px-4 py-6 md:max-w-2xl md:px-6">
        <div className="h-4 w-24 animate-pulse rounded bg-card" />
        <div className="mt-3 h-28 animate-pulse rounded-2xl bg-card shadow-sm" />
        <div className="mt-3 h-32 animate-pulse rounded-2xl bg-card shadow-sm" />
      </div>
    );
  }

  const partnerName = data?.partnerName || "TA";

  return (
    <div className="mx-auto w-full max-w-md px-4 py-6 md:max-w-2xl md:px-6">
      <p className="text-sm text-muted">
        {data ? formatDay(data.dayKey) : ""}
      </p>
      <h1 className="mt-1 text-2xl font-bold text-foreground">每日一问</h1>

      {error && (
        <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-500">
          {error}
        </p>
      )}

      {/* 今天的题 */}
      <div className="mt-4 rounded-2xl bg-primary-soft p-5 shadow-sm">
        <p className="text-xl font-semibold leading-relaxed text-foreground md:text-2xl">
          {data?.question}
        </p>
      </div>

      {/* 三种状态 */}
      {data && !data.myAnswer && (
        <div className="mt-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value.slice(0, MAX_LEN))}
            rows={5}
            maxLength={MAX_LEN}
            placeholder="写下你的答案…"
            className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-foreground outline-none focus:border-primary"
          />
          <div className="mt-1 text-right text-xs text-muted">
            {answer.length}/{MAX_LEN}
          </div>
          <button
            onClick={submit}
            disabled={submitting || !answer.trim()}
            className="mt-2 w-full rounded-full bg-primary py-2.5 font-semibold text-white active:opacity-80 disabled:opacity-40"
          >
            {submitting ? "提交中…" : "提交答案"}
          </button>
          <p className="mt-2 text-center text-xs text-muted">
            两个人都答完，才能看到对方写了什么
          </p>
        </div>
      )}

      {data?.myAnswer && !data.bothAnswered && (
        <div className="mt-4 space-y-3">
          <AnswerCard name={data.myName} answer={data.myAnswer} mine />
          <p className="text-center text-sm text-muted">
            已作答，等 {partnerName} 回答后就能看到 TA 写了什么 🤫
          </p>
        </div>
      )}

      {data?.bothAnswered && data.myAnswer && data.partnerAnswer && (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <AnswerCard name={data.myName} answer={data.myAnswer} mine />
          <AnswerCard
            name={partnerName}
            answer={data.partnerAnswer}
            mine={false}
          />
        </div>
      )}

      {/* 往期回顾 */}
      {data && data.history.length > 0 && (
        <>
          <h2 className="mt-8 text-sm font-semibold text-foreground">
            往期回顾
          </h2>
          <div className="mt-2 space-y-2">
            {data.history.map((h) => {
              const open = openDay === h.dayKey;
              return (
                <div
                  key={h.dayKey}
                  className="rounded-2xl border border-border bg-card p-4 shadow-sm"
                >
                  <button
                    onClick={() => setOpenDay(open ? null : h.dayKey)}
                    className="flex w-full items-start justify-between gap-3 text-left"
                  >
                    <span className="min-w-0">
                      <span className="block text-xs text-muted">
                        {formatDay(h.dayKey)}
                      </span>
                      <span className="mt-0.5 block font-medium text-foreground">
                        {h.question}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm text-muted">
                      {open ? "收起" : "展开"}
                    </span>
                  </button>
                  {open && (
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      <AnswerCard
                        name={data.myName}
                        answer={h.myAnswer}
                        mine
                      />
                      <AnswerCard
                        name={partnerName}
                        answer={h.partnerAnswer}
                        mine={false}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
