"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import MilestoneBanner from "@/components/MilestoneBanner";
import PokeButton from "@/components/PokeButton";
import BrandMark from "@/components/BrandMark";
import TabIcon from "@/components/TabIcon";

interface Me {
  id: string;
  displayName: string;
}

interface TaskItem {
  id: string;
  creatorId: string;
  assigneeId: string;
  title: string;
  description: string | null;
  points: number;
  repeat: "once" | "daily";
  dueAt: string | null;
  createdAt: string;
  creatorName: string;
  assigneeName: string;
  doneToday: boolean;
  hasPendingCompletion: boolean;
  mine: boolean;
}

interface PendingConfirmation {
  id: string;
  taskId: string;
  taskTitle: string;
  points: number;
  completedByName: string;
  note: string | null;
  proofKey: string | null;
  createdAt: string;
}

function formatDueAt(iso: string): string {
  return new Date(iso).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function PointsBadge({ points }: { points: number }) {
  return (
    <span className="rounded-full bg-primary-soft px-2 py-0.5 text-sm text-primary">
      +{points} 分
    </span>
  );
}

// 我的任务卡：可展开内联打卡表单
function MyTaskCard({
  task,
  canArchive,
  onRefresh,
  onError,
  onArchive,
}: {
  task: TaskItem;
  canArchive: boolean;
  onRefresh: () => Promise<void>;
  onError: (msg: string) => void;
  onArchive: (taskId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function submit() {
    setSubmitting(true);
    try {
      const fd = new FormData();
      if (note.trim()) fd.append("note", note.trim());
      if (file) fd.append("photo", file);
      const res = await fetch(`/api/tasks/${task.id}/complete`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        onError(j?.error ?? "提交失败，请重试");
      } else {
        setOpen(false);
        setNote("");
        setFile(null);
        if (fileRef.current) fileRef.current.value = "";
      }
      await onRefresh();
    } catch {
      onError("网络异常，请重试");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-foreground">{task.title}</span>
            <PointsBadge points={task.points} />
            {task.repeat === "daily" && (
              <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">
                每日
              </span>
            )}
          </div>
          {task.description && (
            <p className="mt-1 text-sm text-muted">{task.description}</p>
          )}
          {task.dueAt && (
            <p className="mt-1 text-xs text-muted">
              截止 {formatDueAt(task.dueAt)}
            </p>
          )}
        </div>
        {canArchive && (
          <button
            onClick={() => onArchive(task.id)}
            className="shrink-0 text-xs text-muted underline-offset-2 active:opacity-80"
          >
            归档
          </button>
        )}
      </div>

      {task.hasPendingCompletion ? (
        <button
          disabled
          className="mt-3 w-full rounded-full bg-border py-2.5 font-semibold text-muted"
        >
          等 TA 确认中
        </button>
      ) : open ? (
        <div className="mt-3 space-y-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="备注（可选）"
            rows={2}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="w-full text-sm text-muted file:mr-2 file:rounded-full file:border-0 file:bg-primary-soft file:px-3 file:py-1.5 file:text-sm file:text-primary"
          />
          <div className="flex gap-2">
            <button
              onClick={submit}
              disabled={submitting}
              className="flex-1 rounded-full bg-primary py-2.5 font-semibold text-white active:opacity-80 disabled:opacity-40"
            >
              {submitting ? "提交中…" : "提交打卡"}
            </button>
            <button
              onClick={() => setOpen(false)}
              disabled={submitting}
              className="rounded-full border border-border px-5 py-2.5 font-semibold text-muted active:opacity-80 disabled:opacity-40"
            >
              取消
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="mt-3 w-full rounded-full bg-primary py-2.5 font-semibold text-white active:opacity-80"
        >
          完成打卡
        </button>
      )}
    </div>
  );
}

export default function TasksPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [pending, setPending] = useState<PendingConfirmation[]>([]);
  const [streakDays, setStreakDays] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [meRes, tasksRes, statsRes] = await Promise.all([
        fetch("/api/auth/me"),
        fetch("/api/tasks"),
        fetch("/api/stats"),
      ]);
      if (meRes.ok) {
        const j = (await meRes.json()) as {
          user?: Partial<Me>;
          partner?: Partial<Me> | null;
        } & Partial<Me>;
        const u = j.user ?? j;
        if (u?.displayName)
          setMe({ id: u.id ?? "", displayName: u.displayName });
      }
      if (tasksRes.ok) {
        const j = (await tasksRes.json()) as {
          tasks?: TaskItem[];
          pendingConfirmations?: PendingConfirmation[];
        };
        setTasks(j.tasks ?? []);
        setPending(j.pendingConfirmations ?? []);
      } else {
        const j = (await tasksRes.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(j?.error ?? "加载失败，请下拉重试");
      }
      // 火花条是锦上添花，拉不到就当没有，不打扰主流程
      if (statsRes.ok) {
        const j = (await statsRes.json().catch(() => null)) as {
          taskStreak?: { current?: number };
        } | null;
        setStreakDays(j?.taskStreak?.current ?? 0);
      }
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

  async function act(completionId: string, action: "confirm" | "reject") {
    setActingId(completionId);
    setError(null);
    try {
      const res = await fetch(`/api/completions/${completionId}/${action}`, {
        method: "POST",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(j?.error ?? "操作失败，请重试");
      }
      await load();
    } catch {
      setError("网络异常，请重试");
    } finally {
      setActingId(null);
    }
  }

  async function archive(taskId: string) {
    if (!window.confirm("确定归档这个任务吗？归档后不再显示。")) return;
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(j?.error ?? "归档失败，请重试");
      }
      await load();
    } catch {
      setError("网络异常，请重试");
    }
  }

  const todayStr = new Date().toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-md md:max-w-2xl px-4 md:px-6 pt-6">
        <div className="h-8 w-44 animate-pulse rounded-lg bg-primary-soft" />
        <div className="mt-2 h-4 w-28 animate-pulse rounded bg-border" />
        <div className="mt-6 space-y-3">
          <div className="h-28 animate-pulse rounded-2xl bg-card shadow-sm" />
          <div className="h-28 animate-pulse rounded-2xl bg-card shadow-sm" />
        </div>
      </div>
    );
  }

  const myTasks = tasks.filter((t) => t.mine && !t.doneToday);
  const myDoneToday = tasks.filter((t) => t.mine && t.doneToday);
  const partnerTasks = tasks.filter((t) => !t.mine);

  return (
    <div className="mx-auto w-full max-w-md md:max-w-2xl px-4 md:px-6 pt-6">
      <h1 className="text-2xl font-bold text-foreground">
        Hi，{me?.displayName ?? ""}
        <BrandMark size={30} className="ml-1 inline-block align-[-6px]" />
      </h1>
      <p className="mt-1 text-sm text-muted">{todayStr}</p>

      <MilestoneBanner />

      {/* 火花条：还没开始连续时不显示，别一上来就泼冷水 */}
      {streakDays > 0 && (
        <Link
          href="/achievements"
          className="mt-2 flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm shadow-sm active:opacity-80"
        >
          <span className="font-semibold text-primary">
            🔥 连续 {streakDays} 天
          </span>
          <span className="ml-auto text-xs text-muted">看成就 ›</span>
        </Link>
      )}

      {/* 时光和成就不占底部标签位，从这里进 */}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Link
          href="/moments"
          className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground shadow-sm active:opacity-80"
        >
          <TabIcon name="moments" size={18} /> 时光
        </Link>
        <Link
          href="/achievements"
          className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground shadow-sm active:opacity-80"
        >
          <TabIcon name="trophy" size={18} /> 成就
        </Link>
      </div>

      <div className="mt-3">
        <PokeButton />
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-accent bg-card px-3 py-2 text-sm text-accent">
          {error}
        </div>
      )}

      {/* 等你确认 */}
      {pending.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-accent">
            🔔 等你确认
          </h2>
          <div className="space-y-3">
            {pending.map((c) => (
              <div
                key={c.id}
                className="rounded-2xl border border-accent bg-card p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-foreground">
                    {c.taskTitle}
                  </span>
                  <PointsBadge points={c.points} />
                </div>
                <p className="mt-1 text-sm text-muted">
                  {c.completedByName} 提交了完成打卡
                </p>
                {c.note && (
                  <p className="mt-1 text-sm text-foreground">「{c.note}」</p>
                )}
                {c.proofKey && (
                  <a
                    href={`/api/photos/${c.proofKey}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/photos/${c.proofKey}`}
                      alt="打卡照片"
                      className="h-24 w-24 rounded-xl object-cover"
                    />
                  </a>
                )}
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => act(c.id, "confirm")}
                    disabled={actingId === c.id}
                    className="flex-1 rounded-full bg-primary py-2.5 font-semibold text-white active:opacity-80 disabled:opacity-40"
                  >
                    确认（记 {c.points} 分）
                  </button>
                  <button
                    onClick={() => act(c.id, "reject")}
                    disabled={actingId === c.id}
                    className="rounded-full border border-border px-5 py-2.5 font-semibold text-muted active:opacity-80 disabled:opacity-40"
                  >
                    打回
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 我的任务 */}
      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-foreground">我的任务</h2>
        {myTasks.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted shadow-sm">
            暂无待办任务，点右下角 + 新建一个吧
          </div>
        ) : (
          <div className="space-y-3">
            {myTasks.map((t) => (
              <MyTaskCard
                key={t.id}
                task={t}
                canArchive={!!me && t.creatorId === me.id}
                onRefresh={load}
                onError={setError}
                onArchive={archive}
              />
            ))}
          </div>
        )}

        {myDoneToday.length > 0 && (
          <details className="mt-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
            <summary className="cursor-pointer text-sm font-medium text-muted">
              今日已完成（{myDoneToday.length}）
            </summary>
            <div className="mt-2 space-y-2">
              {myDoneToday.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-foreground">
                    <span className="mr-1 text-green-600">✓</span>
                    {t.title}
                  </span>
                  <span className="text-xs text-muted">
                    {t.hasPendingCompletion ? "待 TA 确认" : `+${t.points} 分`}
                  </span>
                </div>
              ))}
            </div>
          </details>
        )}
      </section>

      {/* TA 的任务 */}
      <section className="mt-6 pb-6">
        <h2 className="mb-2 text-sm font-semibold text-foreground">
          TA 的任务
        </h2>
        {partnerTasks.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted shadow-sm">
            TA 现在没有任务
          </div>
        ) : (
          <div className="space-y-3">
            {partnerTasks.map((t) => (
              <div
                key={t.id}
                className="rounded-2xl border border-border bg-card p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-foreground">
                        {t.title}
                      </span>
                      <PointsBadge points={t.points} />
                      {t.repeat === "daily" && (
                        <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">
                          每日
                        </span>
                      )}
                    </div>
                    {t.description && (
                      <p className="mt-1 text-sm text-muted">{t.description}</p>
                    )}
                    {t.dueAt && (
                      <p className="mt-1 text-xs text-muted">
                        截止 {formatDueAt(t.dueAt)}
                      </p>
                    )}
                    <p className="mt-2 text-xs text-muted">
                      执行人：{t.assigneeName} ·{" "}
                      {t.doneToday ? (
                        <span className="text-green-600">今日已完成 ✓</span>
                      ) : t.hasPendingCompletion ? (
                        <span className="text-accent">待你确认</span>
                      ) : (
                        "进行中"
                      )}
                    </p>
                  </div>
                  {me && t.creatorId === me.id && (
                    <button
                      onClick={() => archive(t.id)}
                      className="shrink-0 text-xs text-muted underline-offset-2 active:opacity-80"
                    >
                      归档
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 悬浮新建按钮 */}
      <Link
        href="/tasks/new"
        aria-label="新建任务"
        className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-3xl text-white shadow-lg active:opacity-80 md:bottom-8"
      >
        ＋
      </Link>
    </div>
  );
}
