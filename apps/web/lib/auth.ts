import { getUser } from "@netlify/identity";
import { eq } from "drizzle-orm";
import { appUsers } from "@oa/domain/db";
import { db } from "./db";
import { AppError } from "./errors";
import { serverConfig } from "./config";

export interface AppUser { id: string; identityUserId: string; email: string; role: "USER" | "ADMIN"; }

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

  const identityUser = await getUser();
  if (!identityUser?.id || !identityUser.email) throw new AppError("AUTH_REQUIRED", "请先登录。", 401);
  const claims = identityUser.appMetadata as { roles?: string[] } | undefined;
  const role = claims?.roles?.includes("admin") ? "ADMIN" : "USER";
  const rows = await db.insert(appUsers).values({ identityUserId: identityUser.id, email: identityUser.email, role })
    .onConflictDoUpdate({ target: appUsers.identityUserId, set: { email: identityUser.email, updatedAt: new Date() } }).returning();
  const user = rows[0];
  if (!user) throw new AppError("AUTH_REQUIRED", "请先登录。", 401);
  return user;
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
