import crypto from "node:crypto";

const SESSION_COOKIE = "vendor_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return secret;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

/** Stateless signed session token: `${vendorId}.${expiryMs}.${signature}` */
export function createSessionToken(vendorId: number): string {
  const expiry = Date.now() + SESSION_TTL_MS;
  const payload = `${vendorId}.${expiry}`;
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined | null): number | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [vendorIdStr, expiryStr, signature] = parts;
  const payload = `${vendorIdStr}.${expiryStr}`;

  const expected = sign(payload);
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(signature!);
  if (expectedBuf.length !== providedBuf.length || !crypto.timingSafeEqual(expectedBuf, providedBuf)) {
    return null;
  }

  const expiry = Number(expiryStr);
  if (!Number.isFinite(expiry) || Date.now() > expiry) return null;

  const vendorId = Number(vendorIdStr);
  return Number.isFinite(vendorId) ? vendorId : null;
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
