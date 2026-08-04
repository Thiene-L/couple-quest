import { getCloudflareContext } from "@opennextjs/cloudflare";
import { nanoid } from "nanoid";
import { chatRelay } from "@/db/schema";
import { MAX_BODY_LENGTH, sweepExpired } from "@/lib/chat";
import { getDb } from "@/lib/db";
import { notifyInBackground } from "@/lib/push";
import { getSession, unauthorizedResponse } from "@/lib/session";
import { getPartner } from "@/lib/users";

interface Body {
  body?: unknown;
  // 客户端生成的临时 id，原样回传，方便前端把乐观气泡对上号
  clientId?: unknown;
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return unauthorizedResponse();

  let payload: Body;
  try {
    payload = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "请求格式不对" }, { status: 400 });
  }

  const text = typeof payload?.body === "string" ? payload.body.trim() : "";
  if (!text) return Response.json({ error: "说点什么吧" }, { status: 400 });
  if (text.length > MAX_BODY_LENGTH) {
    return Response.json(
      { error: `一条最多 ${MAX_BODY_LENGTH} 个字` },
      { status: 400 },
    );
  }

  const db = await getDb();
  const partner = await getPartner(db, session.userId);
  if (!partner) {
    return Response.json({ error: "还没有绑定另一半呢" }, { status: 409 });
  }

  const row = {
    id: nanoid(),
    fromUserId: session.userId,
    toUserId: partner.id,
    body: text,
    createdAt: new Date(),
    deliveredAt: null,
  };
  await db.insert(chatRelay).values(row);
  await sweepExpired(db);

  const { ctx } = await getCloudflareContext({ async: true });
  await notifyInBackground(ctx, partner.id, {
    title: session.displayName,
    body: text.length > 60 ? `${text.slice(0, 60)}…` : text,
    url: "/chat",
    tag: "chat",
  });

  return Response.json({
    message: {
      id: row.id,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      mine: true,
    },
    clientId: typeof payload?.clientId === "string" ? payload.clientId : null,
  });
}
