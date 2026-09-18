import { and, eq } from "drizzle-orm";
import { auditEvents, documents } from "@oa/domain/db";
import { classificationUpdateSchema } from "@oa/schemas";
import { requireUser } from "@/lib/auth";
import { recomputeCaseState } from "@/lib/case-state";
import { db } from "@/lib/db";
import { errorResponse, readJson } from "@/lib/errors";
import { requireOwnedCase } from "@/lib/ownership";

export async function PATCH(request: Request, { params }: { params: Promise<{ caseId: string; documentId: string }> }) {
  try {
    const user = await requireUser(); const { caseId, documentId } = await params; await requireOwnedCase(caseId, user.id);
    const input = await readJson(request, classificationUpdateSchema);
    const previous = await db.select().from(documents).where(and(eq(documents.id, documentId), eq(documents.caseId, caseId))).limit(1);
    const rows = await db.update(documents).set({ ...input, userConfirmed: true, updatedAt: new Date() }).where(and(eq(documents.id, documentId), eq(documents.caseId, caseId))).returning();
    await db.insert(auditEvents).values({ actorUserId: user.id, action: "DOCUMENT_CLASSIFICATION_OVERRIDE", entityType: "DOCUMENT", entityId: documentId, metadata: { previous: previous[0]?.aiSuggestion ?? previous[0], selected: input } });
    await recomputeCaseState(caseId);
    return Response.json({ document: rows[0] });
  } catch (error) { return errorResponse(error); }
}
