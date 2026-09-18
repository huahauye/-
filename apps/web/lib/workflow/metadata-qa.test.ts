import { describe, expect, it } from "vitest";
import { deterministicStatementQa } from "./metadata-qa";

describe("deterministicStatementQa", () => {
  it("blocks leaked internal review text and uncovered issues", () => {
    const findings = deterministicStatementQa({
      schemaVersion: "1.0", generatedAt: new Date().toISOString(), runId: crypto.randomUUID(), title: "意见陈述书",
      applicationNumber: "CN1", inventionTitle: "T", applicant: "A", oaRound: "第一次", oaDate: "2026-01-01", oaSerial: "1",
      lead: [{ text: "定稿前核验事项", kind: "body", evidenceIds: [], issueIds: [] }], sections: [], closing: [], reviewNotes: []
    }, { applicationNumber: "CN1", oaDate: "2026-01-01", oaSerial: "1", oaRound: "第一次", issueIds: ["I-1"] });
    expect(findings.map((finding) => finding.code)).toEqual(expect.arrayContaining(["ISSUE_COVERAGE_FAILED", "INTERNAL_TEXT_EXPOSED"]));
  });
});
