import { eq } from "drizzle-orm";
import { pushSubscriptions } from "@/db/schema";
import { getDb, getEnv } from "@/lib/db";
import { getSession, unauthorizedResponse } from "@/lib/session";

interface Body {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
  deviceName?: unknown;
}

// 前端要拿公钥去调 pushManager.subscribe
export async function GET() {
  const env = await getEnv();
  return Response.json({ publicKey: env.VAPID_PUBLIC_KEY ?? "" });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return unauthorizedResponse();

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "请求格式不对" }, { status: 400 });
  }

  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
  const p256dh = typeof body?.keys?.p256dh === "string" ? body.keys.p256dh : "";
  const auth = typeof body?.keys?.auth === "string" ? body.keys.auth : "";
  if (!endpoint || !p256dh || !auth) {
    return Response.json({ error: "订阅信息不完整" }, { status: 400 });
  }

  const db = await getDb();
  // endpoint 是主键：同一台设备重复订阅就覆盖，换人登录也会改归属
  await db
    .insert(pushSubscriptions)
    .values({
      endpoint,
      userId: session.userId,
      p256dh,
      auth,
      deviceName:
        typeof body?.deviceName === "string" ? body.deviceName : null,
      createdAt: new Date(),
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId: session.userId, p256dh, auth },
    });

  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session) return unauthorizedResponse();

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "请求格式不对" }, { status: 400 });
  }
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
  if (!endpoint) return Response.json({ error: "缺少 endpoint" }, { status: 400 });

  const db = await getDb();
  await db
    .delete(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, endpoint));
  return Response.json({ ok: true });
}
