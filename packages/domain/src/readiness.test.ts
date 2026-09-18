import { describe, expect, it } from "vitest";
import { computeReadiness } from "./readiness";

describe("computeReadiness", () => {
  it("blocks generation when current claims are unresolved", () => {
    const result = computeReadiness({
      documents: [{ id: "app", role: "APPLICATION_ORIGINAL", confirmed: true, confidence: 1, oaRound: null }],
      currentOaDocumentId: "oa",
      currentClaimVersionId: null,
      currentOaConfirmed: true,
      currentClaimsConfirmed: false,
      missingPriorArtLabels: []
    });
    expect(result.status).toBe("NEEDS_CONFIRMATION");
    expect(result.checks.find((check) => check.code === "CURRENT_CLAIMS_RESOLVED")?.status).toBe("BLOCKER");
  });

  it("is ready only when all required evidence is present", () => {
    const result = computeReadiness({
      documents: [{ id: "app", role: "APPLICATION_ORIGINAL", confirmed: true, confidence: 1, oaRound: null }],
      currentOaDocumentId: "oa",
      currentClaimVersionId: "claims",
      currentOaConfirmed: true,
      currentClaimsConfirmed: true,
      missingPriorArtLabels: []
    });
    expect(result.status).toBe("READY");
  });
});
