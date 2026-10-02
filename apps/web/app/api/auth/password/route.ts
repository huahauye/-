import { eq } from "drizzle-orm";
import { userCredentials } from "@oa/domain/db";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { AppError, assertSameOrigin, errorResponse } from "@/lib/errors";
import { assertPasswordAcceptable, hashPassword, verifyPassword } from "@/lib/local-auth";

/**
 * Self-service password change. There is no email service in this deployment,
 * so a forgotten password is reset by an administrator (see README) rather than
 * by an emailed token.
 */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await request.json() as { currentPassword?: unknown; newPassword?: unknown };
    const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
    try {
      assertPasswordAcceptable(newPassword);
    } catch {
      throw new AppError("MODEL_SCHEMA_INVALID", "新密码至少需要 8 位。", 422);
    }

    const rows = await db.select().from(userCredentials).where(eq(userCredentials.userId, user.id)).limit(1);
    const credential = rows[0];
    if (!credential || !verifyPassword(currentPassword, credential.passwordHash)) {
      throw new AppError("AUTH_REQUIRED", "当前密码不正确。", 401);
    }
    await db.update(userCredentials).set({ passwordHash: hashPassword(newPassword), updatedAt: new Date() }).where(eq(userCredentials.userId, user.id));
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
