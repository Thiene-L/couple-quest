"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { startAuthentication } from "@simplewebauthn/browser";
import { useWebAuthnSupport } from "@/lib/useWebAuthnSupport";

export default function LoginPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [error, setError] = useState("");
  const webauthnOk = useWebAuthnSupport();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/setup");
        const data = (await res.json()) as { needsSetup?: boolean };
        if (cancelled) return;
        if (data.needsSetup) {
          router.replace("/setup");
          return;
        }
      } catch {
        // 检查失败也照常展示登录表单
      }
      if (!cancelled) setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "登录失败");
        return;
      }
      // 登录后 cookie 变了，必须硬导航：客户端路由缓存里存的是未登录时
      // 预取到的「重定向回 /login」结果，router.replace 会命中它被弹回来
      window.location.assign("/tasks");
    } catch {
      setError("网络出了点问题，再试一次");
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePasskeyLogin() {
    if (passkeyBusy) return;
    setError("");
    setPasskeyBusy(true);
    try {
      const optRes = await fetch("/api/auth/passkey/login/options", {
        method: "POST",
      });
      if (!optRes.ok) {
        setError("暂时无法使用面容 / 指纹登录");
        return;
      }
      const optionsJSON = (await optRes.json()) as Parameters<
        typeof startAuthentication
      >[0]["optionsJSON"];
      const response = await startAuthentication({ optionsJSON });
      const verifyRes = await fetch("/api/auth/passkey/login/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response }),
      });
      const data = (await verifyRes.json()) as { error?: string };
      if (!verifyRes.ok) {
        setError(data.error ?? "面容 / 指纹登录失败");
        return;
      }
      // 登录后 cookie 变了，必须硬导航：客户端路由缓存里存的是未登录时
      // 预取到的「重定向回 /login」结果，router.replace 会命中它被弹回来
      window.location.assign("/tasks");
    } catch (err) {
      // 用户主动取消不当作错误
      if (!(err instanceof Error && err.name === "NotAllowedError")) {
        setError("面容 / 指纹登录失败，试试密码登录吧");
      }
    } finally {
      setPasskeyBusy(false);
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
      <div className="mx-auto max-w-md px-4 pb-[calc(2.5rem+env(safe-area-inset-bottom))] pt-16">
        <div className="mb-8 text-center">
          <div className="text-5xl">🎀</div>
          <h1 className="mt-3 text-3xl font-bold text-foreground">
            Couple Quest
          </h1>
          <p className="mt-1 text-sm text-muted">两个人的任务小游戏</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <form onSubmit={handlePasswordLogin} className="space-y-3">
            <div>
              <label
                htmlFor="username"
                className="mb-1 block text-sm text-muted"
              >
                用户名
              </label>
              <input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                placeholder="你的用户名"
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-foreground outline-none focus:border-primary"
              />
            </div>
            <div>
              <label
                htmlFor="password"
                className="mb-1 block text-sm text-muted"
              >
                密码
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="你的密码"
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-foreground outline-none focus:border-primary"
              />
            </div>
            {error && <p className="text-sm text-accent">{error}</p>}
            <button
              type="submit"
              disabled={submitting || !username || !password}
              className="w-full rounded-full bg-primary py-2.5 font-semibold text-white active:opacity-80 disabled:opacity-40"
            >
              {submitting ? "登录中…" : "登录"}
            </button>
          </form>

          {webauthnOk && (
            <>
              <div className="my-4 flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted">或者</span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <button
                type="button"
                onClick={handlePasskeyLogin}
                disabled={passkeyBusy}
                className="w-full rounded-full bg-primary-soft py-2.5 font-semibold text-primary active:opacity-80 disabled:opacity-40"
              >
                {passkeyBusy ? "验证中…" : "🔐 用面容 / 指纹登录"}
              </button>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-muted">
          完成任务攒积分，兑换 TA 的宠爱
        </p>
      </div>
    </main>
  );
}
