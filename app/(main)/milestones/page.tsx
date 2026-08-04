"use client";

import { useCallback, useEffect, useState } from "react";
import BackLink from "@/components/BackLink";

interface Together {
  id: string;
  title: string;
  date: string;
  emoji: string | null;
  days: number;
}

interface Upcoming {
  id: string;
  title: string;
  date: string;
  kind: "anniversary" | "countdown";
  emoji: string | null;
  daysLeft: number;
  expired: boolean;
  ordinal: number | null;
}

const inputCls =
  "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-foreground outline-none focus:border-primary";
const btnCls =
  "rounded-full bg-primary py-2.5 font-semibold text-white active:opacity-80 disabled:opacity-40";

function formatDate(d: string): string {
  const [y, m, day] = d.split("-");
  return `${y} 年 ${Number(m)} 月 ${Number(day)} 日`;
}

// 距离文案：今天 / 还有 N 天 / 已过去
function leftLabel(u: Upcoming): string {
  if (u.expired) return "已过去";
  if (u.daysLeft === 0) return "就是今天 🎉";
  return `还有 ${u.daysLeft} 天`;
}

export default function MilestonesPage() {
  const [together, setTogether] = useState<Together | null>(null);
  const [upcoming, setUpcoming] = useState<Upcoming[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // 「在一起」表单
  const [editingTogether, setEditingTogether] = useState(false);
  const [togetherDate, setTogetherDate] = useState("");
  const [savingTogether, setSavingTogether] = useState(false);

  // 新增纪念日表单
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [kind, setKind] = useState<"anniversary" | "countdown">("anniversary");
  const [emoji, setEmoji] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/milestones");
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(j?.error ?? "加载失败，请重试");
        return;
      }
      const j = (await res.json()) as {
        together: Together | null;
        upcoming: Upcoming[];
      };
      setTogether(j.together);
      setUpcoming(j.upcoming ?? []);
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

  async function saveTogether() {
    if (!togetherDate) {
      setError("请选择日期");
      return;
    }
    setSavingTogether(true);
    setError("");
    try {
      const res = await fetch("/api/milestones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "在一起",
          date: togetherDate,
          kind: "together",
          emoji: "💞",
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(j?.error ?? "保存失败，请重试");
        return;
      }
      setEditingTogether(false);
      await load();
    } catch {
      setError("网络异常，请重试");
    } finally {
      setSavingTogether(false);
    }
  }

  async function addMilestone() {
    if (!title.trim()) {
      setError("请填写纪念日名称");
      return;
    }
    if (!date) {
      setError("请选择日期");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/milestones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          date,
          kind,
          emoji: emoji.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(j?.error ?? "添加失败，请重试");
        return;
      }
      setTitle("");
      setDate("");
      setEmoji("");
      setAdding(false);
      await load();
    } catch {
      setError("网络异常，请重试");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string, name: string) {
    if (!window.confirm(`确定删除「${name}」吗？`)) return;
    setError("");
    try {
      const res = await fetch(`/api/milestones/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(j?.error ?? "删除失败，请重试");
      }
      await load();
    } catch {
      setError("网络异常，请重试");
    }
  }

  const seg = (active: boolean) =>
    `flex-1 rounded-full py-2 text-sm font-medium transition-colors ${
      active ? "bg-primary text-white" : "text-muted"
    }`;

  return (
    <div className="mx-auto w-full max-w-md px-4 py-6 md:max-w-2xl md:px-6">
      <BackLink href="/tasks" />
      <h1 className="text-2xl font-bold text-foreground">纪念日</h1>

      {error && (
        <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-500">
          {error}
        </p>
      )}

      {loading ? (
        <div className="mt-4 space-y-3">
          <div className="h-28 animate-pulse rounded-2xl bg-card shadow-sm" />
          <div className="h-20 animate-pulse rounded-2xl bg-card shadow-sm" />
        </div>
      ) : (
        <>
          {/* 在一起 */}
          <div className="mt-4 rounded-2xl bg-gradient-to-r from-primary to-accent p-5 text-white shadow-sm">
            {together && !editingTogether ? (
              <>
                <p className="text-sm opacity-90">我们在一起</p>
                <p className="mt-1 text-4xl font-bold">
                  {together.days}
                  <span className="ml-1 text-xl font-semibold">天</span>
                </p>
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-sm opacity-90">
                    从 {formatDate(together.date)} 开始
                  </p>
                  <button
                    onClick={() => {
                      setTogetherDate(together.date);
                      setEditingTogether(true);
                    }}
                    className="rounded-full border border-current px-3 py-1 text-xs active:opacity-80"
                  >
                    修改
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-base font-semibold">
                  记录你们在一起的那天 💞
                </p>
                <p className="mt-1 text-sm opacity-90">
                  设好之后，首页会一直显示在一起第几天
                </p>
                <input
                  type="date"
                  value={togetherDate}
                  onChange={(e) => setTogetherDate(e.target.value)}
                  className="mt-3 w-full rounded-xl border border-white/40 bg-white/15 px-3 py-2.5 text-white outline-none [color-scheme:dark]"
                />
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={saveTogether}
                    disabled={savingTogether}
                    className="flex-1 rounded-full bg-white/90 py-2.5 font-semibold text-primary active:opacity-80 disabled:opacity-40"
                  >
                    {savingTogether ? "保存中…" : "保存"}
                  </button>
                  {together && (
                    <button
                      onClick={() => setEditingTogether(false)}
                      className="rounded-full border border-current px-5 py-2.5 font-semibold active:opacity-80"
                    >
                      取消
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          {/* 纪念日列表 */}
          <h2 className="mt-6 text-sm font-semibold text-foreground">倒数中</h2>
          {upcoming.length === 0 ? (
            <div className="mt-2 rounded-2xl border border-border bg-card p-4 text-center text-sm text-muted shadow-sm">
              还没有纪念日，添加生日、纪念日或想一起去旅行的日子吧～
            </div>
          ) : (
            <div className="mt-2 grid gap-3 md:grid-cols-2">
              {upcoming.map((u) => (
                <div
                  key={u.id}
                  className={`flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm ${
                    u.expired ? "opacity-50" : ""
                  }`}
                >
                  <span className="text-2xl leading-none">
                    {u.emoji ?? "📅"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-foreground">
                      {u.title}
                    </p>
                    <p className="mt-0.5 text-sm text-primary">
                      {leftLabel(u)}
                      {u.kind === "anniversary" && u.ordinal !== null && (
                        <span className="text-muted">
                          {" "}
                          · 将满 {u.ordinal} 周年
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {formatDate(u.date)}
                    </p>
                  </div>
                  <button
                    onClick={() => remove(u.id, u.title)}
                    className="shrink-0 text-xs text-muted underline-offset-2 active:opacity-80"
                  >
                    删除
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 添加 */}
          {adding ? (
            <div className="mt-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-sm text-muted">名称</label>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={20}
                    placeholder="比如：TA 的生日、去日本"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-muted">日期</label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-muted">类型</label>
                  <div className="flex rounded-full border border-border bg-background p-1">
                    <button
                      type="button"
                      onClick={() => setKind("anniversary")}
                      className={seg(kind === "anniversary")}
                    >
                      每年重复
                    </button>
                    <button
                      type="button"
                      onClick={() => setKind("countdown")}
                      className={seg(kind === "countdown")}
                    >
                      一次性倒数
                    </button>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-sm text-muted">
                    表情（可选）
                  </label>
                  <input
                    value={emoji}
                    onChange={(e) => setEmoji(e.target.value)}
                    placeholder="🎂"
                    className={inputCls}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={addMilestone}
                    disabled={saving}
                    className={`flex-1 ${btnCls}`}
                  >
                    {saving ? "添加中…" : "添加"}
                  </button>
                  <button
                    onClick={() => setAdding(false)}
                    disabled={saving}
                    className="rounded-full border border-border px-5 py-2.5 font-semibold text-muted active:opacity-80 disabled:opacity-40"
                  >
                    取消
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="mt-3 w-full rounded-2xl border border-dashed border-border py-3 font-semibold text-primary active:opacity-80"
            >
              + 添加纪念日
            </button>
          )}
        </>
      )}
    </div>
  );
}
