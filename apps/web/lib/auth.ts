import { and, eq, gt } from "drizzle-orm";
import { appUsers, userSessions } from "@oa/domain/db";
import { db } from "./db";
import { AppError } from "./errors";
import { serverConfig } from "./config";
import { hashSessionToken, readSessionCookie } from "./local-auth";

export interface AppUser { id: string; identityUserId: string; email: string; role: "USER" | "ADMIN"; }

/**
 * Authentication for a self-hosted deployment.
 *
 * Sessions are stored server-side (see `user_sessions`), so signing out revokes
 * the session immediately and an expired or unknown cookie is simply rejected.
 * `AUTH_MODE=mock` stays available for local development and tests only.
 */
export async function requireUser(): Promise<AppUser> {
  const config = serverConfig();
  if (config.AUTH_MODE === "mock") {
    const rows = await db.insert(appUsers).values({
      id: config.MOCK_USER_ID,
      identityUserId: `mock:${config.MOCK_USER_ID}`,
      email: config.MOCK_USER_EMAIL,
      role: process.env.MOCK_USER_ROLE === "ADMIN" ? "ADMIN" : "USER"
    }).onConflictDoUpdate({ target: appUsers.identityUserId, set: { email: config.MOCK_USER_EMAIL } }).returning();
    const user = rows[0];
    if (!user) throw new AppError("AUTH_REQUIRED", "请先登录。", 401);
    return user;
  }

  const token = await readSessionCookie();
  if (!token) throw new AppError("AUTH_REQUIRED", "请先登录。", 401);

  const rows = await db.select({ user: appUsers }).from(userSessions)
    .innerJoin(appUsers, eq(appUsers.id, userSessions.userId))
    .where(and(eq(userSessions.tokenHash, hashSessionToken(token)), gt(userSessions.expiresAt, new Date())))
    .limit(1);
  const user = rows[0]?.user;
  if (!user) throw new AppError("AUTH_REQUIRED", "登录已过期，请重新登录。", 401);
  return { id: user.id, identityUserId: user.identityUserId, email: user.email, role: user.role };
}

/**
 * Bootstrap switch: when BOOTSTRAP_FIRST_ADMIN=true and the instance has no
 * ADMIN yet, the first account to sign in is promoted. Existing accounts are
 * never promoted, so turning the flag off later leaves roles untouched.
 */
export async function shouldBootstrapAdmin(config: { BOOTSTRAP_FIRST_ADMIN: "true" | "false" }): Promise<boolean> {
  if (config.BOOTSTRAP_FIRST_ADMIN !== "true") return false;
  const rows = await db.select({ id: appUsers.id }).from(appUsers).where(eq(appUsers.role, "ADMIN")).limit(1);
  return rows.length === 0;
}

export async function requireAdmin(): Promise<AppUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new AppError("FORBIDDEN", "需要管理员权限。", 403);
  return user;
}

export async function loadAppUser(identityUserId: string): Promise<AppUser | null> {
  const rows = await db.select().from(appUsers).where(eq(appUsers.identityUserId, identityUserId)).limit(1);
  return rows[0] ?? null;
}
