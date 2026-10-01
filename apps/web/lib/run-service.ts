import { and, eq, isNull } from "drizzle-orm";
import { cases, modelProfiles, runInputs, runModelSnapshots, runs, skillVersions, skills } from "@oa/domain/db";
import { db } from "./db";
import { AppError } from "./errors";
import { latestVersionsForCase, recomputeCaseState } from "./case-state";
import { serverConfig } from "./config";

const DISPATCH_TIMEOUT_MS = 15_000;

/**
 * Hands a queued run to the background function that executes the workflow.
 *
 * The dispatch result is checked explicitly: a silently dropped event is what
 * previously left runs stuck in QUEUED forever with nothing in the logs.
 */
async function dispatchRunWorkflow(runId: string): Promise<void> {
  const base = process.env.URL ?? process.env.DEPLOY_PRIME_URL ?? process.env.APP_BASE_URL;
  const fail = async (code: string, message: string): Promise<never> => {
    await db.update(runs).set({
      status: "FAILED",
      errorCode: code,
      userMessage: `RUN-${runId.slice(0, 4).toUpperCase()}`,
      finishedAt: new Date()
    }).where(eq(runs.id, runId));
    throw new AppError("WORKFLOW_DISPATCH_FAILED", message, 503);
  };

  if (!base) return fail("WORKFLOW_DISPATCH_NO_BASE_URL", "任务派发失败：站点地址未配置。");

  let status: number;
  try {
    const response = await fetch(new URL("/.netlify/functions/run-workflow-background", base), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runId }),
      signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS)
    });
    status = response.status;
  } catch (error) {
    return fail("WORKFLOW_DISPATCH_UNREACHABLE", `任务派发失败：${error instanceof Error ? error.message.slice(0, 60) : "网络错误"}`);
  }
  // Background functions acknowledge with 202 Accepted.
  if (status !== 202 && (status < 200 || status > 299)) {
    return fail(`WORKFLOW_DISPATCH_${status}`, "任务派发失败，请稍后重试。");
  }
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
  if (config.WORKFLOW_DRIVER === "netlify") {
    await dispatchRunWorkflow(run.id);
  } else if (config.NODE_ENV !== "test") {
    throw new Error("Inline workflow driver is test-only");
  }
  return run.id;
}
