import { Buffer } from "node:buffer";
import {
  verifyRegistrationResponse,
  type RegistrationResponseJSON,
  type VerifiedRegistrationResponse,
} from "@simplewebauthn/server";
import { credentials } from "@/db/schema";
import { getDb } from "@/lib/db";
import { getSession, unauthorizedResponse } from "@/lib/session";
import {
  consumeRegistrationChallenge,
  getRpConfig,
  toBase64url,
} from "@/lib/webauthn";

// 校验 passkey 注册回执，通过则把凭证写入 credentials 表
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return unauthorizedResponse();

  let body: { response?: RegistrationResponseJSON; deviceName?: unknown };
  try {
    body = (await req.json()) as {
      response?: RegistrationResponseJSON;
      deviceName?: unknown;
    };
  } catch {
    return Response.json({ error: "请求格式不对" }, { status: 400 });
  }
  const response = body?.response;
  if (!response?.response?.clientDataJSON) {
    return Response.json({ error: "缺少凭证数据" }, { status: 400 });
  }

  // clientDataJSON 里带着本次 ceremony 的 challenge，用它定位并消费掉那条一次性记录
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

  // 消费失败 = challenge 不存在/已过期/不属于当前用户
  const consumed = await consumeRegistrationChallenge(
    session.userId,
    challenge,
  );
  if (!consumed) {
    return Response.json(
      { error: "注册请求已过期，请重试" },
      { status: 400 },
    );
  }

  const { rpID, rpOrigin } = await getRpConfig();
  let verification: VerifiedRegistrationResponse;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: rpOrigin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });
  } catch {
    return Response.json({ error: "凭证校验失败" }, { status: 400 });
  }
  if (!verification.verified || !verification.registrationInfo) {
    return Response.json({ error: "凭证校验未通过" }, { status: 400 });
  }

  const { credential } = verification.registrationInfo;
  const deviceName =
    typeof body.deviceName === "string" && body.deviceName.trim()
      ? body.deviceName.trim()
      : null;

  const db = await getDb();
  await db
    .insert(credentials)
    .values({
      id: credential.id,
      userId: session.userId,
      publicKey: toBase64url(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports
        ? JSON.stringify(credential.transports)
        : null,
      deviceName,
      createdAt: new Date(),
    })
    .onConflictDoNothing();

  return Response.json({ verified: true });
}
