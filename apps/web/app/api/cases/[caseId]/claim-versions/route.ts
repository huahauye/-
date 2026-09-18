import { desc, eq } from "drizzle-orm";
import { claimVersions } from "@oa/domain/db";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/errors";
import { requireOwnedCase } from "@/lib/ownership";

export async function GET(_: Request, { params }: { params: Promise<{ caseId: string }> }) {
  try { const user=await requireUser(); const {caseId}=await params; await requireOwnedCase(caseId,user.id); return Response.json({ claimVersions: await db.select({ id: claimVersions.id, label: claimVersions.label, ordinal: claimVersions.ordinal, confidence: claimVersions.confidence, isCurrent: claimVersions.isCurrent, createdAt: claimVersions.createdAt }).from(claimVersions).where(eq(claimVersions.caseId,caseId)).orderBy(desc(claimVersions.ordinal)) }); }
  catch(error){return errorResponse(error)}
}
