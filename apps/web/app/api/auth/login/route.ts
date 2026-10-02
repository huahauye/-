import { eq } from "drizzle-orm";
import { appUsers, userCredentials, userSessions } from "@oa/domain/db";
import { db } from "@/lib/db";
import { AppError, assertSameOrigin, errorResponse } from "@/lib/errors";
import { hashSessionToken, newSessionToken, normalizeEmail, sessionExpiry, verifyPassword, writeSessionCookie } from "@/lib/local-auth";

interface Credentials { email?: unknown; password?: unknown }

function readCredentials(value: Credentials): { email: string; password: string } {
  const email = typeof value.email === "string" ? normalizeEmail(value.email) : "";
  const password = typeof value.password === "string" ? value.password : "";
  if (!email.includes("@") || password.length === 0) throw new AppError("AUTH_REQUIRED", "请输入邮箱和密码。", 422);
  return { email, password };
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { email, password } = readCredentials(await request.json() as Credentials);

    const rows = await db.select({ user: appUsers, credential: userCredentials })
      .from(appUsers)
      .innerJoin(userCredentials, eq(userCredentials.userId, appUsers.id))
      .where(eq(appUsers.email, email))
      .limit(1);
    const found = rows[0];
    // One message for both failure modes so the endpoint cannot be used to
    // discover which email addresses have accounts.
    if (!found || !verifyPassword(password, found.credential.passwordHash)) {
      throw new AppError("AUTH_REQUIRED", "邮箱或密码不正确。", 401);
    }

    const token = newSessionToken();
    const expires = sessionExpiry();
    await db.insert(userSessions).values({ tokenHash: hashSessionToken(token), userId: found.user.id, expiresAt: expires });
    await writeSessionCookie(token, expires);
    return Response.json({ user: { id: found.user.id, email: found.user.email, role: found.user.role } });
  } catch (error) {
    return errorResponse(error);
  }
}
