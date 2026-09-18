import type { LLMProvider, StructuredRequest, StructuredResult, TextRequest, TextResult } from "./provider";

export class MockProvider implements LLMProvider {
  constructor(private readonly fixtures: Record<string, unknown> = {}) {}
  async generateStructured<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const fixture = this.fixtures[request.schemaName] ?? defaultFixture(request.schemaName, request.input, request.metadata);
    if (!fixture) throw new Error(`Missing mock fixture: ${request.schemaName}`);
    return { value: request.schema.parse(fixture), usage: { input_tokens: 1, output_tokens: 1 }, responseId: `mock-${request.schemaName}` };
  }
  async generateText(request: TextRequest): Promise<TextResult> { return { text: request.input, responseId: "mock-text" }; }
  supportsVision(): boolean { return false; }
}

function defaultFixture(name: string, input: string, metadata?: Record<string, string>): unknown {
  const runId = metadata?.run_id ?? "00000000-0000-4000-8000-000000000000";
  const envelope = { schemaVersion: "1.0", generatedAt: new Date().toISOString(), runId };
  const start = input.indexOf("<CASE_MATERIALS_UNTRUSTED_DATA>");
  const end = input.lastIndexOf("</CASE_MATERIALS_UNTRUSTED_DATA>");
  let data: any = {};
  try { data = JSON.parse(input.slice(start + "<CASE_MATERIALS_UNTRUSTED_DATA>".length, end)); } catch { /* fixture remains generic */ }
  const snapshot = data.snapshot ?? data;
  const oa = snapshot?.documents?.find((document: any) => document.role === "OFFICE_ACTION");
  const caseData = snapshot?.patentCase ?? {};
  const issue = { issueId: "OA-C1-22.3-01", claimRefs: ["1"], legalBasis: "专利法第二十二条第三款", issueType: "INVENTIVE_STEP", examinerPosition: "开发测试审查命题", priorArts: ["D1"], reasoning: "开发测试推理", previousArgumentResponse: null, evidence: [] };
  if (name === "oa_issue_list") return { ...envelope, issues: [issue] };
  if (name === "evidence_matrix") return { ...envelope, issues: [{ issueId: issue.issueId, claim: "1", features: [{ featureId: "C1-F01", text: "开发测试特征", applicationEvidence: [], examinerEvidence: [], priorArtEvidence: { D1: { status: "UNVERIFIED", evidence: [] } } }] }] };
  if (name === "strategy_decision") return { ...envelope, candidates: [
    { id: "A", type: "ARGUE_WITHOUT_AMENDMENT", summary: "不修改争辩", scopeLoss: "NONE", supportRisk: "LOW", evidenceStrength: "MEDIUM" },
    { id: "B", type: "AMEND_AND_ARGUE", summary: "修改并争辩", scopeLoss: "LOW", supportRisk: "LOW", evidenceStrength: "HIGH" },
    { id: "C", type: "FURTHER_NARROW", summary: "进一步限缩", scopeLoss: "HIGH", supportRisk: "LOW", evidenceStrength: "HIGH" }
  ], selectedId: "B", selectionRationale: "开发环境固定策略，用于验证端到端链路。" };
  if (name === "amendment_plan") return { ...envelope, claims: [{ claimNo: "1", action: "KEEP", originalText: "开发测试权利要求", proposedText: "开发测试权利要求", changes: [] }], renumbering: [], consistencyUpdates: [] };
  if (name === "statement" || name === "statement_repaired") {
    const metadata = oa?.metadata ?? {};
    return { ...envelope, title: "意见陈述书", applicationNumber: caseData.applicationNo ?? "", inventionTitle: caseData.title ?? "", applicant: caseData.applicant ?? "", oaRound: oa?.oaRound ? `第${oa.oaRound}次` : "", oaDate: metadata.issueDate ?? "", oaSerial: metadata.serialNo ?? "", lead: [{ text: "申请人现就本次审查意见陈述如下。", kind: "body", evidenceIds: [], issueIds: [] }], sections: [{ heading: "一、关于审查意见的答复", paragraphs: [{ text: "本段为开发环境生成的合成工作稿，仅用于验证系统链路。", kind: "body", evidenceIds: [], issueIds: [issue.issueId] }] }], closing: [{ text: "恳请审查员继续审查。", kind: "body", evidenceIds: [], issueIds: [] }], reviewNotes: [] };
  }
  if (name === "qa_report" || name === "qa_report_repaired") return { ...envelope, findings: [], issueCoverage: 1 };
  return undefined;
}
