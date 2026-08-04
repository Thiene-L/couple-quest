import { eq, inArray } from "drizzle-orm";
import { sendPushNotification, deserializeVapidKeys } from "web-push-browser";
import { pushSubscriptions } from "@/db/schema";
import { getDb, getEnv } from "@/lib/db";
import type { Db } from "@/lib/db";

export interface PushPayload {
  title: string;
  body: string;
  // 点通知后打开的页面
  url?: string;
  tag?: string;
}

// 显式传 env 的版本：定时任务跑在 scheduled 处理器里没有请求上下文，
// getCloudflareContext() 拿不到 env，只能由调用方把它传进来
export async function sendPushTo(
  env: CloudflareEnv,
  db: Db,
  userId: string,
  payload: PushPayload,
): Promise<void> {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return;

  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));
  if (subs.length === 0) return;

  const keys = await deserializeVapidKeys({
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  });

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? "/tasks",
    tag: payload.tag,
  });

  // 推送端点失效（410/404）说明对方卸载或重装了，把订阅清掉
  const dead: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        const res = await sendPushNotification(
          keys,
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
          `mailto:noreply@${env.RP_ID}`,
          body,
          { algorithm: "aes128gcm", ttl: 12 * 3600, urgency: "normal" },
        );
        if (res && (res.status === 404 || res.status === 410)) {
          dead.push(s.endpoint);
        }
      } catch {
        // 单个设备推送失败不影响其它设备
      }
    }),
  );

  if (dead.length > 0) {
    await db
      .delete(pushSubscriptions)
      .where(inArray(pushSubscriptions.endpoint, dead));
  }
}

// 请求上下文里用这个：env 从 getCloudflareContext 拿
export async function notifyUser(
  db: Db,
  userId: string,
  payload: PushPayload,
): Promise<void> {
  const env = await getEnv();
  await sendPushTo(env, db, userId, payload);
}

// 业务路由用这个：拿到 ctx 后把推送丢到响应之后跑，不拖慢接口
export async function notifyInBackground(
  ctx: { waitUntil(p: Promise<unknown>): void } | undefined,
  userId: string,
  payload: PushPayload,
): Promise<void> {
  const task = (async () => {
    const db = await getDb();
    await notifyUser(db, userId, payload);
  })();
  if (ctx?.waitUntil) ctx.waitUntil(task);
  else await task;
}
