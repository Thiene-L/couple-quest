"use client";

import { useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import { useWebAuthnSupport } from "@/lib/useWebAuthnSupport";

// 按 UA 粗分设备名，存进 credentials.device_name 方便辨认
function guessDeviceName(): string {
  const ua = navigator.userAgent;
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Macintosh|Mac OS X/i.test(ua)) return "Mac";
  if (/Android/i.test(ua)) return "Android";
  return "其它设备";
}

// 给本机注册 passkey 的按钮，"我的"页面复用
export default function PasskeyEnrollButton() {
  const supported = useWebAuthnSupport();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleClick() {
    if (loading) return;
    setLoading(true);
    try {
      const optRes = await fetch("/api/auth/passkey/register/options", {
        method: "POST",
      });
      const optData = await optRes.json();
      if (!optRes.ok) {
        alert(
          (optData as { error?: string }).error ?? "获取注册信息失败，再试一次",
        );
        return;
      }
      const response = await startRegistration({
        optionsJSON: optData as Parameters<
          typeof startRegistration
        >[0]["optionsJSON"],
      });
      const verifyRes = await fetch("/api/auth/passkey/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response, deviceName: guessDeviceName() }),
      });
      const data = (await verifyRes.json()) as { error?: string };
      if (!verifyRes.ok) {
        alert(data.error ?? "开启失败，再试一次");
        return;
      }
      setDone(true);
    } catch (err) {
      if (err instanceof Error && err.name === "NotAllowedError") {
        // 用户主动取消，不打扰
      } else if (err instanceof Error && err.name === "InvalidStateError") {
        alert("本机已经注册过面容/指纹登录了");
      } else {
        alert("开启失败，换个浏览器或稍后再试");
      }
    } finally {
      setLoading(false);
    }
  }

  if (!supported) return null;

  if (done) {
    return (
      <p className="py-2.5 text-center font-semibold text-primary">
        ✓ 本机已开启
      </p>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="w-full rounded-full bg-primary py-2.5 font-semibold text-white active:opacity-80 disabled:opacity-40"
    >
      {loading ? "开启中…" : "开启面容/指纹登录"}
    </button>
  );
}
