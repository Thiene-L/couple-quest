import { getDb, getEnv } from "@/lib/db";
import { getSession, unauthorizedResponse } from "@/lib/session";
import { getPartner } from "@/lib/users";
import { createInvite, getActiveInvite, isFull } from "@/lib/invites";

function inviteUrl(origin: string, code: string): string {
  return `${origin.replace(/\/$/, "")}/join?code=${code}`;
}

// 当前的邀请码；已经有另一半就返回 null
export async function GET() {
  const session = await getSession();
  if (!session) return unauthorizedResponse();

  const db = await getDb();
  if (await isFull(db)) {
    return Response.json({ invite: null, full: true });
  }

  const env = await getEnv();
  const existing = await getActiveInvite(db, session.userId);
  return Response.json({
    invite: existing
      ? { code: existing.code, url: inviteUrl(env.RP_ORIGIN, existing.code) }
      : null,
    full: false,
  });
}

// 生成邀请码（已有未使用的就复用，不会每点一次换一个）
export async function POST() {
  const session = await getSession();
  if (!session) return unauthorizedResponse();

  const db = await getDb();
  if (await getPartner(db, session.userId)) {
    return Response.json({ error: "已经绑定另一半啦" }, { status: 409 });
  }
  if (await isFull(db)) {
    return Response.json({ error: "已经满员啦" }, { status: 409 });
  }

  const env = await getEnv();
  const invite = await createInvite(db, session.userId);
  return Response.json({
    invite: { code: invite.code, url: inviteUrl(env.RP_ORIGIN, invite.code) },
  });
}
