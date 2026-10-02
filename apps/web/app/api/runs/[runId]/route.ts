import { eq } from "drizzle-orm";
import { artifacts, qaFindings, runSteps, skillVersions } from "@oa/domain/db";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/errors";
import { requireOwnedRun } from "@/lib/run-ownership";

export async function GET(_: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const user = await requireUser(); const { runId } = await params; const run = await requireOwnedRun(runId, user.id);
    const [steps, output, skill, findings] = await Promise.all([
      db.select().from(runSteps).where(eq(runSteps.runId, runId)),
      db.select({ id: artifacts.id, type: artifacts.type, mimeType: artifacts.mimeType, downloadable: artifacts.isUserDownloadable, sizeBytes: artifacts.sizeBytes, createdAt: artifacts.createdAt }).from(artifacts).where(eq(artifacts.runId, runId)),
      db.select({ version: skillVersions.version }).from(skillVersions).where(eq(skillVersions.id, run.skillVersionId)).limit(1),
      // Findings are returned so the run page can explain a QA result next to
      // the document it is handing over.
      db.select({
        id: qaFindings.id, severity: qaFindings.severity, code: qaFindings.code,
        location: qaFindings.location, message: qaFindings.message, repairStatus: qaFindings.repairStatus
      }).from(qaFindings).where(eq(qaFindings.runId, runId))
    ]);
    return Response.json({ run: { ...run, skillVersion: skill[0]?.version }, steps, artifacts: output, findings });
  } catch (error) { return errorResponse(error); }
}
