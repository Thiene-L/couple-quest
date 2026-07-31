import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "@/db/schema";

export type Db = ReturnType<typeof drizzle<typeof schema>>;

// 拿到当前请求的 Cloudflare 绑定（dev 下是本地模拟器）
export async function getEnv(): Promise<CloudflareEnv> {
  const { env } = await getCloudflareContext({ async: true });
  return env as CloudflareEnv;
}

export async function getDb(): Promise<Db> {
  const env = await getEnv();
  return drizzle(env.DB, { schema });
}

// Asia/Shanghai 的 YYYY-MM-DD，daily 任务按这个键去重
export function todayKey(now: Date = new Date()): string {
  return new Date(now.getTime() + 8 * 3600_000).toISOString().slice(0, 10);
}
