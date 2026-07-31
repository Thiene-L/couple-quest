"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

interface Person {
  id: string;
  displayName: string;
}

export default function NewTaskPage() {
  const router = useRouter();
  const [me, setMe] = useState<Person | null>(null);
  const [partner, setPartner] = useState<Person | null>(null);
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [points, setPoints] = useState("10");
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [repeat, setRepeat] = useState<"once" | "daily">("once");
  const [dueAt, setDueAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (res.ok) {
          type UserLite = { id?: string; displayName?: string };
          const j = (await res.json()) as {
            user?: UserLite & { partner?: UserLite | null };
            partner?: UserLite | null;
          } & UserLite;
          const u = j.user ?? j;
          if (u?.id) setMe({ id: u.id, displayName: u.displayName ?? "我" });
          const p = j.partner ?? u?.partner ?? null;
          if (p?.id) {
            setPartner({ id: p.id, displayName: p.displayName ?? "对方" });
            // 默认执行人是对方
            setAssigneeId(p.id);
          } else if (u?.id) {
            setAssigneeId(u.id);
          }
        }
      } catch {
        // 加载失败时表单仍可填，提交前会再校验执行人
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!title.trim()) {
      setError("标题不能为空");
      return;
    }
    const p = Number(points);
    if (!Number.isInteger(p) || p < 1 || p > 9999) {
      setError("积分需为 1-9999 的整数");
      return;
    }
    if (!assigneeId) {
      setError("请选择执行人");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          points: p,
          assigneeId,
          repeat,
          dueAt:
            repeat === "once" && dueAt ? new Date(dueAt).getTime() : undefined,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(j?.error ?? "创建失败，请重试");
        return;
      }
      router.push("/tasks");
    } catch {
      setError("网络异常，请重试");
    } finally {
      setSubmitting(false);
    }
  }

  const segBtn = (active: boolean) =>
    `flex-1 rounded-full py-2 text-sm font-medium transition-colors ${
      active ? "bg-primary text-white" : "text-muted"
    }`;

  return (
    <div className="mx-auto w-full max-w-md md:max-w-2xl px-4 md:px-6 pt-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">新建任务</h1>
        <Link href="/tasks" className="text-sm text-muted active:opacity-80">
          返回
        </Link>
      </div>

      {loading ? (
        <div className="mt-6 space-y-3">
          <div className="h-12 animate-pulse rounded-xl bg-card shadow-sm" />
          <div className="h-24 animate-pulse rounded-xl bg-card shadow-sm" />
          <div className="h-12 animate-pulse rounded-xl bg-card shadow-sm" />
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4 pb-8">
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              标题
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="比如：洗碗、遛狗、做早餐"
              maxLength={100}
              className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-foreground outline-none placeholder:text-muted focus:border-primary"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              描述（可选）
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="补充说明一下…"
              rows={3}
              className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-foreground outline-none placeholder:text-muted focus:border-primary"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              积分
            </label>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={9999}
              value={points}
              onChange={(e) => setPoints(e.target.value)}
              className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-foreground outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              执行人
            </label>
            <div className="flex rounded-full border border-border bg-card p-1">
              <button
                type="button"
                onClick={() => me && setAssigneeId(me.id)}
                className={segBtn(!!me && assigneeId === me.id)}
              >
                我自己
              </button>
              <button
                type="button"
                onClick={() => partner && setAssigneeId(partner.id)}
                className={segBtn(!!partner && assigneeId === partner.id)}
              >
                {partner?.displayName ?? "对方"}
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              类型
            </label>
            <div className="flex rounded-full border border-border bg-card p-1">
              <button
                type="button"
                onClick={() => setRepeat("once")}
                className={segBtn(repeat === "once")}
              >
                一次性
              </button>
              <button
                type="button"
                onClick={() => setRepeat("daily")}
                className={segBtn(repeat === "daily")}
              >
                每日
              </button>
            </div>
          </div>

          {repeat === "once" && (
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">
                截止时间（可选）
              </label>
              <input
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-foreground outline-none focus:border-primary"
              />
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-accent bg-card px-3 py-2 text-sm text-accent">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !title.trim()}
            className="w-full rounded-full bg-primary py-2.5 font-semibold text-white active:opacity-80 disabled:opacity-40"
          >
            {submitting ? "创建中…" : "创建任务"}
          </button>
        </form>
      )}
    </div>
  );
}
