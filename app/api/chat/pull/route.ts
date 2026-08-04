import { asc, eq } from "drizzle-orm";
import { chatRelay, users } from "@/db/schema";
import { PULL_LIMIT, sweepExpired } from "@/lib/chat";
import { getDb } from "@/lib/db";
import { getSession, unauthorizedResponse } from "@/lib/session";

// 拉取发给我的消息。**这里只标记已投递，不删除** ——
// 响应可能在路上丢，删早了消息就永远没了。真正的删除由 /api/chat/ack 触发，
// 客户端把消息落到本地 IndexedDB 之后才回执。没等到回执的下次会重复拉到，
// 客户端按 id 去重，所以重复投递是安全的。
export async function GET() {
  const session = await getSession();
  if (!session) return unauthorizedResponse();

  const db = await getDb();
  await sweepExpired(db);

  const rows = await db
    .select({
      id: chatRelay.id,
      body: chatRelay.body,
      createdAt: chatRelay.createdAt,
      fromUserId: chatRelay.fromUserId,
      fromName: users.displayName,
    })
    .from(chatRelay)
    .innerJoin(users, eq(chatRelay.fromUserId, users.id))
    .where(eq(chatRelay.toUserId, session.userId))
    .orderBy(asc(chatRelay.createdAt))
    .limit(PULL_LIMIT);

  if (rows.length > 0) {
    await db
      .update(chatRelay)
      .set({ deliveredAt: new Date() })
      .where(eq(chatRelay.toUserId, session.userId));
  }

  return Response.json({
    messages: rows.map((r) => ({
      id: r.id,
      body: r.body,
      createdAt: r.createdAt.toISOString(),
      fromName: r.fromName,
      mine: false,
    })),
  });
}
