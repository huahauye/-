import type { CurrentDocumentCandidate, ReadinessResult } from "./types";

export interface ReadinessInput {
  documents: CurrentDocumentCandidate[];
  currentOaDocumentId: string | null;
  currentClaimVersionId: string | null;
  currentOaConfirmed: boolean;
  currentClaimsConfirmed: boolean;
  missingPriorArtLabels?: string[];
  oaRound?: number | null;
  hasPreviousOa?: boolean;
  hasPreviousResponse?: boolean;
  allowMissingPriorArt?: boolean;
}

export function computeReadiness(input: ReadinessInput): ReadinessResult {
  const checks: ReadinessResult["checks"] = [];
  const hasApplication = input.documents.some((document) => document.role === "APPLICATION_ORIGINAL");
  checks.push(hasApplication
    ? { code: "APPLICATION_PRESENT", status: "PASS", message: "已识别本申请文件。" }
    : { code: "APPLICATION_PRESENT", status: "BLOCKER", message: "缺少本申请文件。", action: "UPLOAD" });

  checks.push(input.currentOaDocumentId && input.currentOaConfirmed
    ? { code: "CURRENT_OA_RESOLVED", status: "PASS", message: "当前审查意见已确认。" }
    : { code: "CURRENT_OA_RESOLVED", status: "BLOCKER", message: "当前审查意见尚未可靠确定。", action: "CONFIRM" });

  checks.push(input.currentClaimVersionId && input.currentClaimsConfirmed
    ? { code: "CURRENT_CLAIMS_RESOLVED", status: "PASS", message: "当前权利要求版本已确认。" }
    : { code: "CURRENT_CLAIMS_RESOLVED", status: "BLOCKER", message: "当前权利要求版本无法可靠确定。", action: "CONFIRM" });

  const missing = input.missingPriorArtLabels ?? [];
  checks.push(missing.length === 0
    ? { code: "PRIOR_ART_COMPLETE", status: "PASS", message: "审查意见引用的对比文件齐全。" }
    : {
        code: "PRIOR_ART_COMPLETE",
        status: input.allowMissingPriorArt ? "WARNING" : "BLOCKER",
        message: `缺少对比文件 ${missing.join("、")}。`,
        action: "UPLOAD"
      });

  if ((input.oaRound ?? 1) > 1) {
    checks.push(input.hasPreviousOa && input.hasPreviousResponse
      ? { code: "HISTORY_COMPLETE", status: "PASS", message: "历史审查意见及上一轮答复齐全。" }
      : { code: "HISTORY_COMPLETE", status: "BLOCKER", message: "后续审查意见缺少历史 OA 或上一轮答复。", action: "UPLOAD" });
  }

  const hasBlocker = checks.some((check) => check.status === "BLOCKER");
  const needsConfirmation = checks.some((check) => check.action === "CONFIRM" && check.status === "BLOCKER");
  return { status: hasBlocker ? (needsConfirmation ? "NEEDS_CONFIRMATION" : "INCOMPLETE") : "READY", checks };
}
