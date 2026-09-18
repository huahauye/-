import { and, eq } from "drizzle-orm";
import { auditEvents, cases, claimVersions } from "@oa/domain/db";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { recomputeCaseState } from "@/lib/case-state";
import { db } from "@/lib/db";
import { AppError, errorResponse, readJson } from "@/lib/errors";
import { requireOwnedCase } from "@/lib/ownership";

const inputSchema = z.object({ claimVersionId: z.string().uuid() });
export async function POST(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  try {
    const user = await requireUser(); const { caseId } = await params; await requireOwnedCase(caseId, user.id); const input = await readJson(request, inputSchema);
    const rows = await db.select().from(claimVersions).where(and(eq(claimVersions.id, input.claimVersionId), eq(claimVersions.caseId, caseId))).limit(1);
    if (!rows[0]) throw new AppError("CURRENT_CLAIMS_UNRESOLVED", "所选权利要求版本不属于本案。", 422);
    await db.transaction(async (tx) => {
      await tx.update(claimVersions).set({ isCurrent: false }).where(eq(claimVersions.caseId, caseId));
      await tx.update(claimVersions).set({ isCurrent: true }).where(eq(claimVersions.id, input.claimVersionId));
      await tx.update(cases).set({ currentClaimVersionId: input.claimVersionId, currentClaimsConfirmed: true, updatedAt: new Date() }).where(eq(cases.id, caseId));
      await tx.insert(auditEvents).values({ actorUserId: user.id, action: "CURRENT_CLAIMS_OVERRIDE", entityType: "CASE", entityId: caseId, metadata: input });
    });
    return Response.json({ readiness: await recomputeCaseState(caseId) });
  } catch (error) { return errorResponse(error); }
}
