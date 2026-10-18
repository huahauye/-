import { describe, expect, it } from "vitest";
import { buildSkillContext, SKILL_FILES_BY_STEP, skillStepKey, type SkillInjection } from "./context";
import type { ResolvedSkill } from "./source";

function makeSkill(files: Record<string, string>, overrides: Partial<ResolvedSkill> = {}): ResolvedSkill {
  const entries = Object.entries(files).map(([path, text]) => [path, { path, text, sha256: `sha-${path}`, bytes: text.length }] as const);
  return {
    slug: "cn-patent-oa-response",
    version: "2.0.0",
    originalName: "oa-response-cn",
    originalVersion: "v0.2",
    origin: "repo",
    files: new Map(entries),
    hash: "skill-hash",
    ...overrides
  };
}

describe("SKILL_FILES_BY_STEP", () => {
  it("routes each stage to the rule files the skill's own table requires", () => {
    expect(SKILL_FILES_BY_STEP.EXTRACT_OA_ISSUES).toContain("references/evidence_protocol.md");
    expect(SKILL_FILES_BY_STEP.BUILD_EVIDENCE_MATRIX).toContain("references/evidence_protocol.md");
    expect(SKILL_FILES_BY_STEP.GENERATE_STRATEGIES).toContain("references/mairui_decision_tree.md");
    expect(SKILL_FILES_BY_STEP.BUILD_AMENDMENT_PLAN).toContain("references/claim_amendment.md");
    expect(SKILL_FILES_BY_STEP.DRAFT_STATEMENT).toContain("references/oa_writing_style.md");
    expect(SKILL_FILES_BY_STEP.DRAFT_STATEMENT).toContain("assets/opinion_body_outline.md");
    expect(SKILL_FILES_BY_STEP.SEMANTIC_QA).toContain("tests/evaluation_rubric.md");
    expect(SKILL_FILES_BY_STEP.SEMANTIC_QA).toContain("references/examiner_counterattack.md");
  });

  it("normalises the numbered repair steps onto the repair rule set", () => {
    expect(skillStepKey("REPAIR_DRAFT_2")).toBe("REPAIR_DRAFT");
    expect(skillStepKey("DRAFT_STATEMENT")).toBe("DRAFT_STATEMENT");
    expect(SKILL_FILES_BY_STEP.REPAIR_DRAFT).toContain("references/oa_writing_style.md");
  });
});

describe("buildSkillContext", () => {
  const skill = makeSkill({
    "SKILL.md": "# skill\n阶段0 材料核验，红线：不得虚构。",
    "references/evidence_protocol.md": "[原文已核] 与 [OA主张] 必须分开。",
    "references/mairui_decision_tree.md": "P0 日期资格；P1 区别特征。",
    "references/oa_writing_style.md": "对于上述区别技术特征1）……突出的实质性特点与显著的进步分别写。",
    "assets/opinion_body_outline.md": "# 正文骨架"
  });

  it("returns null when injection is disabled or the step has no rule set", () => {
    expect(buildSkillContext(null, "DRAFT_STATEMENT", 40_000)).toBeNull();
    expect(buildSkillContext(skill, "SNAPSHOT_CASE", 40_000)).toBeNull();
  });

  it("injects only the files mapped to the step, with provenance in the header", () => {
    const injection = buildSkillContext(skill, "GENERATE_STRATEGIES", 40_000) as SkillInjection;
    expect(injection.files.map((file) => file.path)).toEqual(["references/mairui_decision_tree.md"]);
    expect(injection.text).toContain("P0 日期资格");
    expect(injection.text).not.toContain("[原文已核]");
    expect(injection.text).toContain("cn-patent-oa-response@2.0.0");
    expect(injection.text).toContain("oa-response-cn v0.2");
    expect(injection.origin).toBe("repo");
  });

  it("carries the discipline header that keeps rules separate from case facts", () => {
    const injection = buildSkillContext(skill, "EXTRACT_OA_ISSUES", 40_000)!;
    expect(injection.text).toContain("不得虚构");
    expect(injection.text).toContain("以材料原文为准");
  });

  it("truncates instead of silently dropping when the budget is small", () => {
    const wide = makeSkill({ "references/oa_writing_style.md": "A".repeat(5_000) });
    const injection = buildSkillContext(wide, "DRAFT_STATEMENT", 1_200)!;
    const file = injection.files[0]!;
    expect(file.truncated).toBe(true);
    expect(injection.text.length).toBeLessThan(1_600);
    expect(injection.text).toContain("已截断");
  });

  it("stops adding files once the budget is spent", () => {
    const injection = buildSkillContext(skill, "EXTRACT_OA_ISSUES", 700)!;
    expect(injection.files.length).toBeGreaterThanOrEqual(1);
    expect(injection.text.length).toBeLessThan(1_200);
  });

  it("produces a hash that identifies exactly which rules were injected", () => {
    const first = buildSkillContext(skill, "DRAFT_STATEMENT", 40_000)!;
    const second = buildSkillContext(skill, "DRAFT_STATEMENT", 40_000)!;
    expect(first.hash).toBe(second.hash);
    expect(first.hash).toMatch(/^[0-9a-f]{64}$/);

    const different = buildSkillContext(makeSkill({ "references/oa_writing_style.md": "另一版写作规范" }), "DRAFT_STATEMENT", 40_000)!;
    expect(different.hash).not.toBe(first.hash);
  });
});
