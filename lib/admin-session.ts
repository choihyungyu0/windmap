/**
 * 관리자 세션 토큰 — `${만료시각ms}.${HMAC-SHA256(secret, 만료시각)}` 형식.
 * Web Crypto만 사용하므로 Edge 미들웨어와 Node 라우트 양쪽에서 동작한다.
 */

export const ADMIN_COOKIE = "admin_session";
export const SESSION_MAX_AGE_S = 60 * 60 * 24 * 7; // 7일

const enc = new TextEncoder();

async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function createSessionToken(secret: string): Promise<string> {
  const exp = Date.now() + SESSION_MAX_AGE_S * 1000;
  return `${exp}.${await hmacHex(secret, String(exp))}`;
}

export async function verifySessionToken(
  token: string | undefined,
  secret: string | undefined
): Promise<boolean> {
  if (!token || !secret) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const expStr = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  return (await hmacHex(secret, expStr)) === sig;
}
