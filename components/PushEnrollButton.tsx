"use client";

import { useEffect, useState } from "react";

// iOS Safari 在 navigator 上挂的私有字段，判断是不是从主屏图标打开的
interface SafariNavigator extends Navigator {
  standalone?: boolean;
}

type Status = "loading" | "unsupported" | "ios-need-install" | "off" | "on";

// VAPID 公钥是 base64url 文本，pushManager.subscribe 要的是字节数组
// 显式基于 ArrayBuffer 构造：applicationServerKey 要求 BufferSource，
// 而默认的 Uint8Array<ArrayBufferLike> 不满足该约束
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

// 按 UA 粗分设备名，存进 push_subscriptions.device_name 方便辨认
function guessDeviceName(): string {
  const ua = navigator.userAgent;
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Macintosh|Mac OS X/i.test(ua)) return "Mac";
  if (/Android/i.test(ua)) return "Android";
  return "其它设备";
}

// iPadOS 13+ 的 UA 会伪装成 Macintosh，靠触点数补判
function isIosDevice(): boolean {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  return /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
}

// 添加到主屏后打开算 standalone
function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as SafariNavigator).standalone === true
  );
}

// 开启/关闭本机推送通知的按钮，"我的"页面复用
export default function PushEnrollButton() {
  const [status, setStatus] = useState<Status>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // iOS 只有主屏 PWA 能收推送，Safari 标签页里连 PushManager 都没有，
      // 所以先判 iOS 再判能力，否则会误报"浏览器不支持"
      if (isIosDevice() && !isStandalone()) {
        if (!cancelled) setStatus("ios-need-install");
        return;
      }
      const supported =
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window;
      if (!supported) {
        if (!cancelled) setStatus("unsupported");
        return;
      }
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        const subscription = registration
          ? await registration.pushManager.getSubscription()
          : null;
        if (!cancelled) setStatus(subscription ? "on" : "off");
      } catch {
        // 读不到就当没开，点按钮还能重新走一遍
        if (!cancelled) setStatus("off");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 全流程都在这次点击里跑完，权限弹窗必须由用户手势触发
  async function enable() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const permission = await Notification.requestPermission();
      if (permission === "denied") {
        setError("你之前拒绝过通知，需要到 iOS 设置 → 通知 里重新允许");
        return;
      }
      if (permission !== "granted") {
        setError("没拿到通知权限，再点一次试试");
        return;
      }

      await navigator.serviceWorker.register("/sw.js");
      const registration = await navigator.serviceWorker.ready;

      const keyRes = await fetch("/api/push/subscribe");
      const keyBody = (await keyRes.json().catch(() => ({}))) as {
        publicKey?: string;
      };
      const publicKey = keyBody.publicKey ?? "";
      if (!keyRes.ok || !publicKey) {
        setError("服务端还没配好推送密钥，稍后再试");
        return;
      }

      // 已有订阅就直接复用，换密钥重新 subscribe 会报 InvalidStateError
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        }));

      const json = subscription.toJSON();
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
          deviceName: guessDeviceName(),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "保存订阅失败，再试一次");
        return;
      }
      setStatus("on");
    } catch (err) {
      if (err instanceof Error && err.name === "NotAllowedError") {
        setError("通知权限被拒绝了，到系统设置里允许后再来开启");
      } else {
        setError("开启失败，稍后再试一次");
      }
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = registration
        ? await registration.pushManager.getSubscription()
        : null;
      if (subscription) {
        const { endpoint } = subscription;
        await subscription.unsubscribe();
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint }),
        });
      }
      setStatus("off");
    } catch {
      setError("关闭失败，再试一次");
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading") {
    return <p className="py-2.5 text-sm text-muted">加载中…</p>;
  }

  if (status === "ios-need-install") {
    return (
      <p className="text-sm text-muted">
        先把网页添加到主屏幕，才能收到通知 —— Safari 底部分享按钮
        →「添加到主屏幕」，之后从主屏图标打开再来开启
      </p>
    );
  }

  if (status === "unsupported") {
    return (
      <p className="text-sm text-muted">
        这个浏览器收不了推送通知，换 Safari 或 Chrome 打开这个页面再试试
      </p>
    );
  }

  if (status === "on") {
    return (
      <div>
        <div className="flex items-center justify-between gap-3">
          <p className="font-semibold text-primary">✓ 已开启通知</p>
          <button
            type="button"
            onClick={disable}
            disabled={busy}
            className="rounded-full border border-border px-3 py-1 text-xs text-muted active:opacity-80 disabled:opacity-40"
          >
            {busy ? "关闭中…" : "关闭"}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-accent">{error}</p>}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={enable}
        disabled={busy}
        className="w-full rounded-full bg-primary py-2.5 font-semibold text-white active:opacity-80 disabled:opacity-40"
      >
        {busy ? "开启中…" : "开启通知"}
      </button>
      {error && <p className="mt-2 text-sm text-accent">{error}</p>}
    </div>
  );
}
