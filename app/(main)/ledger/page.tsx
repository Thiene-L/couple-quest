"use client";

import { useEffect, useState } from "react";
import BackLink from "@/components/BackLink";
import BrandMark from "@/components/BrandMark";

interface LedgerEntry {
  id: string;
  delta: number;
  reason: string;
  refType: "task" | "redemption" | "adjust";
  createdAt: string;
}

interface LedgerData {
  balances: { me: number; partner: number };
  partnerName: string;
  entries: LedgerEntry[];
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function LedgerPage() {
  const [data, setData] = useState<LedgerData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/ledger");
        if (res.ok) setData((await res.json()) as LedgerData);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-md md:max-w-2xl px-4 md:px-6 py-6">
        <BackLink href="/store" />
        <h1 className="text-2xl font-bold text-foreground">账本</h1>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="h-24 animate-pulse rounded-2xl bg-primary-soft" />
          <div className="h-24 animate-pulse rounded-2xl bg-primary-soft/60" />
        </div>
        <p className="mt-4 text-center text-sm text-muted">加载中…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md md:max-w-2xl px-4 md:px-6 py-6">
      <BackLink href="/store" />
      <h1 className="text-2xl font-bold text-foreground">账本</h1>

      {/* 两人余额 */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-primary p-4 text-white shadow-sm">
          <p className="text-sm opacity-90">我的积分</p>
          <p className="mt-1 text-3xl font-bold">{data?.balances.me ?? 0}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <p className="text-sm text-muted">
            {data?.partnerName ? `${data.partnerName} 的积分` : "TA 的积分"}
          </p>
          <p className="mt-1 text-3xl font-bold text-foreground">
            {data?.balances.partner ?? 0}
          </p>
        </div>
      </div>

      {/* 我的明细时间线 */}
      <section className="mt-6">
        <h2 className="text-sm font-semibold text-muted">我的积分明细</h2>
        {!data || data.entries.length === 0 ? (
          <p className="mt-2 rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted shadow-sm">
            还没有积分记录，去完成任务吧～
          </p>
        ) : (
          <div className="mt-2 rounded-2xl border border-border bg-card p-4 shadow-sm">
            <ul className="divide-y divide-border">
              {data.entries.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-foreground">
                      {e.reason}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {formatTime(e.createdAt)}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 text-base font-bold ${
                      e.delta >= 0 ? "text-emerald-600" : "text-rose-500"
                    }`}
                  >
                    {e.delta >= 0 ? `+${e.delta}` : `-${Math.abs(e.delta)}`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
