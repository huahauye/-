import { and, eq } from "drizzle-orm";
import { auditEvents, cases } from "@oa/domain/db";
import { updateCaseSchema } from "@oa/schemas";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { errorResponse, readJson } from "@/lib/errors";
import { requireOwnedCase } from "@/lib/ownership";

type Context = { params: Promise<{ caseId: string }> };
export async function GET(_: Request, { params }: Context) {
  try { const user = await requireUser(); return Response.json({ case: await requireOwnedCase((await params).caseId, user.id) }); }
  catch (error) { return errorResponse(error); }
}
export async function PATCH(request: Request, { params }: Context) {
  try {
    const user = await requireUser(); const { caseId } = await params; await requireOwnedCase(caseId, user.id);
    const input = await readJson(request, updateCaseSchema);
    const rows = await db.update(cases).set({ ...input, updatedAt: new Date() }).where(and(eq(cases.id, caseId), eq(cases.ownerUserId, user.id))).returning();
    return Response.json({ case: rows[0] });
  } catch (error) { return errorResponse(error); }
}
export async function DELETE(_: Request, { params }: Context) {
  try {
    const user = await requireUser(); const { caseId } = await params; await requireOwnedCase(caseId, user.id);
    await db.transaction(async (tx) => {
      await tx.update(cases).set({ deletedAt: new Date(), updatedAt: new Date() }).where(and(eq(cases.id, caseId), eq(cases.ownerUserId, user.id)));
      await tx.insert(auditEvents).values({ actorUserId: user.id, action: "CASE_SOFT_DELETE", entityType: "CASE", entityId: caseId, metadata: { cleanupScheduled: true } });
    });
    return new Response(null, { status: 204 });
  } catch (error) { return errorResponse(error); }
}
