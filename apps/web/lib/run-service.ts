import { and, eq, inArray, isNull } from "drizzle-orm";
import { cases, modelProfiles, runInputs, runModelSnapshots, runs, skillVersions, skills } from "@oa/domain/db";
import { db } from "./db";
import { AppError } from "./errors";
import { latestVersionsForCase, recomputeCaseState } from "./case-state";
import { serverConfig } from "./config";
import { runWorkflow } from "./workflow/run-workflow";

/**
 * Run dispatch for a self-hosted deployment.
 *
 * The workflow runs inside the long-lived Next.js server process instead of a
 * serverless background function, which removes the platform timeout, the
 * deployment-specific invocation shape and the silent-drop failure mode that
 * came with it. Progress is still checkpointed in `run_steps`, so a restart is
 * the only thing that can interrupt a run; `recoverInterruptedRuns` then closes
 * those runs out instead of leaving them in flight forever.
 */

/** Cap on a single poll sleep so a stopped workflow cannot park a timer for long. */
const MAX_SLEEP_MS = 30_000;

/** Run ids executing in this process, so a double submit cannot start two workflows. */
const activeRuns = new Set<string>();

const IN_FLIGHT_STATUSES = ["QUEUED", "ANALYZING", "DRAFTING", "QUALITY_CHECK", "GENERATING_DOCUMENT"] as const;

function sleepMs(duration: string | number): number {
  if (typeof duration === "number") return Math.min(Math.max(duration, 0), MAX_SLEEP_MS);
  const match = /^(\d+(?:\.\d+)?)\s*(ms|s|sec|second|seconds|m|min|minute|minutes)$/i.exec(duration.trim());
  if (!match) return 1_000;
  const value = Number(match[1]);
  const unit = (match[2] ?? "s").toLowerCase();
  const ms = unit === "ms" ? value : unit.startsWith("m") ? value * 60_000 : value * 1_000;
  return Math.min(Math.max(ms, 0), MAX_SLEEP_MS);
}

/**
 * Closes out runs that were in flight when the process stopped. Called once at
 * server start-up, before any new run can be created.
 */
export async function recoverInterruptedRuns(): Promise<number> {
  const rows = await db.update(runs).set({
    status: "FAILED",
    errorCode: "WORKFLOW_INTERRUPTED",
    userMessage: "服务重启导致任务中断，请重新发起。",
    finishedAt: new Date()
  }).where(inArray(runs.status, [...IN_FLIGHT_STATUSES])).returning({ id: runs.id });
  return rows.length;
}

function startRunWorkflow(runId: string): void {
  if (activeRuns.has(runId)) return;
  activeRuns.add(runId);

  const step = {
    run: <T>(_id: string, callback: () => Promise<T> | T): Promise<T> => Promise.resolve(callback()),
    sleep: (_id: string, duration: string | number): Promise<void> =>
      new Promise((resolve) => { setTimeout(resolve, sleepMs(duration)); })
  };

  void runWorkflow(step, runId)
    .catch(async (error: unknown) => {
      const code = error instanceof Error ? error.message.slice(0, 100) : "WORKFLOW_FAILED";
      try {
        await db.update(runs).set({
          status: "FAILED",
          errorCode: code,
          userMessage: `RUN-${runId.slice(0, 4).toUpperCase()}`,
          finishedAt: new Date()
        }).where(eq(runs.id, runId));
      } catch {
        // The run row is gone or the database is unreachable; there is nothing
        // left to record the failure against.
      }
    })
    .finally(() => { activeRuns.delete(runId); });
}

export async function createRun(caseId: string, userId: string): Promise<string> {
  const readiness = await recomputeCaseState(caseId);
  if (!readiness || readiness.status !== "READY") throw new AppError("CURRENT_CLAIMS_UNRESOLVED", "案件材料尚未准备完成。", 409);
  const caseRows = await db.select().from(cases).where(and(eq(cases.id, caseId), eq(cases.ownerUserId, userId), isNull(cases.deletedAt))).limit(1);
  const patentCase = caseRows[0];
  if (!patentCase?.currentOaDocumentId || !patentCase.currentClaimVersionId) throw new AppError("CURRENT_CLAIMS_UNRESOLVED", "当前 OA 或权利要求未确认。", 409);
  const currentOaDocumentId = patentCase.currentOaDocumentId;
  const currentClaimVersionId = patentCase.currentClaimVersionId;
  const config = serverConfig();
  const published = await db.select({ version: skillVersions }).from(skillVersions).innerJoin(skills, eq(skills.id, skillVersions.skillId))
    .where(and(eq(skills.slug, config.ACTIVE_SKILL_SLUG), eq(skillVersions.status, "PUBLISHED"), eq(skillVersions.isActive, true))).limit(1);
  if (!published[0]) throw new AppError("SKILL_NOT_PUBLISHED", "管理员尚未发布答复 Skill。", 503);
  const profiles = await db.select().from(modelProfiles).where(eq(modelProfiles.enabled, true));
  const required = new Set(["ANALYSIS", "DRAFTING", "QA"]);
  for (const profile of profiles) required.delete(profile.purpose);
  if (required.size) throw new AppError("MODEL_PROFILE_MISSING", "管理员尚未完成模型配置。", 503);
  const inputs = await latestVersionsForCase(caseId);
  const [run] = await db.transaction(async (tx) => {
    const runValues: typeof runs.$inferInsert = {
      caseId,
      createdBy: userId,
      status: "QUEUED",
      currentOaDocumentId,
      currentClaimVersionId,
      skillVersionId: published[0]!.version.id,
      parserVersion: config.PARSER_VERSION,
      builderVersion: config.BUILDER_VERSION,
      appGitSha: config.APP_GIT_SHA
    };
    const created = await tx.insert(runs).values(runValues).returning();
    const run = created[0];
    if (!run) throw new Error("Run insert failed");
    if (inputs.length) await tx.insert(runInputs).values(inputs.map(({ version, document }) => ({ runId: run.id, documentVersionId: version.id, inputRole: document.role })));
    await tx.insert(runModelSnapshots).values(profiles.map((profile) => ({
      runId: run.id, purpose: profile.purpose, provider: profile.provider, model: profile.model, secretRef: profile.secretRef,
      config: {
        ...profile.config as object,
        ...(profile.temperature === null ? {} : { temperature: Number(profile.temperature) }),
        ...(profile.maxOutputTokens === null ? {} : { maxOutputTokens: profile.maxOutputTokens })
      }
    })));
    return [run];
  });
  if (!run) throw new Error("Run transaction failed");
  // Tests drive the workflow directly so they do not depend on timers.
  if (config.NODE_ENV !== "test") startRunWorkflow(run.id);
  return run.id;
}
