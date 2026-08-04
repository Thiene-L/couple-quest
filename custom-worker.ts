// Cron Triggers 需要 scheduled 处理器，而 OpenNext 生成的 worker 只有 fetch。
// 这里复用它的 fetch，另外挂上定时任务。wrangler.jsonc 的 main 指向本文件。
import { default as handler } from "./.open-next/worker.js";
import { runReminders } from "./lib/reminders";

export default {
  fetch: handler.fetch,

  async scheduled(
    _event: ScheduledController,
    env: CloudflareEnv,
    ctx: ExecutionContext,
  ) {
    ctx.waitUntil(runReminders(env));
  },
} satisfies ExportedHandler<CloudflareEnv>;

export { DOQueueHandler, DOShardedTagCache } from "./.open-next/worker.js";
