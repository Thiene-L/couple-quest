/// <reference types="@cloudflare/workers-types" />

// wrangler.jsonc 中声明的绑定；@opennextjs/cloudflare 的
// getCloudflareContext() 返回的 env 即此类型
interface CloudflareEnv {
  DB: D1Database;
  PHOTOS: R2Bucket;
  ASSETS: Fetcher;
  SESSION_SECRET: string;
  // 首次初始化口令，只在创建两个账号时校验一次
  BOOTSTRAP_SECRET: string;
  RP_ID: string;
  RP_ORIGIN: string;
  RP_NAME: string;
}
