import { and, eq, notInArray } from "drizzle-orm";
import { runs, workerJobs } from "@oa/domain/db";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/errors";
import { requireOwnedRun } from "@/lib/run-ownership";

export async function POST(_: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const user = await requireUser(); const { runId } = await params; await requireOwnedRun(runId, user.id);
    await db.transaction(async (tx) => {
      await tx.update(runs).set({ status: "CANCELLED", finishedAt: new Date() }).where(and(eq(runs.id, runId), notInArray(runs.status, ["COMPLETED", "FAILED", "QA_FAILED", "CANCELLED"])));
      await tx.update(workerJobs).set({ status: "CANCELLED", updatedAt: new Date() }).where(and(eq(workerJobs.runId, runId), eq(workerJobs.status, "QUEUED")));
    });
    return Response.json({ status: "CANCELLED" });
  } catch (error) { return errorResponse(error); }
}
