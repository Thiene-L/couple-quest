import { count, eq } from "drizzle-orm";
import { credentials } from "@/db/schema";
import { getDb } from "@/lib/db";
import { getSession, unauthorizedResponse } from "@/lib/session";
import { getPartner, getUserById } from "@/lib/users";

// 当前登录人信息 + 对方信息 + 本人已绑定的 passkey 数
export async function GET() {
  const session = await getSession();
  if (!session) return unauthorizedResponse();

  const db = await getDb();
  const [user, partner, credCount] = await Promise.all([
    getUserById(db, session.userId),
    getPartner(db, session.userId),
    db
      .select({ n: count() })
      .from(credentials)
      .where(eq(credentials.userId, session.userId)),
  ]);
  if (!user) return unauthorizedResponse();

  return Response.json({
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
    },
    partner: partner ? { id: partner.id, displayName: partner.displayName } : null,
    passkeyCount: credCount[0]?.n ?? 0,
  });
}
