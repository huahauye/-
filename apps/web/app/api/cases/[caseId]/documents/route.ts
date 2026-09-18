import { eq } from "drizzle-orm";
import { documents, documentVersions } from "@oa/domain/db";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/errors";
import { requireOwnedCase } from "@/lib/ownership";

export async function GET(_: Request, { params }: { params: Promise<{ caseId: string }> }) {
  try {
    const user = await requireUser(); const { caseId } = await params; await requireOwnedCase(caseId, user.id);
    const rows = await db.select({ document: documents, version: documentVersions }).from(documents).leftJoin(documentVersions, eq(documentVersions.documentId, documents.id)).where(eq(documents.caseId, caseId));
    return Response.json({ documents: rows });
  } catch (error) { return errorResponse(error); }
}
