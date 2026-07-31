"use client";

import { useEffect, useState } from "react";
import PasskeyEnrollButton from "@/components/PasskeyEnrollButton";

interface MeData {
  partnerName: string;
  me: { displayName: string; username: string };
  passkeyCount: number;
}

export default function MePage() {
  const [data, setData] = useState<MeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/ledger");
        if (res.ok) setData((await res.json()) as MeData);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function logout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // 即使接口失败也回登录页
    }
    location.href = "/login";
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-md md:max-w-2xl px-4 md:px-6 py-6">
        <h1 className="text-2xl font-bold text-foreground">我的</h1>
        <div className="mt-6 flex flex-col items-center">
          <div className="h-20 w-20 animate-pulse rounded-full bg-primary-soft" />
          <p className="mt-4 text-sm text-muted">加载中…</p>
        </div>
      </div>
    );
  }

  const displayName = data?.me.displayName ?? "";

  return (
    <div className="mx-auto w-full max-w-md md:max-w-2xl px-4 md:px-6 py-6">
      <h1 className="text-2xl font-bold text-foreground">我的</h1>

      {/* 个人信息 */}
      <div className="mt-6 flex flex-col items-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary-soft text-3xl font-bold text-primary">
          {displayName.slice(0, 1) || "?"}
        </div>
        <p className="mt-3 text-lg font-bold text-foreground">{displayName}</p>
        <p className="text-sm text-muted">@{data?.me.username ?? ""}</p>
        {data?.partnerName && (
          <p className="mt-2 text-sm text-foreground">
            和 {data.partnerName} 绑定中 💞
          </p>
        )}
      </div>

      {/* Passkey */}
      <div className="mt-6 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <p className="font-semibold text-foreground">面容 / 指纹快捷登录</p>
        <p className="mt-1 text-sm text-muted">
          绑定这台设备后，下次打开无需输密码，用面容或指纹一步登录。
        </p>
        <div className="mt-3">
          <PasskeyEnrollButton />
        </div>
        <p className="mt-2 text-xs text-muted">
          已绑定 {data?.passkeyCount ?? 0} 台设备
        </p>
      </div>

      {/* 退出登录 */}
      <button
        onClick={logout}
        disabled={loggingOut}
        className="mt-6 w-full rounded-full border border-rose-300 py-2.5 font-semibold text-rose-500 active:opacity-80 disabled:opacity-40"
      >
        {loggingOut ? "退出中…" : "退出登录"}
      </button>

      <p className="mt-8 text-center text-xs text-muted">
        Couple Quest v1.0 · 为我们俩定制
      </p>
    </div>
  );
}
