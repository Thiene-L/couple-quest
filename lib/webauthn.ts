import { Buffer } from "node:buffer";
import { and, eq, lt } from "drizzle-orm";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/server";
import { challenges } from "@/db/schema";
import { getDb, getEnv } from "@/lib/db";

const CHALLENGE_TTL_MS = 120_000;

export interface RpConfig {
  rpID: string;
  rpOrigin: string;
  rpName: string;
}

// WebAuthn Relying Party 配置，来自 Cloudflare 环境变量
export async function getRpConfig(): Promise<RpConfig> {
  const env = await getEnv();
  return { rpID: env.RP_ID, rpOrigin: env.RP_ORIGIN, rpName: env.RP_NAME };
}

async function saveChallenge(
  challenge: string,
  kind: "registration" | "authentication",
  userId: string | null,
): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  await db.batch([
    // 顺手清理过期条目，表始终只有个位数行
    db.delete(challenges).where(lt(challenges.expiresAt, new Date(now))),
    db
      .insert(challenges)
      .values({
        challenge,
        kind,
        userId,
        expiresAt: new Date(now + CHALLENGE_TTL_MS),
      })
      .onConflictDoNothing(),
  ]);
}

// 条件删除即消费：只有真正删掉一行的调用方拿到 challenge，
// 并发重放拿不到行，从根上杜绝同一 challenge 被用第二次
async function consumeChallenge(
  challenge: string,
  kind: "registration" | "authentication",
): Promise<{ userId: string | null } | null> {
  const db = await getDb();
  const rows = await db
    .delete(challenges)
    .where(and(eq(challenges.challenge, challenge), eq(challenges.kind, kind)))
    .returning({ userId: challenges.userId, expiresAt: challenges.expiresAt });
  const row = rows[0];
  if (!row) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;
  return { userId: row.userId };
}

export async function saveRegistrationChallenge(
  userId: string,
  challenge: string,
): Promise<void> {
  await saveChallenge(challenge, "registration", userId);
}

// 校验注册 challenge 属于该用户并消费掉
export async function consumeRegistrationChallenge(
  userId: string,
  challenge: string,
): Promise<boolean> {
  const row = await consumeChallenge(challenge, "registration");
  return row !== null && row.userId === userId;
}

export async function saveAuthenticationChallenge(
  challenge: string,
): Promise<void> {
  await saveChallenge(challenge, "authentication", null);
}

export async function consumeAuthenticationChallenge(
  challenge: string,
): Promise<boolean> {
  return (await consumeChallenge(challenge, "authentication")) !== null;
}

// 公钥字节 -> base64url（Workers nodejs_compat 下 Buffer 可用）
export function toBase64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

// base64url -> 字节
export function fromBase64url(s: string) {
  return new Uint8Array(Buffer.from(s, "base64url"));
}

// credentials.transports 列存的是 JSON 数组字符串
export function parseTransports(
  json: string | null,
): AuthenticatorTransportFuture[] | undefined {
  if (!json) return undefined;
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed)
      ? (parsed as AuthenticatorTransportFuture[])
      : undefined;
  } catch {
    return undefined;
  }
}
