import { desc, eq, sql } from "drizzle-orm";
import { credentials, pointLedger } from "@/db/schema";
import { getDb } from "@/lib/db";
import { getBalance } from "@/lib/points";
import { getSession, unauthorizedResponse } from "@/lib/session";
import { getPartner } from "@/lib/users";

// GET /api/ledger：两人余额 + 我的账本明细（最多 100 条）
// 顺带返回 me（displayName/username）和 passkeyCount，供「我的」页一把拉齐
export async function GET() {
  const session = await getSession();
  if (!session) return unauthorizedResponse();

  const db = await getDb();
  const partner = await getPartner(db, session.userId);

  const [meBalance, partnerBalance, entries, passkeyRows] = await Promise.all([
    getBalance(db, session.userId),
    partner ? getBalance(db, partner.id) : Promise.resolve(0),
    db
      .select({
        id: pointLedger.id,
        delta: pointLedger.delta,
        reason: pointLedger.reason,
        refType: pointLedger.refType,
        createdAt: pointLedger.createdAt,
      })
      .from(pointLedger)
      .where(eq(pointLedger.userId, session.userId))
      .orderBy(desc(pointLedger.createdAt))
      .limit(100),
    db
      .select({ n: sql<number>`count(*)` })
      .from(credentials)
      .where(eq(credentials.userId, session.userId)),
  ]);

  return Response.json({
    balances: { me: meBalance, partner: partnerBalance },
    partnerName: partner?.displayName ?? "",
    me: { displayName: session.displayName, username: session.username },
    passkeyCount: passkeyRows[0]?.n ?? 0,
    entries,
  });
}
