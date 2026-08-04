"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import PasskeyEnrollButton from "@/components/PasskeyEnrollButton";
import PushEnrollButton from "@/components/PushEnrollButton";

interface MeData {
  partnerName: string;
  me: { displayName: string; username: string };
  passkeyCount: number;
}

interface Invite {
  code: string;
  url: string;
}

interface InvitesResponse {
  invite: Invite | null;
  full?: boolean;
}

export default function MePage() {
  const [data, setData] = useState<MeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  // 邀请另一半
  const [invite, setInvite] = useState<Invite | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [copied, setCopied] = useState(false);
  const inviteInputRef = useRef<HTMLInputElement | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let ledger: MeData | null = null;
      try {
        const res = await fetch("/api/ledger");
        if (res.ok) ledger = (await res.json()) as MeData;
      } catch {
        // 拉不到就按空数据渲染
      }
      if (cancelled) return;
      if (ledger) setData(ledger);
      setLoading(false);

      // 还没有另一半，顺手把已有的邀请码取回来
      if (!ledger || ledger.partnerName) return;
      setInviteLoading(true);
      try {
        const inviteRes = await fetch("/api/invites");
        if (inviteRes.ok) {
          const body = (await inviteRes.json()) as InvitesResponse;
          if (!cancelled) setInvite(body.invite);
        }
      } catch {
        // 拉不到就先不显示，点按钮时还能再生成
      } finally {
        if (!cancelled) setInviteLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    };
  }, []);

  async function createInvite() {
    if (creating) return;
    setInviteError("");
    setCreating(true);
    try {
      const res = await fetch("/api/invites", { method: "POST" });
      const body = (await res.json()) as InvitesResponse & { error?: string };
      if (!res.ok) {
        setInviteError(body.error ?? "生成失败，再试一次");
        return;
      }
      setInvite(body.invite);
    } catch {
      setInviteError("网络出了点问题，再试一次");
    } finally {
      setCreating(false);
    }
  }

  async function copyInviteUrl() {
    if (!invite) return;
    setInviteError("");
    try {
      await navigator.clipboard.writeText(invite.url);
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // 浏览器不给复制权限时，帮忙把链接选中，让 TA 手动复制
      inviteInputRef.current?.select();
      setInviteError("复制失败了，长按上面的链接手动复制吧");
    }
  }

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
  const partnerName = data?.partnerName ?? "";
  const hasPartner = Boolean(partnerName);

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
        {hasPartner && (
          <p className="mt-2 text-sm text-foreground">
            和 {partnerName} 绑定中 💞
          </p>
        )}
      </div>

      {/* 邀请另一半：还没绑定时才出现 */}
      {!hasPartner && (
        <div className="mt-6 rounded-2xl border border-primary bg-primary-soft p-4 shadow-sm">
          <p className="text-lg font-bold text-foreground">还差 TA 一个人 💌</p>
          <p className="mt-1 text-sm text-foreground">
            把下面的链接发给 TA，TA 自己注册、自己设密码
          </p>

          {inviteLoading ? (
            <p className="mt-4 text-sm text-muted">加载中…</p>
          ) : invite ? (
            <div className="mt-4">
              <input
                ref={inviteInputRef}
                readOnly
                value={invite.url}
                onFocus={(e) => e.currentTarget.select()}
                aria-label="邀请链接"
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-foreground outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={copyInviteUrl}
                className="mt-3 w-full rounded-full bg-primary py-2.5 font-semibold text-white active:opacity-80 disabled:opacity-40"
              >
                {copied ? "✓ 已复制" : "复制链接"}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={createInvite}
              disabled={creating}
              className="mt-4 w-full rounded-full bg-primary py-2.5 font-semibold text-white active:opacity-80 disabled:opacity-40"
            >
              {creating ? "生成中…" : "生成邀请链接"}
            </button>
          )}

          {inviteError && (
            <p className="mt-2 text-sm text-accent">{inviteError}</p>
          )}

          <p className="mt-3 text-xs text-muted">
            链接只能用一次，TA 注册完就自动失效
          </p>
        </div>
      )}

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

      {/* 推送通知 */}
      <div className="mt-6 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <p className="font-semibold text-foreground">消息通知</p>
        <p className="mt-1 text-sm text-muted">
          TA 给你派任务、完成打卡、兑换奖励时，手机会收到提醒。
        </p>
        <div className="mt-3">
          <PushEnrollButton />
        </div>
      </div>

      {/* 成就与火花：导航放不下，从这里进 */}
      <Link
        href="/achievements"
        className="mt-6 flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm active:opacity-80"
      >
        <span aria-hidden className="text-2xl leading-none">
          🏆
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-foreground">
            成就与火花
          </span>
          <span className="mt-1 block text-sm text-muted">
            连续打卡天数，和你们已经解锁的成就
          </span>
        </span>
        <span aria-hidden className="text-muted">
          ›
        </span>
      </Link>

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
