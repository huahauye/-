import { eq } from "drizzle-orm";
import { artifacts, runSteps, skillVersions } from "@oa/domain/db";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/errors";
import { requireOwnedRun } from "@/lib/run-ownership";

export async function GET(_: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const user = await requireUser(); const { runId } = await params; const run = await requireOwnedRun(runId, user.id);
    const [steps, output, skill] = await Promise.all([
      db.select().from(runSteps).where(eq(runSteps.runId, runId)),
      db.select({ id: artifacts.id, type: artifacts.type, downloadable: artifacts.isUserDownloadable, createdAt: artifacts.createdAt }).from(artifacts).where(eq(artifacts.runId, runId)),
      db.select({ version: skillVersions.version }).from(skillVersions).where(eq(skillVersions.id, run.skillVersionId)).limit(1)
    ]);
    return Response.json({ run: { ...run, skillVersion: skill[0]?.version }, steps, artifacts: output });
  } catch (error) { return errorResponse(error); }
}
