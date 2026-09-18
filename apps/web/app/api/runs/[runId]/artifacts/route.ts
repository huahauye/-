import { eq } from "drizzle-orm";
import { artifacts } from "@oa/domain/db";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/errors";
import { requireOwnedRun } from "@/lib/run-ownership";

export async function GET(_: Request, { params }: { params: Promise<{ runId: string }> }) {
  try { const user = await requireUser(); const { runId } = await params; await requireOwnedRun(runId, user.id); return Response.json({ artifacts: await db.select({ id: artifacts.id, type: artifacts.type, mimeType: artifacts.mimeType, sizeBytes: artifacts.sizeBytes, createdAt: artifacts.createdAt }).from(artifacts).where(eq(artifacts.runId, runId)) }); }
  catch (error) { return errorResponse(error); }
}
