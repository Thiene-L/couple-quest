import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { getRpConfig, saveAuthenticationChallenge } from "@/lib/webauthn";

// 生成 passkey 登录 options（无需登录）；challenge 作为 KV key 落库
export async function POST() {
  const { rpID } = await getRpConfig();
  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: [],
    userVerification: "preferred",
  });
  await saveAuthenticationChallenge(options.challenge);
  return Response.json(options);
}
