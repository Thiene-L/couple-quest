// 密码哈希：WebCrypto PBKDF2-SHA256。
// Workers 免费版 CPU 限额 10ms，跑不动 argon2；PBKDF2 是该运行时唯一现实选择。
const ITERATIONS = 100_000;
const KEY_BYTES = 32;
const SALT_BYTES = 16;

function toB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function derive(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    key,
    KEY_BYTES * 8,
  );
}

export async function hashPassword(password: string): Promise<{
  hash: string;
  salt: string;
  iterations: number;
}> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const bits = await derive(password, salt, ITERATIONS);
  return { hash: toB64(bits), salt: toB64(salt), iterations: ITERATIONS };
}

export async function verifyPassword(
  password: string,
  saltB64: string,
  hashB64: string,
  iterations: number,
): Promise<boolean> {
  const bits = await derive(password, fromB64(saltB64), iterations);
  const a = new Uint8Array(bits);
  const b = fromB64(hashB64);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
