"use client";

import { useEffect, useState } from "react";
import BrandMark from "@/components/BrandMark";

const MIN_PASSWORD_LENGTH = 10;
const MAX_DISPLAY_NAME_LENGTH = 20;
const USERNAME_PATTERN = /^[A-Za-z0-9_-]{2,20}$/;

const USERNAME_ERROR = "用户名只能用字母、数字、下划线或减号，2-20 位";
const PASSWORD_ERROR = `密码至少要 ${MIN_PASSWORD_LENGTH} 位`;

const inputCls =
  "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-foreground outline-none focus:border-primary";
const labelCls = "mb-1 block text-sm text-muted";
const fieldErrorCls = "mt-1.5 text-xs text-accent";

interface FieldErrors {
  bootstrapSecret?: string;
  displayName?: string;
  username?: string;
  password?: string;
}

/** 昵称按字符数算，避免 emoji / 中文被 UTF-16 长度误判 */
function charLength(value: string): number {
  return Array.from(value).length;
}

function validate(values: {
  bootstrapSecret: string;
  displayName: string;
  username: string;
  password: string;
}): FieldErrors {
  const errors: FieldErrors = {};

  if (!values.bootstrapSecret) {
    errors.bootstrapSecret = "请先填写初始化口令";
  }

  const displayName = values.displayName.trim();
  if (!displayName) {
    errors.displayName = "昵称不能为空";
  } else if (charLength(displayName) > MAX_DISPLAY_NAME_LENGTH) {
    errors.displayName = `昵称最多 ${MAX_DISPLAY_NAME_LENGTH} 个字`;
  }

  if (!USERNAME_PATTERN.test(values.username.trim())) {
    errors.username = USERNAME_ERROR;
  }

  if (values.password.length < MIN_PASSWORD_LENGTH) {
    errors.password = PASSWORD_ERROR;
  }

  return errors;
}

export default function SetupPage() {
  const [checking, setChecking] = useState(true);
  const [bootstrapSecret, setBootstrapSecret] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/setup");
        const data = (await res.json()) as {
          needsSetup?: boolean;
          isFull?: boolean;
        };
        if (cancelled) return;
        // 两个人都注册好了，或者第一个人已经注册过（第二个人得走邀请链接），
        // 这页都不该再出现
        if (data.isFull || !data.needsSetup) {
          window.location.assign("/login");
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
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError("");

    const values = { bootstrapSecret, displayName, username, password };
    const errors = validate(values);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bootstrapSecret,
          username: username.trim(),
          password,
          displayName: displayName.trim(),
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "创建失败，再试一次");
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

  if (checking) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background">
        <p className="text-muted">加载中…</p>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto max-w-md px-4 pb-[calc(2.5rem+env(safe-area-inset-bottom))] pt-12">
        <div className="mb-6 text-center">
          <BrandMark size={104} variant="full" className="mx-auto" />
          <h1 className="mt-3 text-2xl font-bold text-foreground">
            先创建你的账号
          </h1>
          <p className="mt-1 text-sm text-muted">
            注册完会给你一个邀请链接，发给 TA 让 TA 自己注册，
            <br className="hidden sm:block" />
            密码只有 TA 自己知道
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <label htmlFor="bootstrap-secret" className={labelCls}>
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
            {fieldErrors.bootstrapSecret ? (
              <p className={fieldErrorCls}>{fieldErrors.bootstrapSecret}</p>
            ) : (
              <p className="mt-1.5 text-xs text-muted">
                部署时你设置的 BOOTSTRAP_SECRET
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <h2 className="mb-3 font-semibold text-primary">你的账号</h2>
            <div className="space-y-3">
              <div>
                <label htmlFor="displayName" className={labelCls}>
                  昵称
                </label>
                <input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="TA 怎么称呼你"
                  className={inputCls}
                />
                {fieldErrors.displayName && (
                  <p className={fieldErrorCls}>{fieldErrors.displayName}</p>
                )}
              </div>
              <div>
                <label htmlFor="username" className={labelCls}>
                  用户名
                </label>
                <input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  maxLength={20}
                  placeholder="登录用的用户名"
                  className={inputCls}
                />
                {fieldErrors.username ? (
                  <p className={fieldErrorCls}>{fieldErrors.username}</p>
                ) : (
                  <p className="mt-1.5 text-xs text-muted">{USERNAME_ERROR}</p>
                )}
              </div>
              <div>
                <label htmlFor="password" className={labelCls}>
                  密码
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder={`至少 ${MIN_PASSWORD_LENGTH} 位`}
                  className={inputCls}
                />
                {fieldErrors.password && (
                  <p className={fieldErrorCls}>{fieldErrors.password}</p>
                )}
              </div>
            </div>
          </div>

          {error && <p className="text-center text-sm text-accent">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-full bg-primary py-2.5 font-semibold text-white active:opacity-80 disabled:opacity-40"
          >
            {submitting ? "创建中…" : "创建我的账号"}
          </button>
        </form>

        <div className="mt-6 rounded-2xl border border-border bg-primary-soft p-4 text-sm text-foreground">
          <p className="font-semibold text-primary">接下来</p>
          <p className="mt-1.5 text-muted">
            创建成功后，在「我的」页面生成一条邀请链接发给 TA， TA
            打开链接自己设置用户名和密码，你们就绑定成一对啦 💌
          </p>
        </div>
      </div>
    </main>
  );
}
