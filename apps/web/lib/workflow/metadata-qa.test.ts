import { describe, expect, it } from "vitest";
import { deterministicStatementQa, normalizeMetadataValue, roundNumber } from "./metadata-qa";

describe("normalizeMetadataValue", () => {
  it("treats the same value written differently as equal", () => {
    expect(normalizeMetadataValue("第1次")).toBe(normalizeMetadataValue("第一次"));
    expect(normalizeMetadataValue("2024年05月20日")).toBe(normalizeMetadataValue("2024-05-20"));
    expect(normalizeMetadataValue("CN 202310123456.7")).toBe(normalizeMetadataValue("cn2023101234567"));
  });

  it("still separates different values", () => {
    expect(normalizeMetadataValue("第1次")).not.toBe(normalizeMetadataValue("第2次"));
    expect(normalizeMetadataValue("2024年05月20日")).not.toBe(normalizeMetadataValue("2024年05月21日"));
  });
});

describe("roundNumber", () => {
  it("compares the round, not its label", () => {
    expect(roundNumber("第1次")).toBe("1");
    expect(roundNumber("第一次")).toBe("1");
    expect(roundNumber("1")).toBe("1");
    expect(roundNumber("第1次审查意见通知书")).toBe("1");
  });

  it("still separates different rounds", () => {
    expect(roundNumber("第2次")).not.toBe(roundNumber("第1次"));
    expect(roundNumber("2")).not.toBe(roundNumber("第1次"));
  });
});

describe("deterministicStatementQa", () => {
  it("blocks leaked internal review text and uncovered issues", () => {
    const findings = deterministicStatementQa({
      schemaVersion: "1.0", generatedAt: new Date().toISOString(), runId: crypto.randomUUID(), title: "意见陈述书",
      applicationNumber: "CN1", inventionTitle: "T", applicant: "A", oaRound: "第一次", oaDate: "2026-01-01", oaSerial: "1",
      lead: [{ text: "定稿前核验事项", kind: "body", evidenceIds: [], issueIds: [] }], sections: [], closing: [], reviewNotes: []
    }, { applicationNumber: "CN1", oaDate: "2026-01-01", oaSerial: "1", oaRound: "第1次", issueIds: ["I-1"] });
    expect(findings.map((finding) => finding.code)).toEqual(expect.arrayContaining(["ISSUE_COVERAGE_FAILED", "INTERNAL_TEXT_EXPOSED"]));
    expect(findings.map((finding) => finding.code)).not.toContain("OA_ROUND_MISMATCH");
  });
});
