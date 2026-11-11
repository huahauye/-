import { and, desc, eq } from "drizzle-orm";
import { artifacts } from "@oa/domain/db";
import { amendmentPlanSchema, evidenceMatrixSchema, issueListSchema, strategySchema } from "@oa/schemas";
import { db } from "./db";
import { getObjectText } from "./storage";

/**
 * Read-only view of what the workflow actually decided for one run.
 *
 * The analysis used to exist only as JSON blobs in object storage, so the run
 * page could show progress but never the reasoning. This loads those blobs back
 * — no new tables, no change to the workflow — for the 「分析结果」 screen.
 */

type ArtifactType = typeof artifacts.$inferSelect.type;

export interface RunAnalysis {
  issues: ReturnType<typeof issueListSchema.parse> | null;
  matrix: ReturnType<typeof evidenceMatrixSchema.parse> | null;
  strategy: ReturnType<typeof strategySchema.parse> | null;
  amendment: ReturnType<typeof amendmentPlanSchema.parse> | null;
}

async function latestArtifact<T>(runId: string, type: ArtifactType, parse: (value: unknown) => T): Promise<T | null> {
  const rows = await db.select({ storageKey: artifacts.storageKey }).from(artifacts)
    .where(and(eq(artifacts.runId, runId), eq(artifacts.type, type)))
    .orderBy(desc(artifacts.createdAt))
    .limit(1);
  const key = rows[0]?.storageKey;
  if (!key) return null;
  try {
    return parse(JSON.parse(await getObjectText(key)));
  } catch {
    // A malformed or legacy artifact must not break the page.
    return null;
  }
}

export async function loadRunAnalysis(runId: string): Promise<RunAnalysis> {
  const [issues, matrix, strategy, amendment] = await Promise.all([
    latestArtifact(runId, "ISSUE_LIST", (value) => issueListSchema.parse(value)),
    latestArtifact(runId, "EVIDENCE_MATRIX", (value) => evidenceMatrixSchema.parse(value)),
    latestArtifact(runId, "STRATEGY_DECISION", (value) => strategySchema.parse(value)),
    latestArtifact(runId, "AMENDMENT_PLAN", (value) => amendmentPlanSchema.parse(value))
  ]);
  return { issues, matrix, strategy, amendment };
}

export const disclosureLabel: Record<string, string> = {
  EXPLICIT: "明确公开",
  IMPLICIT: "隐含公开",
  PARTIAL: "部分公开",
  NOT_DISCLOSED: "未公开",
  DISPUTED: "有争议",
  UNVERIFIED: "未核实"
};

export const strategyTypeLabel: Record<string, string> = {
  ARGUE_WITHOUT_AMENDMENT: "不修改，仅争辩",
  AMEND_AND_ARGUE: "修改并争辩",
  FURTHER_NARROW: "进一步限缩"
};

export const claimActionLabel: Record<string, string> = {
  KEEP: "保持",
  MODIFY: "修改",
  DELETE: "删除",
  ADD: "新增"
};

export const levelLabel: Record<string, string> = { NONE: "无", LOW: "低", MEDIUM: "中", HIGH: "高" };

export const issueTypeLabel: Record<string, string> = {
  NOVELTY: "新颖性",
  INVENTIVE_STEP: "创造性",
  CLARITY: "清楚性",
  SUPPORT: "支持",
  AMENDMENT: "修改超范围",
  FORMALITY: "形式问题",
  OTHER: "其他"
};
