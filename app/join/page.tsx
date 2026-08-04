"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import BrandMark from "@/components/BrandMark";

const MIN_PASSWORD_LENGTH = 10;
const MAX_DISPLAY_NAME_LENGTH = 20;
const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{2,20}$/;

const inputCls =
  "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-foreground outline-none focus:border-primary";

interface CheckResult {
  valid: boolean;
  reason?: string;
  inviterName?: string;
}

/** 昵称：非空，最多 20 个字 */
function displayNameError(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "昵称不能为空";
  if ([...trimmed].length > MAX_DISPLAY_NAME_LENGTH)
    return `昵称最多 ${MAX_DISPLAY_NAME_LENGTH} 个字`;
  return "";
}

/** 用户名：字母 / 数字 / 下划线 / 减号，2-20 位 */
function usernameError(value: string): string {
  if (!value) return "用户名不能为空";
  if (!USERNAME_PATTERN.test(value))
    return "用户名只能用字母、数字、下划线或减号，2-20 位";
  return "";
}

/** 密码：至少 10 位 */
function passwordError(value: string): string {
  if (value.length < MIN_PASSWORD_LENGTH)
    return `密码至少要 ${MIN_PASSWORD_LENGTH} 位`;
  return "";
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto max-w-md px-4 pb-[calc(2.5rem+env(safe-area-inset-bottom))] pt-12">
        {children}
      </div>
    </main>
  );
}

function FieldError({ message }: { message: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-accent">{message}</p>;
}

function JoinInner() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code") ?? "";

  const [checking, setChecking] = useState(true);
  const [check, setCheck] = useState<CheckResult | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState({
    displayName: false,
    username: false,
    password: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // 没有 code 时结果在渲染期就是确定的，走下面的派生值，不发请求
    if (!code) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/auth/join?code=${encodeURIComponent(code)}`,
        );
        const data = (await res.json()) as CheckResult;
        if (cancelled) return;
        setCheck(data);
      } catch {
        if (cancelled) return;
        setCheck({
          valid: false,
          reason: "网络出了点问题，稍后再打开一次这个链接吧",
        });
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  // 链接里没带 code 是渲染期就能判定的，不必经过 state
  const NO_CODE: CheckResult = {
    valid: false,
    reason: "这个邀请链接不太完整，让 TA 把完整的链接重新发你一次吧",
  };
  const result = code ? check : NO_CODE;
  const loading = code ? checking : false;

  const nameErr = displayNameError(displayName);
  const userErr = usernameError(username);
  const passErr = passwordError(password);
  const formValid = !nameErr && !userErr && !passErr;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError("");
    setTouched({ displayName: true, username: true, password: true });
    if (!formValid) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          username,
          password,
          displayName: displayName.trim(),
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "加入失败，再试一次");
        return;
      }
      // 注册后 cookie 变了，必须硬导航：客户端路由缓存里存的是未登录时
      // 预取到的「重定向回 /login」结果，router.replace 会命中它被弹回来
      window.location.assign("/tasks");
    } catch {
      setError("网络出了点问题，再试一次");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background">
        <p className="text-muted">加载中…</p>
      </main>
    );
  }

  if (!result?.valid) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background">
        <div className="mx-auto w-full max-w-md px-4">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="text-center">
              <div className="text-5xl">💔</div>
              <h1 className="mt-3 text-xl font-bold text-foreground">
                这张邀请函暂时用不了
              </h1>
              <p className="mt-2 text-sm text-muted">
                {result?.reason ?? "邀请链接无效或已经被用过了"}
              </p>
            </div>
            <a
              href="/login"
              className="mt-5 block w-full rounded-full bg-primary py-2.5 text-center font-semibold text-white active:opacity-80"
            >
              去登录
            </a>
            <p className="mt-3 text-center text-xs text-muted">
              已经有账号了就直接登录，没有的话让 TA 再发你一张
            </p>
          </div>
        </div>
      </main>
    );
  }

  const inviterName = result.inviterName?.trim() || "TA";

  return (
    <PageShell>
      <div className="mb-6 text-center">
        <BrandMark size={104} variant="full" className="mx-auto" />
        <h1 className="mt-3 text-2xl font-bold text-foreground">
          {inviterName} 邀请你一起玩 💞
        </h1>
        <p className="mt-2 text-sm text-muted">
          注册一个只属于你的账号，密码只有你自己知道
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="space-y-3">
            <div>
              <label
                htmlFor="join-displayName"
                className="mb-1 block text-sm text-muted"
              >
                昵称
              </label>
              <input
                id="join-displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, displayName: true }))}
                autoComplete="nickname"
                placeholder={`${inviterName} 会看到的名字`}
                className={inputCls}
              />
              <FieldError message={touched.displayName ? nameErr : ""} />
            </div>

            <div>
              <label
                htmlFor="join-username"
                className="mb-1 block text-sm text-muted"
              >
                用户名
              </label>
              <input
                id="join-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, username: true }))}
                autoComplete="username"
                placeholder="登录用的用户名"
                className={inputCls}
              />
              <FieldError message={touched.username ? userErr : ""} />
            </div>

            <div>
              <label
                htmlFor="join-password"
                className="mb-1 block text-sm text-muted"
              >
                密码
              </label>
              <input
                id="join-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                autoComplete="new-password"
                placeholder={`至少 ${MIN_PASSWORD_LENGTH} 位`}
                className={inputCls}
              />
              <FieldError message={touched.password ? passErr : ""} />
              <p className="mt-1.5 text-xs text-muted">
                这个密码只有你自己知道，{inviterName} 也看不到
              </p>
            </div>
          </div>
        </div>

        {error && <p className="text-center text-sm text-accent">{error}</p>}

        <button
          type="submit"
          disabled={submitting || !formValid}
          className="w-full rounded-full bg-primary py-2.5 font-semibold text-white active:opacity-80 disabled:opacity-40"
        >
          {submitting ? "加入中…" : "接受邀请，加入我们"}
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-muted">
        加入之后，你们的任务、积分和小心愿就连在一起啦
      </p>
    </PageShell>
  );
}

export default function JoinPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-dvh items-center justify-center bg-background">
          <p className="text-muted">加载中…</p>
        </main>
      }
    >
      <JoinInner />
    </Suspense>
  );
}
