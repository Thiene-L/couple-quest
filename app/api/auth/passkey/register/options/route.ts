import { generateRegistrationOptions } from "@simplewebauthn/server";
import { eq } from "drizzle-orm";
import { credentials } from "@/db/schema";
import { getDb } from "@/lib/db";
import { getSession, unauthorizedResponse } from "@/lib/session";
import {
  getRpConfig,
  parseTransports,
  saveRegistrationChallenge,
} from "@/lib/webauthn";

// 生成 passkey 注册 options，challenge 落 KV（5 分钟内单次有效）
export async function POST() {
  const session = await getSession();
  if (!session) return unauthorizedResponse();

  const db = await getDb();
  const { rpID, rpName } = await getRpConfig();
  const existing = await db
    .select()
    .from(credentials)
    .where(eq(credentials.userId, session.userId));

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: session.username,
    userID: new TextEncoder().encode(session.userId),
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({
      id: c.id,
      transports: parseTransports(c.transports),
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });

  await saveRegistrationChallenge(session.userId, options.challenge);
  return Response.json(options);
}
