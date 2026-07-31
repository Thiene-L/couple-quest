import { Buffer } from "node:buffer";
import {
  verifyAuthenticationResponse,
  type AuthenticationResponseJSON,
  type VerifiedAuthenticationResponse,
} from "@simplewebauthn/server";
import { eq } from "drizzle-orm";
import { credentials } from "@/db/schema";
import { getDb } from "@/lib/db";
import { createSession } from "@/lib/session";
import { getUserById } from "@/lib/users";
import {
  consumeAuthenticationChallenge,
  fromBase64url,
  getRpConfig,
  parseTransports,
} from "@/lib/webauthn";

// 校验 passkey 登录回执（无需登录）：challenge 单次使用，通过后更新 counter 并建会话
export async function POST(req: Request) {
  let body: { response?: AuthenticationResponseJSON };
  try {
    body = (await req.json()) as { response?: AuthenticationResponseJSON };
  } catch {
    return Response.json({ error: "请求格式不对" }, { status: 400 });
  }
  const response = body?.response;
  if (!response?.id || !response?.response?.clientDataJSON) {
    return Response.json({ error: "缺少凭证数据" }, { status: 400 });
  }

  // clientDataJSON 里带着本次 ceremony 的 challenge，用它找回 KV 里的一次性记录
  let challenge: string;
  try {
    const clientData = JSON.parse(
      Buffer.from(response.response.clientDataJSON, "base64url").toString(
        "utf8",
      ),
    ) as { challenge?: unknown };
    if (typeof clientData.challenge !== "string" || !clientData.challenge) {
      throw new Error("no challenge");
    }
    challenge = clientData.challenge;
  } catch {
    return Response.json({ error: "凭证数据解析失败" }, { status: 400 });
  }

  const known = await consumeAuthenticationChallenge(challenge);
  if (!known) {
    return Response.json(
      { error: "登录流程已过期，请重试" },
      { status: 400 },
    );
  }

  const db = await getDb();
  const rows = await db
    .select()
    .from(credentials)
    .where(eq(credentials.id, response.id))
    .limit(1);
  const cred = rows[0];
  if (!cred) {
    return Response.json(
      { error: "没找到这个通行密钥，先用密码登录后开启一下吧" },
      { status: 401 },
    );
  }
  const user = await getUserById(db, cred.userId);
  if (!user) {
    return Response.json({ error: "账号不存在" }, { status: 401 });
  }

  const { rpID, rpOrigin } = await getRpConfig();
  let verification: VerifiedAuthenticationResponse;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: rpOrigin,
      expectedRPID: rpID,
      credential: {
        id: cred.id,
        publicKey: fromBase64url(cred.publicKey),
        counter: cred.counter,
        transports: parseTransports(cred.transports),
      },
      requireUserVerification: false,
    });
  } catch {
    return Response.json({ error: "凭证校验失败" }, { status: 401 });
  }
  if (!verification.verified) {
    return Response.json({ error: "凭证校验未通过" }, { status: 401 });
  }

  await db
    .update(credentials)
    .set({ counter: verification.authenticationInfo.newCounter })
    .where(eq(credentials.id, cred.id));

  await createSession({
    userId: user.id,
    username: user.username,
    displayName: user.displayName,
  });
  return Response.json({ verified: true });
}
