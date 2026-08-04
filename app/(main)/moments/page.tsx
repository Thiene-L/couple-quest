"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

interface MomentItem {
  id: string;
  taskTitle: string;
  points: number;
  completedByName: string;
  completedById: string;
  note: string | null;
  proofKey: string | null;
  confirmedAt: string | null;
  createdAt: string;
}

interface MomentsData {
  moments: MomentItem[];
  stats: { total: number; withPhoto: number; firstAt: string | null };
}

interface DayGroup {
  key: string;
  label: string;
  weekday: string;
  items: MomentItem[];
}

const WEEKDAYS = [
  "星期日",
  "星期一",
  "星期二",
  "星期三",
  "星期四",
  "星期五",
  "星期六",
];

function dayKeyOf(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function dayLabel(d: Date): string {
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

function timeLabel(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 从第一个瞬间那天算到今天，含头含尾
function daysSince(iso: string): number {
  const start = new Date(iso);
  start.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = Math.round((now.getTime() - start.getTime()) / 86_400_000);
  return Math.max(diff + 1, 1);
}

// 接口已按时间倒序，顺序扫一遍就能切出日期分组
function groupByDay(moments: MomentItem[]): DayGroup[] {
  const groups: DayGroup[] = [];
  let current: DayGroup | null = null;
  for (const m of moments) {
    const d = new Date(m.createdAt);
    const key = dayKeyOf(d);
    if (!current || current.key !== key) {
      current = {
        key,
        label: dayLabel(d),
        weekday: WEEKDAYS[d.getDay()] ?? "",
        items: [],
      };
      groups.push(current);
    }
    current.items.push(m);
  }
  return groups;
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export default function MomentsPage() {
  const [data, setData] = useState<MomentsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/moments");
      if (!res.ok) {
        setError("加载失败了，稍后再试试～");
        return;
      }
      setData((await res.json()) as MomentsData);
      setError("");
    } catch {
      setError("网络出错了，请稍后再试");
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

  // 从别的页面切回来时重新拉一次：刚确认的打卡能立刻出现在时光轴上
  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === "visible") void load();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [load]);

  const groups = useMemo(() => groupByDay(data?.moments ?? []), [data]);

  const total = data?.stats.total ?? 0;
  const withPhoto = data?.stats.withPhoto ?? 0;
  const firstAt = data?.stats.firstAt ?? null;

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-md md:max-w-2xl px-4 md:px-6 py-6">
        <h1 className="text-2xl font-bold text-foreground">我们的时光</h1>
        <div className="mt-2 h-4 w-40 animate-pulse rounded-full bg-primary-soft" />
        <div className="mt-4 hidden gap-3 md:grid md:grid-cols-3">
          <div className="h-24 animate-pulse rounded-2xl bg-primary-soft" />
          <div className="h-24 animate-pulse rounded-2xl bg-primary-soft/70" />
          <div className="h-24 animate-pulse rounded-2xl bg-primary-soft/50" />
        </div>
        <div className="mt-6 space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex gap-3 md:gap-4">
              <div className="flex w-3 shrink-0 flex-col items-center">
                <span className="mt-5 h-3 w-3 shrink-0 animate-pulse rounded-full bg-primary-soft" />
                <span className="mt-1 w-px flex-1 bg-border" />
              </div>
              <div className="h-36 flex-1 animate-pulse rounded-2xl bg-primary-soft/60 md:h-52" />
            </div>
          ))}
        </div>
        <p className="mt-4 text-center text-sm text-muted">加载中…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md md:max-w-2xl px-4 md:px-6 py-6">
      <h1 className="text-2xl font-bold text-foreground">我们的时光</h1>
      <p className="mt-1 text-sm text-muted">
        共 {total} 个瞬间 · {withPhoto} 张照片
      </p>

      {/* 宽屏多给一排统计卡，窄屏只留上面那行小字 */}
      <div className="mt-4 hidden gap-3 md:grid md:grid-cols-3">
        <StatCard label="瞬间" value={`${total} 个`} hint="确认过的打卡" />
        <StatCard label="照片" value={`${withPhoto} 张`} hint="留下影像的瞬间" />
        <StatCard
          label="一切开始于"
          value={firstAt ? dayLabel(new Date(firstAt)) : "还没开始"}
          hint={firstAt ? `已经第 ${daysSince(firstAt)} 天啦` : "等第一个瞬间"}
        />
      </div>

      {error && (
        <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-2 text-sm text-rose-500">
          {error}
        </p>
      )}

      {groups.length === 0 && !error && (
        <div className="mt-6 rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
          <p className="text-4xl">📸</p>
          <p className="mt-3 text-sm text-muted">
            还没有瞬间，去完成第一个任务吧～
          </p>
          <Link
            href="/tasks"
            className="mt-4 inline-block rounded-full bg-primary px-6 py-2.5 font-semibold text-white active:opacity-80"
          >
            去看看任务
          </Link>
        </div>
      )}

      {groups.length > 0 && (
        <>
          {groups.map((g) => (
            <section key={g.key} className="mt-5">
              {/* 日期分组标题：滚动时吸顶 */}
              {/* 吸顶位置要让开状态栏：sticky 的 top 是相对视口算的，
                  写 0 会滑到刘海底下 */}
              <div className="sticky top-[env(safe-area-inset-top)] z-10 -mx-4 flex flex-wrap items-baseline gap-x-2 bg-background/90 px-4 py-2 backdrop-blur md:-mx-6 md:px-6">
                <h2 className="text-sm font-semibold text-foreground">
                  {g.label}
                </h2>
                <span className="text-xs text-muted">
                  {g.weekday} · {g.items.length} 个瞬间
                </span>
              </div>

              <ul className="mt-1">
                {g.items.map((m, i) => {
                  const created = new Date(m.createdAt);
                  const isLast = i === g.items.length - 1;
                  return (
                    <li key={m.id} className="flex gap-3 md:gap-4">
                      {/* 时间轴：小圆点 + 竖线 */}
                      <div className="flex w-3 shrink-0 flex-col items-center">
                        <span className="mt-5 h-3 w-3 shrink-0 rounded-full bg-primary ring-4 ring-primary-soft" />
                        {!isLast && (
                          <span className="mt-1 w-px flex-1 bg-border" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1 pb-4">
                        <article className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <h3 className="font-semibold text-foreground">
                              {m.taskTitle}
                            </h3>
                            <span className="rounded-full bg-primary-soft px-2 py-0.5 text-sm font-semibold text-primary">
                              +{m.points} 分
                            </span>
                            <span className="ml-auto shrink-0 text-xs text-muted">
                              {timeLabel(created)}
                            </span>
                          </div>

                          <p className="mt-1 text-sm text-muted">
                            {m.completedByName} 完成
                          </p>

                          {m.note && (
                            <p className="mt-2 text-sm text-foreground">
                              「{m.note}」
                            </p>
                          )}

                          {m.proofKey && (
                            <a
                              href={`/api/photos/${m.proofKey}`}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-3 block overflow-hidden rounded-xl border border-border active:opacity-80"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={"/api/photos/" + m.proofKey}
                                alt={`${m.taskTitle} 的打卡照片`}
                                loading="lazy"
                                className="h-56 w-full rounded-xl object-cover transition-transform duration-300 md:h-80 md:hover:scale-[1.02]"
                              />
                            </a>
                          )}
                        </article>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}

          {total > (data?.moments.length ?? 0) && (
            <p className="mt-2 text-center text-xs text-muted">
              只显示最近 {data?.moments.length ?? 0} 个瞬间，更早的先收着啦
            </p>
          )}
        </>
      )}
    </div>
  );
}
