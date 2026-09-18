import { desc, eq } from "drizzle-orm";
import { runs } from "@oa/domain/db";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { assertSameOrigin, errorResponse } from "@/lib/errors";
import { requireOwnedCase } from "@/lib/ownership";
import { rateLimit } from "@/lib/rate-limit";
import { createRun } from "@/lib/run-service";

export async function GET(_: Request, { params }: { params: Promise<{ caseId: string }> }) {
  try { const user = await requireUser(); const { caseId } = await params; await requireOwnedCase(caseId, user.id); return Response.json({ runs: await db.select().from(runs).where(eq(runs.caseId, caseId)).orderBy(desc(runs.createdAt)) }); }
  catch (error) { return errorResponse(error); }
}
export async function POST(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  try { assertSameOrigin(request); const user = await requireUser(); const { caseId } = await params; await requireOwnedCase(caseId, user.id); rateLimit(`run:${user.id}`, 5, 60_000); const runId = await createRun(caseId, user.id); return Response.json({ runId }, { status: 202 }); }
  catch (error) { return errorResponse(error); }
}
