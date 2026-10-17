import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { AppError } from "./domain";
export const AUTH_COOKIE = "frame-access";
export function passwordRequired() {
  return !!process.env.APP_PASSWORD || process.env.NODE_ENV === "production";
}
export function authConfigured() {
  return (
    (process.env.APP_PASSWORD?.length || 0) >= 12 && (process.env.SESSION_SECRET?.length || 0) >= 32
  );
}
function equal(a: string, b: string) {
  const aa = Buffer.from(a),
    bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
function sign(value: string) {
  return createHmac("sha256", process.env.SESSION_SECRET || "")
    .update(value)
    .digest("base64url");
}
export function createSession(now = Date.now()) {
  if (!authConfigured())
    throw new AppError(
      "AUTH_CONFIG_REQUIRED",
      "Set APP_PASSWORD (12+ characters) and SESSION_SECRET (32+ characters) on the server.",
      503,
    );
  const payload = Buffer.from(
    JSON.stringify({ exp: now + 8 * 3600000, nonce: randomBytes(16).toString("hex") }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}
export function authorized(cookie?: string, now = Date.now()) {
  if (!passwordRequired()) return true;
  if (!authConfigured() || !cookie) return false;
  const [payload, signature, ...extra] = cookie.split(".");
  if (!payload || !signature || extra.length || !equal(signature, sign(payload))) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    return typeof data.exp === "number" && data.exp > now;
  } catch {
    return false;
  }
}
export function passwordMatches(value: string) {
  return (
    !!process.env.APP_PASSWORD &&
    equal(
      createHash("sha256").update(value).digest("hex"),
      createHash("sha256").update(process.env.APP_PASSWORD).digest("hex"),
    )
  );
}
export function assertSameOrigin(origin: string | null, host: string | null) {
  if (!origin) return;
  try {
    if (new URL(origin).host === host) return;
  } catch {}
  throw new AppError("ORIGIN_MISMATCH", "Cross-origin requests are not allowed.", 403);
}
