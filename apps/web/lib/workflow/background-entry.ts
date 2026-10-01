import { eq } from "drizzle-orm";
import { runs } from "@oa/domain/db";
import { db } from "../db";
import { runWorkflow } from "./run-workflow";

/**
 * Entry point for the background function that drives the 16-step run workflow.
 *
 * This file is NOT deployed directly: `scripts/bundle-background-function.mjs`
 * bundles it into `netlify/functions/run-workflow-background.js`. Bundling is
 * required because pnpm keeps workspace packages and their TypeScript sources in
 * the virtual store, which Netlify's function tracer cannot execute at runtime.
 *
 * Netlify answers 202 immediately and gives the invocation up to 15 minutes.
 * Step results are checkpointed in run_steps, but there is no durable retry, so a
 * failure leaves the run FAILED and the user has to start it again. A deadline is
 * enforced so the function fails cleanly instead of being killed mid-step.
 */
const DEADLINE_MS = 13 * 60_000;
const MAX_SLEEP_MS = 30_000;
const TERMINAL = new Set(["COMPLETED", "FAILED", "QA_FAILED", "CANCELLED"]);

function sleepMs(duration: string | number): number {
  if (typeof duration === "number") return Math.min(Math.max(duration, 0), MAX_SLEEP_MS);
  const match = /^(\d+(?:\.\d+)?)\s*(ms|s|sec|second|seconds|m|min|minute|minutes)$/i.exec(duration.trim());
  if (!match) return 1_000;
  const value = Number(match[1]);
  const unit = (match[2] ?? "s").toLowerCase();
  const ms = unit === "ms" ? value : unit.startsWith("m") ? value * 60_000 : value * 1_000;
  return Math.min(Math.max(ms, 0), MAX_SLEEP_MS);
}

export default async function handler(request: Request): Promise<Response> {
  let runId = "";
  try {
    const body = (await request.json()) as { runId?: unknown };
    runId = typeof body.runId === "string" ? body.runId : "";
  } catch {
    return new Response("invalid JSON body", { status: 400 });
  }
  if (!runId) return new Response("runId is required", { status: 400 });

  // Cheap guard for a publicly reachable endpoint: only a run that already
  // exists and is still waiting may be started.
  const rows = await db.select({ id: runs.id, status: runs.status }).from(runs).where(eq(runs.id, runId)).limit(1);
  const run = rows[0];
  if (!run) return new Response("unknown run", { status: 404 });
  if (run.status !== "QUEUED") return new Response(`run is ${run.status}`, { status: 409 });

  const startedAt = Date.now();
  const step = {
    run: <T>(_id: string, callback: () => Promise<T> | T): Promise<T> => Promise.resolve(callback()),
    sleep: (_id: string, duration: string | number): Promise<void> => {
      if (Date.now() - startedAt > DEADLINE_MS) {
        return Promise.reject(new Error("WORKFLOW_DEADLINE_EXCEEDED"));
      }
      return new Promise((resolve) => setTimeout(resolve, sleepMs(duration)));
    }
  };

  try {
    await runWorkflow(step, runId);
  } catch (error) {
    const code = error instanceof Error ? error.message.slice(0, 100) : "WORKFLOW_FAILED";
    await db.update(runs).set({
      status: "FAILED",
      errorCode: code,
      userMessage: `RUN-${runId.slice(0, 4).toUpperCase()}`,
      finishedAt: new Date()
    }).where(eq(runs.id, runId));
    console.error("run_workflow_failed", runId, code);
    throw error;
  }

  return new Response("workflow finished", { status: 200 });
}
