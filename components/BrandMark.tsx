"use client";

import { useState } from "react";

// 品牌图标。素材由使用者自备（在 .gitignore 里，不进仓库），
// 文件不存在时回落到蝴蝶结 emoji，不会留个破图。
//   head — 头像版，适合小尺寸：页头、导航、头像圈
//   full — 全身版，适合大留白处：空态、登录页
const SRC = {
  head: "/logo.svg",
  full: "/logo-full.svg",
} as const;

export default function BrandMark({
  size = 48,
  variant = "head",
  className = "",
}: {
  size?: number;
  variant?: keyof typeof SRC;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span
        className={className}
        style={{ fontSize: size * 0.9, lineHeight: 1 }}
        aria-hidden
      >
        🎀
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={SRC[variant]}
      alt=""
      onError={() => setFailed(true)}
      className={`object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
