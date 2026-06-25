// Server-only module — relies on Node's crypto and next/headers cookies().
import crypto from "crypto";
import { cookies } from "next/headers";

// Server-side auth: an HMAC-signed session cookie unlocks the private views.
// Credentials and the signing secret come from env, with safe-enough defaults for local use.
// NEVER hardcode real credentials here — this repo is public. The actual username,
// password, and signing secret are provided via env (the host .env, which is gitignored).
const AUTH_USER = process.env.DASH_AUTH_USER || "admin";
const AUTH_PASS = process.env.DASH_AUTH_PASS || ""; // empty => login disabled until set
const SECRET = process.env.DASH_AUTH_SECRET || "insecure-dev-fallback-set-DASH_AUTH_SECRET";

export const SESSION_COOKIE = "dash_session";
const DAY = 24 * 60 * 60;
export const SESSION_SHORT = 1 * DAY;   // default session length
export const SESSION_LONG = 30 * DAY;   // "remember me"

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

function hmacHex(payload: string): string {
  return crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
}

// Whether the supplied credentials are valid. Login is disabled unless DASH_AUTH_PASS is set.
export function checkCredentials(username: string, password: string): boolean {
  if (!AUTH_PASS) return false;
  return username === AUTH_USER && password === AUTH_PASS;
}

// Build a signed token: base64url(JSON.stringify({u, exp})) + "." + hex hmac of that payload.
export function signSession(user: string, ageSeconds: number = SESSION_SHORT): string {
  const exp = Math.floor(Date.now() / 1000) + ageSeconds;
  const payload = base64url(JSON.stringify({ u: user, exp }));
  const sig = hmacHex(payload);
  return `${payload}.${sig}`;
}

// Verify a token's signature and expiry; returns the decoded {u} or null.
export function verifySession(token: string | undefined | null): { u: string } | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = hmacHex(payload);
  // Constant-time compare to avoid timing leaks.
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof decoded?.u !== "string" || typeof decoded?.exp !== "number") return null;
    if (decoded.exp < Math.floor(Date.now() / 1000)) return null;
    return { u: decoded.u };
  } catch {
    return null;
  }
}

// Cookie attributes used when setting the session cookie (maxAge varies with "remember me").
export function sessionCookieOptions(ageSeconds: number = SESSION_SHORT) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: ageSeconds,
    secure: false, // served over http for now
  };
}

// Read the session cookie (in a route/server context) and report auth state.
export async function readAuth(): Promise<{ authed: boolean; user: string | null }> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  const session = verifySession(token);
  return session ? { authed: true, user: session.u } : { authed: false, user: null };
}
