import type { Statement } from "@oa/schemas";

const FORBIDDEN = ["OPENAI_API_KEY", "AI认为", "Chain-of-Thought", "内部审核", "定稿前核验事项", "system prompt"];
export interface MetadataExpected { applicationNumber: string; oaDate: string; oaSerial: string; oaRound: string; issueIds: string[]; }
export interface DeterministicFinding { severity: "ERROR" | "BLOCKER"; code: string; location: string; message: string; }

const CHINESE_DIGITS: Record<string, string> = {
  "零": "0", "〇": "0", "一": "1", "二": "2", "两": "2", "三": "3", "四": "4",
  "五": "5", "六": "6", "七": "7", "八": "8", "九": "9"
};

/**
 * Normalises a metadata value before it is compared.
 *
 * These fields are written by the model, and a correct value can legitimately
 * come back as "第一次" instead of "第1次" or "2024-05-20" instead of
 * "2024年05月20日". Comparing the raw strings turned those formatting choices
 * into blockers, so the comparison ignores width, spacing, numerals and date
 * punctuation while still catching a genuinely wrong number or date.
 */
export function normalizeMetadataValue(value: string): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, " ")
    .replace(/\s+/g, "")
    // 十二 -> 12, 二十 -> 20, then the remaining numerals on their own.
    .replace(/十([一二三四五六七八九])/g, "1$1")
    .replace(/([一二三四五六七八九])十/g, "$10")
    .replace(/[零〇一二三四五六七八九]/g, (ch) => CHINESE_DIGITS[ch] ?? ch)
    .replace(/十/g, "10")
    .replace(/[年月日,.;:()[\]{}<>、。，；：（）【】《》\-/]/g, "");
}

/**
 * OA round is a display label ("第1次"): the same round legitimately comes back
 * as "1", "第1次" or "第一次", so the comparable value is the round number.
 */
export function roundNumber(value: string): string {
  const normalized = normalizeMetadataValue(value);
  const withUnit = normalized.match(/(\d+)次/);
  if (withUnit) return withUnit[1]!;
  const bare = normalized.match(/^(\d+)$/);
  if (bare) return bare[1]!;
  return normalized;
}

export function deterministicStatementQa(statement: Statement, expected: MetadataExpected): DeterministicFinding[] {
  const findings: DeterministicFinding[] = [];
  const compare = (actual: string | undefined, wanted: string, code: string, location: string, canonical: (value: string) => string = normalizeMetadataValue) => {
    if (!wanted) return;
    if (canonical(actual ?? "") !== canonical(wanted)) {
      findings.push({ severity: "BLOCKER", code, location, message: `${location} 与案件快照不一致。` });
    }
  };
  compare(statement.applicationNumber, expected.applicationNumber, "APPLICATION_NUMBER_MISMATCH", "applicationNumber");
  compare(statement.oaDate, expected.oaDate, "OA_DATE_MISMATCH", "oaDate");
  compare(statement.oaSerial, expected.oaSerial, "OA_SERIAL_MISMATCH", "oaSerial");
  compare(statement.oaRound, expected.oaRound, "OA_ROUND_MISMATCH", "oaRound", roundNumber);
  const body = [...statement.lead, ...statement.sections.flatMap((section) => section.paragraphs), ...statement.closing];
  const covered = new Set(body.flatMap((paragraph) => paragraph.issueIds));
  for (const issueId of expected.issueIds) if (!covered.has(issueId)) findings.push({ severity: "BLOCKER", code: "ISSUE_COVERAGE_FAILED", location: issueId, message: `审查意见 ${issueId} 未映射到答复段落。` });
  const allText = JSON.stringify(statement);
  for (const term of FORBIDDEN) if (allText.toLowerCase().includes(term.toLowerCase())) findings.push({ severity: "BLOCKER", code: "INTERNAL_TEXT_EXPOSED", location: "statement", message: `正文包含内部词语：${term}` });
  return findings;
}
