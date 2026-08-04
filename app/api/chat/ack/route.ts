import { and, eq, inArray } from "drizzle-orm";
import { chatRelay } from "@/db/schema";
import { PULL_LIMIT } from "@/lib/chat";
import { getDb } from "@/lib/db";
import { getSession, unauthorizedResponse } from "@/lib/session";

interface Body {
  ids?: unknown;
}

// 客户端确认「已经存到本地了」，服务器这才真正删除。
// 中转站到此为止，聊天记录只剩两台设备上各自的副本。
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return unauthorizedResponse();

  let payload: Body;
  try {
    payload = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "请求格式不对" }, { status: 400 });
  }

  const ids = Array.isArray(payload?.ids)
    ? payload.ids.filter((x): x is string => typeof x === "string")
    : [];
  if (ids.length === 0) return Response.json({ ok: true, removed: 0 });
  if (ids.length > PULL_LIMIT) {
    return Response.json({ error: "一次确认的条数太多了" }, { status: 400 });
  }

  const db = await getDb();
  // 限定 toUserId 是我：别人拿到 id 也删不掉不属于他的消息
  const removed = await db
    .delete(chatRelay)
    .where(
      and(inArray(chatRelay.id, ids), eq(chatRelay.toUserId, session.userId)),
    )
    .returning({ id: chatRelay.id });

  return Response.json({ ok: true, removed: removed.length });
}
