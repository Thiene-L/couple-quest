import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// next dev 时把 wrangler.jsonc 里的 D1/KV/R2 绑定注入本地模拟器
initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {};

export default nextConfig;
