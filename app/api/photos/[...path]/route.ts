import { getEnv } from "@/lib/db";
import { getSession, unauthorizedResponse } from "@/lib/session";

// 后缀 -> content-type 白名单。R2 对象里存的 contentType 来自上传方，
// 不作为响应头依据，只按 key 后缀推导，未知后缀一律当二进制流下发
const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heic",
};

function contentTypeFor(key: string): string {
  const dot = key.lastIndexOf(".");
  if (dot === -1 || dot < key.lastIndexOf("/")) return "application/octet-stream";
  const ext = key.slice(dot + 1).toLowerCase();
  return CONTENT_TYPE_BY_EXT[ext] ?? "application/octet-stream";
}

// GET /api/photos/[...path]：登录后读 R2 图片，只放行 proofs/ 与 rewards/ 前缀
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const session = await getSession();
  if (!session) return unauthorizedResponse();

  const { path } = await ctx.params;
  const key = path.join("/");
  if (key.includes("..")) {
    return Response.json({ error: "无权访问该文件" }, { status: 403 });
  }
  if (!key.startsWith("proofs/") && !key.startsWith("rewards/")) {
    return Response.json({ error: "无权访问该文件" }, { status: 403 });
  }

  const env = await getEnv();
  const obj = await env.PHOTOS.get(key);
  if (!obj) {
    return Response.json({ error: "文件不存在" }, { status: 404 });
  }

  return new Response(obj.body as unknown as BodyInit, {
    headers: {
      "content-type": contentTypeFor(key),
      "cache-control": "private, max-age=31536000, immutable",
      // 即使内容被伪装成图片，也不允许浏览器嗅探类型、执行脚本或当页面打开
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "content-disposition": "inline",
    },
  });
}
