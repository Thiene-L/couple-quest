import { clearSession } from "@/lib/session";

// 退出登录；幂等，未登录时调用也直接成功
export async function POST() {
  await clearSession();
  return Response.json({ ok: true });
}
