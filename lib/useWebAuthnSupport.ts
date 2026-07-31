"use client";

import { useSyncExternalStore } from "react";
import { browserSupportsWebAuthn } from "@simplewebauthn/browser";

// 能力探测只能在浏览器做，服务端渲染时一律当作不支持。
// 用 useSyncExternalStore 而不是 useEffect + setState，避免级联渲染。
const subscribe = () => () => {};
const getSnapshot = () => browserSupportsWebAuthn();
const getServerSnapshot = () => false;

export function useWebAuthnSupport(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
