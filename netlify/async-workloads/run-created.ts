import { asyncWorkloadFn, type AsyncWorkloadConfig } from "@netlify/async-workloads";
import { eq } from "drizzle-orm";
import { runs } from "@oa/domain/db";
import { db } from "../../apps/web/lib/db";
import { runWorkflow } from "../../apps/web/lib/workflow/run-workflow";

export default asyncWorkloadFn(async (event) => {
  const { runId } = event.eventData as { runId: string };
  try {
    await runWorkflow(event.step, runId);
  } catch (error) {
    await db.update(runs).set({
      status: "FAILED",
      errorCode: error instanceof Error ? error.message.slice(0, 100) : "WORKFLOW_FAILED",
      userMessage: `RUN-${runId.slice(0, 4).toUpperCase()}`,
      finishedAt: new Date()
    }).where(eq(runs.id, runId));
    throw error;
  }
});

export const asyncWorkloadConfig: AsyncWorkloadConfig = {
  events: ["run.created"],
  maxRetries: 2,
  backoffSchedule: (attempt) => attempt === 0 ? "10 seconds" : "1 minute"
};
