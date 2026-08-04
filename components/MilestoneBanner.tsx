"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface Together {
  days: number;
}

interface Upcoming {
  id: string;
  title: string;
  emoji: string | null;
  daysLeft: number;
  expired: boolean;
}

// 首页顶部的纪念日横幅：在一起第几天 + 最近一个 30 天内的纪念日
export default function MilestoneBanner() {
  const [together, setTogether] = useState<Together | null>(null);
  const [next, setNext] = useState<Upcoming | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/milestones");
        if (!res.ok) return;
        const j = (await res.json()) as {
          together: Together | null;
          upcoming: Upcoming[];
        };
        if (cancelled) return;
        setTogether(j.together);
        setNext(
          (j.upcoming ?? []).find((u) => !u.expired && u.daysLeft <= 30) ?? null,
        );
      } catch {
        // 横幅是锦上添花，加载失败就不显示
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loaded) return null;

  const hasAny = together !== null || next !== null;

  return (
    <Link
      href="/milestones"
      className="mt-3 block rounded-xl bg-primary-soft px-3 py-2 active:opacity-80"
    >
      {hasAny ? (
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          {together && (
            <span className="font-semibold text-primary">
              在一起 {together.days} 天 💞
            </span>
          )}
          {next && (
            <span className="text-foreground">
              {next.emoji ?? "📅"}{" "}
              {next.daysLeft === 0
                ? `今天是${next.title} 🎉`
                : `${next.title}还有 ${next.daysLeft} 天`}
            </span>
          )}
        </span>
      ) : (
        <span className="text-sm text-muted">+ 记录你们的纪念日</span>
      )}
    </Link>
  );
}
