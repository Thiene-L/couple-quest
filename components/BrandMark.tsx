"use client";

import { useState } from "react";

// 品牌图标。public/logo.svg 由使用者自备（已在 .gitignore 里，
// 不进仓库），文件不存在时回落到蝴蝶结 emoji，不会留个破图
export default function BrandMark({
  size = 48,
  className = "",
}: {
  size?: number;
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
      src="/logo.svg"
      alt=""
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className={`object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
