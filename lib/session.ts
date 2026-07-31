import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { getEnv } from "@/lib/db";

const COOKIE_NAME = "cq_session";
const MAX_AGE_SECONDS = 30 * 24 * 3600; // 30 天

export interface Session {
  userId: string;
  username: string;
  displayName: string;
}

async function secretKey(): Promise<Uint8Array> {
  const env = await getEnv();
  const secret = env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not configured");
  return new TextEncoder().encode(secret);
}

export async function createSession(session: Session): Promise<void> {
  const token = await new SignJWT({
    username: session.username,
    displayName: session.displayName,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.userId)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(await secretKey());

  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, await secretKey());
    if (!payload.sub) return null;
    return {
      userId: payload.sub,
      username: String(payload.username ?? ""),
      displayName: String(payload.displayName ?? ""),
    };
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  (await cookies()).delete(COOKIE_NAME);
}

// API route 用：未登录返回 null，调用方自行返回 401
export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) throw new UnauthorizedError();
  return s;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("unauthorized");
  }
}

export function unauthorizedResponse(): Response {
  return Response.json({ error: "未登录" }, { status: 401 });
}
