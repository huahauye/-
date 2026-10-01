import { eq } from "drizzle-orm";
import { auditEvents, runs } from "@oa/domain/db";
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
 * Background mode is declared twice on purpose: the `-background` filename
 * suffix (the legacy convention, already proven to return 202 on this site) and
 * `config.background` for the newer typed-config path. Either one alone is
 * enough; if the typed config cannot be read out of a bundled CommonJS file, the
 * suffix still keeps the invocation asynchronous.
 *
 * `readRunId` accepts both a web `Request` body and a legacy Lambda-style
 * `event.body`, because the platform passes a `Request` when the typed config is
 * honoured and a Lambda event otherwise. The original silent no-op was this
 * mismatch: the old handler only read `event.body`, so a `Request` produced an
 * empty runId and the function returned without doing anything.
 *
 * Netlify answers 202 immediately and gives the invocation up to 15 minutes.
 * Step results are checkpointed in run_steps, but there is no durable retry, so a
 * failure leaves the run FAILED and the user has to start it again. A deadline is
 * enforced so the function fails cleanly instead of being killed mid-step.
 */
const DEADLINE_MS = 13 * 60_000;
const MAX_SLEEP_MS = 30_000;

// Declared without importing `@netlify/functions`: the package is not a
// dependency of this app, and a type-only import of an unlisted module still
// breaks `next build`.
export const config = { background: true };

function sleepMs(duration: string | number): number {
  if (typeof duration === "number") return Math.min(Math.max(duration, 0), MAX_SLEEP_MS);
  const match = /^(\d+(?:\.\d+)?)\s*(ms|s|sec|second|seconds|m|min|minute|minutes)$/i.exec(duration.trim());
  if (!match) return 1_000;
  const value = Number(match[1]);
  const unit = (match[2] ?? "s").toLowerCase();
  const ms = unit === "ms" ? value : unit.startsWith("m") ? value * 60_000 : value * 1_000;
  return Math.min(Math.max(ms, 0), MAX_SLEEP_MS);
}

function databaseHost(): { dbHost: string; source: string } {
  const url = process.env.NETLIFY_DB_URL ?? process.env.DATABASE_URL ?? "";
  const source = process.env.NETLIFY_DB_URL ? "NETLIFY_DB_URL" : process.env.DATABASE_URL ? "DATABASE_URL" : "none";
  try {
    return { dbHost: url ? new URL(url).host : "unset", source };
  } catch {
    return { dbHost: "unparseable", source };
  }
}

async function readRunId(request: Request): Promise<{ runId: string; shape: string }> {
  const candidate = request as unknown as { json?: unknown; body?: unknown; isBase64Encoded?: unknown };
  if (typeof candidate.json === "function") {
    try {
      const parsed = (await (candidate.json as () => Promise<unknown>)()) as { runId?: unknown } | null;
      if (typeof parsed?.runId === "string") return { runId: parsed.runId, shape: "request.json" };
    } catch {
      // fall through to the legacy shape below
    }
  }
  let body = typeof candidate.body === "string" ? candidate.body : "";
  let shape = "event.body";
  if (body.length > 0 && candidate.isBase64Encoded === true) {
    body = Buffer.from(body, "base64").toString("utf8");
    shape = "event.body-base64";
  }
  if (body.length > 0) {
    try {
      const parsed = JSON.parse(body) as { runId?: unknown };
      if (typeof parsed?.runId === "string") return { runId: parsed.runId, shape };
    } catch {
      return { runId: "", shape: `${shape}-invalid` };
    }
  }
  return { runId: "", shape: "unreadable" };
}

export default async function handler(request: Request): Promise<Response> {
  const { dbHost, source } = databaseHost();
  const { runId, shape } = await readRunId(request);

  // The database is the only reliable observation channel for a background
  // invocation: the platform discards the response and may not surface console
  // output, so the dispatch outcome is recorded as an audit event.
  const record = async (metadata: Record<string, unknown>): Promise<void> => {
    try {
      await db.insert(auditEvents).values({
        action: "WORKFLOW_DISPATCH",
        entityType: "RUN",
        entityId: runId || "missing",
        metadata: { dbHost, source, shape, ...metadata }
      });
    } catch (error) {
      console.error("dispatch_audit_failed", error instanceof Error ? error.message : String(error));
    }
  };

  if (!runId) {
    await record({ outcome: "no-run-id" });
    return new Response("runId is required", { status: 400 });
  }

  // Cheap guard for a publicly reachable endpoint: only a run that already
  // exists and is still waiting may be started.
  const rows = await db.select({ id: runs.id, status: runs.status }).from(runs).where(eq(runs.id, runId)).limit(1);
  const run = rows[0];
  if (!run) {
    await record({ outcome: "unknown-run" });
    return new Response("unknown run", { status: 404 });
  }
  if (run.status !== "QUEUED") {
    await record({ outcome: "not-queued", status: run.status });
    return new Response(`run is ${run.status}`, { status: 409 });
  }

  await record({ outcome: "starting" });

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
    await record({ outcome: "failed", code });
    throw error;
  }

  await record({ outcome: "completed" });
  return new Response("workflow finished", { status: 200 });
}
