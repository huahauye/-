import { createHash } from "node:crypto";
import type { ResolvedSkill } from "./source";

/**
 * Which Skill documents each workflow step receives.
 *
 * The mapping follows the skill's own progressive-disclosure table in
 * `SKILL.md` ("读取文件的时机"): a step only gets the rules it needs, so the
 * prompt stays focused and the context budget is spent on relevant material.
 */
export const SKILL_FILES_BY_STEP: Record<string, readonly string[]> = {
  // 阶段0/1：材料核验、审查意见与证据链重建
  EXTRACT_OA_ISSUES: [
    "SKILL.md",
    "references/intake_workflow.md",
    "references/evidence_protocol.md",
    "references/legal_sources.md"
  ],
  // 阶段1：逐特征矩阵与公开状态认定
  BUILD_EVIDENCE_MATRIX: [
    "references/evidence_protocol.md",
    "references/creativity_framework.md"
  ],
  // 阶段2：迈瑞 P0–P6 与策略候选
  GENERATE_STRATEGIES: [
    "references/mairui_decision_tree.md",
    "references/creativity_framework.md",
    "references/examiner_counterattack.md",
    "references/claim_amendment.md"
  ],
  // 阶段3：权利要求修改与超范围依据
  BUILD_AMENDMENT_PLAN: [
    "references/claim_amendment.md",
    "references/evidence_protocol.md",
    "references/examiner_counterattack.md"
  ],
  // 阶段4：正式正文
  DRAFT_STATEMENT: [
    "references/oa_writing_style.md",
    "assets/opinion_body_outline.md",
    "references/claim_amendment.md",
    "references/creativity_framework.md",
    "references/evidence_protocol.md"
  ],
  // 返修沿用起草规则
  REPAIR_DRAFT: [
    "references/oa_writing_style.md",
    "assets/opinion_body_outline.md",
    "references/evidence_protocol.md",
    "references/examiner_counterattack.md"
  ],
  // 阶段4/5：独立复查按评分表与反攻协议
  SEMANTIC_QA: [
    "tests/evaluation_rubric.md",
    "references/examiner_counterattack.md",
    "references/evidence_protocol.md",
    "references/oa_writing_style.md"
  ],
  VERIFY_REPAIR: [
    "tests/evaluation_rubric.md",
    "tests/smoke_tests.md",
    "references/examiner_counterattack.md",
    "references/evidence_protocol.md"
  ]
};

export interface InjectedFile {
  path: string;
  chars: number;
  truncated: boolean;
}

export interface SkillInjection {
  /** Prompt-ready block, empty when the skill has nothing for this step. */
  text: string;
  /** Hash over identity + the exact files and lengths injected into this call. */
  hash: string;
  files: InjectedFile[];
  identity: string;
  origin: "db" | "repo";
}

/** `REPAIR_DRAFT_2` belongs to the same rule set as `REPAIR_DRAFT`. */
export function skillStepKey(stepKey: string): string {
  return stepKey.replace(/_\d+$/, "");
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Assembles the skill block for one step, within a character budget.
 *
 * Files are taken in the order the step lists them (most important first) and
 * the last one that does not fit is truncated rather than dropped, so a step
 * keeps the beginning of a later rule file instead of losing it entirely.
 */
export function buildSkillContext(skill: ResolvedSkill | null, stepKey: string, charLimit: number): SkillInjection | null {
  if (!skill) return null;
  const wanted = SKILL_FILES_BY_STEP[skillStepKey(stepKey)];
  if (!wanted || wanted.length === 0) return null;

  const identity = `${skill.slug}@${skill.version}${skill.originalName ? `（原始 ${skill.originalName} ${skill.originalVersion ?? ""}`.trimEnd() + "）" : ""}`;
  const header = [
    `以下为本案答复必须遵循的专业规则，来自 ${identity}。`,
    "规则是方法与纪律，不是事实：一切事实（权项原文、对比文件公开内容、说明书依据、页码段落）必须取自本案材料；材料未记载的内容标记为待核实，不得虚构。",
    "规则与本案材料冲突时，以材料原文为准。"
  ].join("\n");

  const sections: string[] = [header];
  const files: InjectedFile[] = [];
  let used = header.length;

  for (const path of wanted) {
    const file = skill.files.get(path);
    if (!file || !file.text.trim()) continue;
    const remaining = charLimit - used;
    if (remaining < 400) break;
    const heading = `\n\n### 规则文件：${path}\n`;
    const budget = remaining - heading.length;
    const text = file.text.length > budget ? `${file.text.slice(0, Math.max(0, budget))}\n…（规则文件超出本次上下文预算，已截断）` : file.text;
    sections.push(heading + text);
    used += heading.length + text.length;
    files.push({ path, chars: text.length, truncated: text.length < file.text.length });
  }

  if (files.length === 0) return null;
  const hash = sha256(`${identity}\n${files.map((file) => `${file.path}:${file.chars}:${file.truncated ? 1 : 0}`).join("\n")}`);
  return { text: sections.join(""), hash, files, identity, origin: skill.origin };
}
