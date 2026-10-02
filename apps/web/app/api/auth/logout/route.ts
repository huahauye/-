import { eq } from "drizzle-orm";
import { userSessions } from "@oa/domain/db";
import { db } from "@/lib/db";
import { assertSameOrigin, errorResponse } from "@/lib/errors";
import { clearSessionCookie, hashSessionToken, readSessionCookie } from "@/lib/local-auth";

/** Revokes the server-side session, so signing out actually invalidates the cookie. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const token = await readSessionCookie();
    if (token) await db.delete(userSessions).where(eq(userSessions.tokenHash, hashSessionToken(token)));
    await clearSessionCookie();
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
