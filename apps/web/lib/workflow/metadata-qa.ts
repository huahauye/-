import type { Statement } from "@oa/schemas";

const FORBIDDEN = ["OPENAI_API_KEY", "AI认为", "Chain-of-Thought", "内部审核", "定稿前核验事项", "system prompt"];
export interface MetadataExpected { applicationNumber: string; oaDate: string; oaSerial: string; oaRound: string; issueIds: string[]; }
export interface DeterministicFinding { severity: "ERROR" | "BLOCKER"; code: string; location: string; message: string; }

export function deterministicStatementQa(statement: Statement, expected: MetadataExpected): DeterministicFinding[] {
  const findings: DeterministicFinding[] = [];
  const compare = (actual: string, wanted: string, code: string, location: string) => {
    if (wanted && actual !== wanted) findings.push({ severity: "BLOCKER", code, location, message: `${location} 与案件快照不一致。` });
  };
  compare(statement.applicationNumber, expected.applicationNumber, "APPLICATION_NUMBER_MISMATCH", "applicationNumber");
  compare(statement.oaDate, expected.oaDate, "OA_DATE_MISMATCH", "oaDate");
  compare(statement.oaSerial, expected.oaSerial, "OA_SERIAL_MISMATCH", "oaSerial");
  compare(statement.oaRound, expected.oaRound, "OA_ROUND_MISMATCH", "oaRound");
  const body = [...statement.lead, ...statement.sections.flatMap((section) => section.paragraphs), ...statement.closing];
  const covered = new Set(body.flatMap((paragraph) => paragraph.issueIds));
  for (const issueId of expected.issueIds) if (!covered.has(issueId)) findings.push({ severity: "BLOCKER", code: "ISSUE_COVERAGE_FAILED", location: issueId, message: `审查意见 ${issueId} 未映射到答复段落。` });
  const allText = JSON.stringify(statement);
  for (const term of FORBIDDEN) if (allText.toLowerCase().includes(term.toLowerCase())) findings.push({ severity: "BLOCKER", code: "INTERNAL_TEXT_EXPOSED", location: "statement", message: `正文包含内部词语：${term}` });
  return findings;
}
