import { describe, expect, it } from "vitest";
import { evidenceRefSchema, oaIssueSchema, statementSchema, strategySchema } from "./index";

const envelope = { schemaVersion: "1.0" as const, generatedAt: new Date().toISOString(), runId: "00000000-0000-4000-8000-000000000000" };

describe("strategySchema", () => {
  const candidate = {
    id: "S1",
    type: "ARGUE_WITHOUT_AMENDMENT" as const,
    summary: "以 D1 未公开区别特征为由争辩",
    scopeLoss: "NONE" as const,
    supportRisk: "LOW" as const,
    evidenceStrength: "MEDIUM" as const
  };

  it("accepts a single viable option, because the skill forbids padding to three", () => {
    const parsed = strategySchema.safeParse({ ...envelope, candidates: [candidate], selectedId: "S1", selectionRationale: "仅此方案成立" });
    expect(parsed.success).toBe(true);
  });

  it("still accepts three options", () => {
    const parsed = strategySchema.safeParse({ ...envelope, candidates: [candidate, { ...candidate, id: "S2" }, { ...candidate, id: "S3" }], selectedId: "S1", selectionRationale: "三案对比" });
    expect(parsed.success).toBe(true);
  });

  it("rejects an empty list so a run cannot sidestep the strategy step", () => {
    expect(strategySchema.safeParse({ ...envelope, candidates: [], selectedId: "S1", selectionRationale: "x" }).success).toBe(false);
  });

  it("carries the optional examiner counter-attack", () => {
    const parsed = strategySchema.safeParse({ ...envelope, candidates: [{ ...candidate, counterattack: "审查员会主张该限定属于常规选择" }], selectedId: "S1", selectionRationale: "x" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.candidates[0]!.counterattack).toBeTruthy();
  });
});

describe("evidence discipline fields", () => {
  it("keeps evidence references valid without the new tags (historical artifacts)", () => {
    expect(evidenceRefSchema.safeParse({ documentVersionId: envelope.runId }).success).toBe(true);
  });

  it("accepts the skill's source tags", () => {
    for (const tag of ["原文已核", "OA主张", "推断", "未检索到", "待核", "用户确认"] as const) {
      expect(evidenceRefSchema.safeParse({ documentVersionId: envelope.runId, sourceTag: tag }).success).toBe(true);
    }
    expect(evidenceRefSchema.safeParse({ documentVersionId: envelope.runId, sourceTag: "自行编造" }).success).toBe(false);
  });

  it("lets an issue record whether the examiner's position is verified or merely claimed", () => {
    const issue = {
      issueId: "OA-1",
      claimRefs: ["1"],
      legalBasis: "专利法第22条第3款",
      issueType: "INVENTIVE_STEP" as const,
      examinerPosition: "对比文件1公开了全部特征",
      priorArts: ["D1"],
      reasoning: "…",
      previousArgumentResponse: null,
      factStatus: "OA主张" as const,
      oaLocation: "第2页第3段",
      evidence: []
    };
    expect(oaIssueSchema.safeParse(issue).success).toBe(true);
    expect(oaIssueSchema.safeParse({ ...issue, factStatus: "已确认" }).success).toBe(false);
  });
});

describe("statementSchema compatibility", () => {
  it("still validates the document shape the DOCX builder consumes", () => {
    const statement = {
      ...envelope,
      title: "意见陈述书" as const,
      applicationNumber: "CN202310123456.7",
      inventionTitle: "一种方法",
      applicant: "",
      oaRound: "第1次",
      oaDate: "2026年06月19日",
      oaSerial: "2026061900015090",
      lead: [{ text: "引言", kind: "body" as const, evidenceIds: [], issueIds: [] }],
      sections: [{ heading: "一、修改说明", paragraphs: [{ text: "正文", kind: "body" as const, evidenceIds: [], issueIds: ["OA-1"] }] }],
      closing: [],
      reviewNotes: []
    };
    const parsed = statementSchema.safeParse(statement);
    expect(parsed.success).toBe(true);
  });
});
