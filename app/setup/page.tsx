"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface AccountForm {
  username: string;
  password: string;
  displayName: string;
}

const EMPTY: AccountForm = { username: "", password: "", displayName: "" };

const MIN_PASSWORD_LENGTH = 10;

const inputCls =
  "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-foreground outline-none focus:border-primary";

function AccountFields({
  idPrefix,
  value,
  onChange,
}: {
  idPrefix: string;
  value: AccountForm;
  onChange: (next: AccountForm) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label
          htmlFor={`${idPrefix}-displayName`}
          className="mb-1 block text-sm text-muted"
        >
          昵称
        </label>
        <input
          id={`${idPrefix}-displayName`}
          value={value.displayName}
          onChange={(e) => onChange({ ...value, displayName: e.target.value })}
          placeholder="怎么称呼"
          className={inputCls}
        />
      </div>
      <div>
        <label
          htmlFor={`${idPrefix}-username`}
          className="mb-1 block text-sm text-muted"
        >
          用户名
        </label>
        <input
          id={`${idPrefix}-username`}
          value={value.username}
          onChange={(e) => onChange({ ...value, username: e.target.value })}
          autoComplete="off"
          placeholder="登录用的用户名"
          className={inputCls}
        />
      </div>
      <div>
        <label
          htmlFor={`${idPrefix}-password`}
          className="mb-1 block text-sm text-muted"
        >
          密码
        </label>
        <input
          id={`${idPrefix}-password`}
          type="password"
          value={value.password}
          onChange={(e) => onChange({ ...value, password: e.target.value })}
          autoComplete="new-password"
          placeholder={`至少 ${MIN_PASSWORD_LENGTH} 位`}
          className={inputCls}
        />
      </div>
    </div>
  );
}

export default function SetupPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [bootstrapSecret, setBootstrapSecret] = useState("");
  const [me, setMe] = useState<AccountForm>({ ...EMPTY });
  const [partner, setPartner] = useState<AccountForm>({ ...EMPTY });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/setup");
        const data = (await res.json()) as { needsSetup?: boolean };
        if (cancelled) return;
        if (!data.needsSetup) {
          router.replace("/login");
          return;
        }
      } catch {
        // 检查失败也让用户看到表单
      }
      if (!cancelled) setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError("");

    if (!bootstrapSecret) {
      setError("请先填写初始化口令");
      return;
    }

    const pair = [me, partner];
    for (const u of pair) {
      if (!u.username.trim() || !u.displayName.trim()) {
        setError("用户名和昵称都要填哦");
        return;
      }
      if (u.password.length < MIN_PASSWORD_LENGTH) {
        setError(`密码至少要 ${MIN_PASSWORD_LENGTH} 位`);
        return;
      }
    }
    if (me.username.trim() === partner.username.trim()) {
      setError("两个人的用户名不能相同");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bootstrapSecret, users: pair }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "创建失败，再试一次");
        return;
      }
      alert("TA 的账号也建好了，把用户名密码告诉 TA 吧！");
      // 登录后 cookie 变了，必须硬导航：客户端路由缓存里存的是未登录时
      // 预取到的「重定向回 /login」结果，router.replace 会命中它被弹回来
      window.location.assign("/tasks");
    } catch {
      setError("网络出了点问题，再试一次");
    } finally {
      setSubmitting(false);
    }
  }

  if (checking) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background">
        <p className="text-muted">加载中…</p>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto max-w-md px-4 pb-10 pt-12">
        <div className="mb-6 text-center">
          <div className="text-5xl">💞</div>
          <h1 className="mt-3 text-2xl font-bold text-foreground">
            创建你们两个人的账号
          </h1>
          <p className="mt-1 text-sm text-muted">
            只需要设置这一次，两个账号一起建好
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <label
              htmlFor="bootstrap-secret"
              className="mb-1 block text-sm text-muted"
            >
              初始化口令
            </label>
            <input
              id="bootstrap-secret"
              type="password"
              value={bootstrapSecret}
              onChange={(e) => setBootstrapSecret(e.target.value)}
              autoComplete="off"
              placeholder="初始化口令"
              className={inputCls}
            />
            <p className="mt-1.5 text-xs text-muted">
              部署时你设置的 BOOTSTRAP_SECRET
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <h2 className="mb-3 font-semibold text-primary">我（本机使用）</h2>
            <AccountFields idPrefix="me" value={me} onChange={setMe} />
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <h2 className="mb-3 font-semibold text-primary">TA（另一半）</h2>
            <AccountFields
              idPrefix="partner"
              value={partner}
              onChange={setPartner}
            />
          </div>

          {error && <p className="text-center text-sm text-accent">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-full bg-primary py-2.5 font-semibold text-white active:opacity-80 disabled:opacity-40"
          >
            {submitting ? "创建中…" : "开启我们的任务之旅"}
          </button>
        </form>
      </div>
    </main>
  );
}
