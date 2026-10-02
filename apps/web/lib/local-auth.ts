import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { serverConfig } from "./config";

/**
 * Self-hosted authentication primitives.
 *
 * Passwords are stored as a scrypt hash (no native dependency), and sessions are
 * opaque 32-byte tokens whose SHA-256 hash is what the database holds, so a
 * database leak does not hand out usable sessions and logout is a real delete.
 */

export const SESSION_COOKIE = "oa_session";
const SESSION_TTL_DAYS = 30;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_BYTES);
  const derived = scryptSync(password.normalize("NFKC"), salt, KEY_LENGTH);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1] ?? "", "hex");
  const expected = Buffer.from(parts[2] ?? "", "hex");
  if (salt.length === 0 || expected.length === 0) return false;
  const derived = scryptSync(password.normalize("NFKC"), salt, expected.length);
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function sessionExpiry(now = new Date()): Date {
  return new Date(now.getTime() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
}

function cookieOptions(expires: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    // Plain HTTP is the default deployment here; enabling this breaks login
    // until the site is served over HTTPS.
    secure: serverConfig().COOKIE_SECURE === "true",
    path: "/",
    expires
  };
}

export async function writeSessionCookie(token: string, expires: Date): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, cookieOptions(expires));
}

export async function readSessionCookie(): Promise<string | null> {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, "", { ...cookieOptions(new Date(0)), maxAge: 0 });
}

/** Cheap password policy so a self-hosted instance is not left wide open. */
export function assertPasswordAcceptable(password: string): void {
  if (typeof password !== "string" || password.length < 8) {
    throw new Error("PASSWORD_TOO_SHORT");
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
