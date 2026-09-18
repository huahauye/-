import { requireUser } from "@/lib/auth";
import { recomputeCaseState } from "@/lib/case-state";
import { errorResponse } from "@/lib/errors";
import { requireOwnedCase } from "@/lib/ownership";

export async function GET(_: Request, { params }: { params: Promise<{ caseId: string }> }) {
  try { const user = await requireUser(); const { caseId } = await params; await requireOwnedCase(caseId, user.id); return Response.json(await recomputeCaseState(caseId)); }
  catch (error) { return errorResponse(error); }
}
