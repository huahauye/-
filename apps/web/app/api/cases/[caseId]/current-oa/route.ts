import { and, eq } from "drizzle-orm";
import { auditEvents, cases, documents } from "@oa/domain/db";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { recomputeCaseState } from "@/lib/case-state";
import { db } from "@/lib/db";
import { AppError, errorResponse, readJson } from "@/lib/errors";
import { requireOwnedCase } from "@/lib/ownership";

const inputSchema = z.object({ documentId: z.string().uuid() });
export async function POST(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  try {
    const user = await requireUser(); const { caseId } = await params; await requireOwnedCase(caseId, user.id); const input = await readJson(request, inputSchema);
    const rows = await db.select().from(documents).where(and(eq(documents.id, input.documentId), eq(documents.caseId, caseId), eq(documents.role, "OFFICE_ACTION"))).limit(1);
    if (!rows[0]) throw new AppError("CURRENT_OA_UNRESOLVED", "所选文件不是本案审查意见通知书。", 422);
    await db.update(cases).set({ currentOaDocumentId: input.documentId, currentOaConfirmed: true, updatedAt: new Date() }).where(eq(cases.id, caseId));
    await db.insert(auditEvents).values({ actorUserId: user.id, action: "CURRENT_OA_OVERRIDE", entityType: "CASE", entityId: caseId, metadata: input });
    return Response.json({ readiness: await recomputeCaseState(caseId) });
  } catch (error) { return errorResponse(error); }
}
