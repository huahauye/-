import { eq } from "drizzle-orm";
import { appUsers, userCredentials, userSessions } from "@oa/domain/db";
import { db } from "@/lib/db";
import { AppError, assertSameOrigin, errorResponse } from "@/lib/errors";
import { shouldBootstrapAdmin } from "@/lib/auth";
import { serverConfig } from "@/lib/config";
import { assertPasswordAcceptable, hashPassword, hashSessionToken, newSessionToken, normalizeEmail, sessionExpiry, writeSessionCookie } from "@/lib/local-auth";

/**
 * Creates a self-hosted account and signs it in.
 *
 * With `BOOTSTRAP_FIRST_ADMIN=true` the first account created on an instance
 * that has no admin yet becomes the admin, which is how a fresh deployment is
 * initialised without a console.
 */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await request.json() as { email?: unknown; password?: unknown };
    const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!email.includes("@")) throw new AppError("MODEL_SCHEMA_INVALID", "请输入有效的邮箱地址。", 422);
    try {
      assertPasswordAcceptable(password);
    } catch {
      throw new AppError("MODEL_SCHEMA_INVALID", "密码至少需要 8 位。", 422);
    }

    const existing = await db.select({ id: appUsers.id }).from(appUsers).where(eq(appUsers.email, email)).limit(1);
    if (existing[0]) throw new AppError("CASE_IDENTITY_CONFLICT", "该邮箱已注册，请直接登录。", 409);

    const config = serverConfig();
    const role = (await shouldBootstrapAdmin(config)) ? "ADMIN" : "USER";
    const userId = await db.transaction(async (tx) => {
      const created = await tx.insert(appUsers).values({ identityUserId: `local:${email}`, email, role }).returning();
      const user = created[0];
      if (!user) throw new Error("user insert failed");
      await tx.insert(userCredentials).values({ userId: user.id, passwordHash: hashPassword(password) });
      return user.id;
    });

    const token = newSessionToken();
    const expires = sessionExpiry();
    await db.insert(userSessions).values({ tokenHash: hashSessionToken(token), userId, expiresAt: expires });
    await writeSessionCookie(token, expires);
    return Response.json({ user: { id: userId, email, role } }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
