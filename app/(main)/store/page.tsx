"use client";

import { useCallback, useEffect, useState } from "react";

interface RewardItem {
  id: string;
  title: string;
  description: string | null;
  cost: number;
  mine: boolean;
  ownerName: string;
}

interface RedemptionItem {
  id: string;
  rewardTitle: string;
  cost: number;
  status: "pending" | "fulfilled" | "cancelled";
  redeemerName: string;
  mine: boolean;
  awaitingMe: boolean;
}

export default function StorePage() {
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState(0);
  const [rewards, setRewards] = useState<RewardItem[]>([]);
  const [redemptions, setRedemptions] = useState<RedemptionItem[]>([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCost, setNewCost] = useState("");

  const load = useCallback(async () => {
    try {
      const [rewardsRes, redemptionsRes, ledgerRes] = await Promise.all([
        fetch("/api/rewards"),
        fetch("/api/redemptions"),
        fetch("/api/ledger"),
      ]);
      if (rewardsRes.ok) {
        const data = (await rewardsRes.json()) as { rewards: RewardItem[] };
        setRewards(data.rewards);
      }
      if (redemptionsRes.ok) {
        const data = (await redemptionsRes.json()) as {
          redemptions: RedemptionItem[];
        };
        setRedemptions(data.redemptions);
      }
      if (ledgerRes.ok) {
        const data = (await ledgerRes.json()) as {
          balances: { me: number };
        };
        setBalance(data.balances.me);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // 统一动作封装：调接口 → 失败展示中文错误 → 成功后重拉数据
  async function act(key: string, url: string, init?: RequestInit) {
    setBusyId(key);
    setError("");
    try {
      const res = await fetch(url, init);
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(data?.error ?? "操作失败，请稍后再试");
        return false;
      }
      await load();
      return true;
    } catch {
      setError("网络出错了，请稍后再试");
      return false;
    } finally {
      setBusyId("");
    }
  }

  async function addReward(e: React.FormEvent) {
    e.preventDefault();
    const cost = Number(newCost);
    const ok = await act("add", "/api/rewards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle.trim(), cost }),
    });
    if (ok) {
      setNewTitle("");
      setNewCost("");
      setShowForm(false);
    }
  }

  const awaitingMe = redemptions.filter((r) => r.awaitingMe);
  const myPending = redemptions.filter(
    (r) => r.mine && r.status === "pending",
  );
  const partnerRewards = rewards.filter((r) => !r.mine);
  const myRewards = rewards.filter((r) => r.mine);

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-md md:max-w-2xl px-4 md:px-6 py-6">
        <h1 className="text-2xl font-bold text-foreground">商店</h1>
        <div className="mt-4 h-28 animate-pulse rounded-2xl bg-primary-soft" />
        <div className="mt-4 h-24 animate-pulse rounded-2xl bg-primary-soft/60" />
        <p className="mt-4 text-center text-sm text-muted">加载中…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md md:max-w-2xl px-4 md:px-6 py-6">
      <h1 className="text-2xl font-bold text-foreground">商店</h1>

      {/* 余额卡 */}
      <div className="mt-4 rounded-2xl bg-gradient-to-r from-primary to-accent p-5 text-white shadow-sm">
        <p className="text-sm opacity-90">我的积分</p>
        <p className="mt-1 text-4xl font-bold">{balance}</p>
        <p className="mt-1 text-xs opacity-80">完成任务赚积分，兑换 TA 的宠爱</p>
      </div>

      {error && (
        <p className="mt-3 rounded-2xl bg-rose-50 px-4 py-2 text-sm text-rose-500">
          {error}
        </p>
      )}

      {/* 等我兑现 */}
      {awaitingMe.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-muted">等我兑现</h2>
          <div className="mt-2 space-y-3">
            {awaitingMe.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm"
              >
                <p className="text-sm text-foreground">
                  <span className="font-semibold">{r.redeemerName}</span>{" "}
                  兑换了「{r.rewardTitle}」
                </p>
                <button
                  onClick={() => act(r.id, `/api/redemptions/${r.id}/fulfill`, { method: "POST" })}
                  disabled={busyId !== ""}
                  className="shrink-0 rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-white active:opacity-80 disabled:opacity-40"
                >
                  已兑现
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* TA 提供的奖励 */}
      <section className="mt-6">
        <h2 className="text-sm font-semibold text-muted">TA 提供的奖励</h2>
        {partnerRewards.length === 0 ? (
          <p className="mt-2 rounded-2xl border border-border bg-card p-4 text-center text-sm text-muted shadow-sm">
            TA 还没有上架奖励，去催催 TA～
          </p>
        ) : (
          <div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-3">
            {partnerRewards.map((r) => (
              <div
                key={r.id}
                className="flex flex-col rounded-2xl border border-border bg-card p-4 shadow-sm"
              >
                <p className="font-semibold text-foreground">{r.title}</p>
                {r.description && (
                  <p className="mt-1 line-clamp-2 text-xs text-muted">
                    {r.description}
                  </p>
                )}
                <span className="mt-2 self-start rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-semibold text-primary">
                  {r.cost} 分
                </span>
                <button
                  onClick={() => act(r.id, `/api/rewards/${r.id}/redeem`, { method: "POST" })}
                  disabled={balance < r.cost || busyId !== ""}
                  className="mt-3 rounded-full bg-primary py-2 text-sm font-semibold text-white active:opacity-80 disabled:opacity-40"
                >
                  {balance < r.cost ? "积分不够" : "兑换"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 我的 pending 兑换 */}
      {myPending.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-muted">我的兑换</h2>
          <div className="mt-2 space-y-3">
            {myPending.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm"
              >
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {r.rewardTitle}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">等 TA 兑现中…</p>
                </div>
                <button
                  onClick={() => act(r.id, `/api/redemptions/${r.id}/cancel`, { method: "POST" })}
                  disabled={busyId !== ""}
                  className="shrink-0 rounded-full border border-border px-4 py-1.5 text-sm font-semibold text-muted active:opacity-80 disabled:opacity-40"
                >
                  取消
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 我提供的奖励 */}
      <section className="mt-6">
        <h2 className="text-sm font-semibold text-muted">我提供的奖励</h2>
        <div className="mt-2 space-y-3">
          {myRewards.length === 0 && (
            <p className="rounded-2xl border border-border bg-card p-4 text-center text-sm text-muted shadow-sm">
              还没有上架奖励，加一个让 TA 有盼头吧
            </p>
          )}
          {myRewards.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm"
            >
              <div>
                <p className="font-semibold text-foreground">{r.title}</p>
                <p className="mt-0.5 text-xs text-muted">{r.cost} 分</p>
              </div>
              <button
                onClick={() => act(r.id, `/api/rewards/${r.id}`, { method: "DELETE" })}
                disabled={busyId !== ""}
                className="shrink-0 rounded-full border border-border px-4 py-1.5 text-sm font-semibold text-muted active:opacity-80 disabled:opacity-40"
              >
                下架
              </button>
            </div>
          ))}

          {showForm ? (
            <form
              onSubmit={addReward}
              className="rounded-2xl border border-border bg-card p-4 shadow-sm"
            >
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="奖励名称，比如：按摩 30 分钟"
                maxLength={50}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              />
              <input
                value={newCost}
                onChange={(e) => setNewCost(e.target.value)}
                type="number"
                inputMode="numeric"
                min={1}
                max={99999}
                placeholder="所需积分（1-99999）"
                className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              />
              <div className="mt-3 flex gap-2">
                <button
                  type="submit"
                  disabled={
                    busyId !== "" ||
                    !newTitle.trim() ||
                    !Number.isInteger(Number(newCost)) ||
                    Number(newCost) < 1 ||
                    Number(newCost) > 99999
                  }
                  className="flex-1 rounded-full bg-primary py-2.5 font-semibold text-white active:opacity-80 disabled:opacity-40"
                >
                  上架
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="rounded-full border border-border px-5 py-2.5 font-semibold text-muted active:opacity-80"
                >
                  取消
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setShowForm(true)}
              className="w-full rounded-2xl border border-dashed border-border bg-card py-3 text-sm font-semibold text-primary active:opacity-80"
            >
              + 添加奖励
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
