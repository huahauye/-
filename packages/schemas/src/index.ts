import { z } from "zod";

export const schemaEnvelope = z.object({
  schemaVersion: z.literal("1.0"),
  generatedAt: z.string().datetime(),
  runId: z.string().uuid()
});

/**
 * Evidence discipline tags from the Skill's `evidence_protocol.md`.
 * Optional so historical artifacts and stored JSON stay valid.
 */
export const sourceTagSchema = z.enum(["原文已核", "OA主张", "推断", "未检索到", "待核", "用户确认"]);

export const evidenceRefSchema = z.object({
  documentVersionId: z.string().uuid(),
  page: z.number().int().positive().optional(),
  paragraph: z.string().max(100).optional(),
  claim: z.string().max(50).optional(),
  quote: z.string().max(500).optional(),
  /** `原文已核` only when the passage was actually read; `OA主张` when it comes from the notification. */
  sourceTag: sourceTagSchema.optional()
});
export type EvidenceRef = z.infer<typeof evidenceRefSchema>;

export const documentRoleSchema = z.enum(["UNKNOWN", "APPLICATION_ORIGINAL", "OFFICE_ACTION", "RESPONSE_STATEMENT", "CLAIMS_CURRENT", "CLAIMS_REPLACEMENT", "CLAIMS_COMPARISON", "PRIOR_ART", "OTHER"]);
export const documentClassificationSchema = z.object({
  role: documentRoleSchema,
  oaRound: z.number().int().positive().nullable(),
  priorArtLabel: z.string().regex(/^D\d+$/).nullable(),
  applicationNo: z.string().max(100).nullable(),
  inventionTitle: z.string().max(500).nullable(),
  applicant: z.string().max(500).nullable(),
  issueDate: z.string().nullable(),
  serialNo: z.string().max(200).nullable(),
  citedPriorArts: z.array(z.object({ label: z.string().regex(/^D\d+$/), publicationNo: z.string().min(1).max(100) })),
  confidence: z.number().min(0).max(1),
  evidence: z.array(evidenceRefSchema)
});

export const parsedManifestSchema = z.object({
  schemaVersion: z.literal("1.0"),
  documentVersionId: z.string().uuid(),
  pageCount: z.number().int().nonnegative(),
  isScanned: z.boolean(),
  textQuality: z.number().min(0).max(1),
  pages: z.array(z.object({
    page: z.number().int().positive(), text: z.string(), ocrUsed: z.boolean(), confidence: z.number().min(0).max(1)
  })),
  sections: z.array(z.unknown()),
  tables: z.array(z.unknown()),
  metadataCandidates: z.record(z.string(), z.unknown())
});

export const oaIssueSchema = z.object({
  issueId: z.string().min(1),
  claimRefs: z.array(z.string()),
  legalBasis: z.string(),
  issueType: z.enum(["NOVELTY", "INVENTIVE_STEP", "CLARITY", "SUPPORT", "AMENDMENT", "FORMALITY", "OTHER"]),
  examinerPosition: z.string(),
  priorArts: z.array(z.string().regex(/^D\d+$/)),
  reasoning: z.string(),
  previousArgumentResponse: z.string().nullable(),
  /**
   * How well grounded the examiner's position is (Skill `evidence_protocol.md`):
   * an OA statement is not a verified disclosure of the reference.
   */
  factStatus: z.enum(["原文已核", "OA主张", "推断", "未检索到", "待核"]).optional(),
  /** Page / paragraph of the notification this issue is quoted from. */
  oaLocation: z.string().max(200).optional(),
  evidence: z.array(evidenceRefSchema)
});
export const issueListSchema = schemaEnvelope.extend({ issues: z.array(oaIssueSchema) });

const disclosureStatusSchema = z.enum(["EXPLICIT", "IMPLICIT", "PARTIAL", "NOT_DISCLOSED", "DISPUTED", "UNVERIFIED"]);
export const evidenceMatrixSchema = schemaEnvelope.extend({
  issues: z.array(z.object({
    issueId: z.string(),
    claim: z.string(),
    features: z.array(z.object({
      featureId: z.string(),
      text: z.string(),
      applicationEvidence: z.array(evidenceRefSchema),
      examinerEvidence: z.array(evidenceRefSchema),
      priorArtEvidence: z.record(z.string(), z.object({ status: disclosureStatusSchema, evidence: z.array(evidenceRefSchema) }))
    }))
  }))
});

export const strategySchema = schemaEnvelope.extend({
  /**
   * The Skill explicitly forbids padding this list: "不能为凑三个方案而编造修改
   * 特征". A minimum of one lets the model report only the viable paths instead
   * of inventing a third; the three types remain available.
   */
  candidates: z.array(z.object({
    id: z.string(),
    type: z.enum(["ARGUE_WITHOUT_AMENDMENT", "AMEND_AND_ARGUE", "FURTHER_NARROW"]),
    summary: z.string(),
    scopeLoss: z.enum(["NONE", "LOW", "MEDIUM", "HIGH"]),
    supportRisk: z.enum(["LOW", "MEDIUM", "HIGH"]),
    evidenceStrength: z.enum(["LOW", "MEDIUM", "HIGH"]),
    /** Strongest foreseeable examiner comeback against this option (Skill `examiner_counterattack.md`). */
    counterattack: z.string().optional()
  })).min(1),
  selectedId: z.string(),
  selectionRationale: z.string().max(2000)
});

export const amendmentPlanSchema = schemaEnvelope.extend({
  claims: z.array(z.object({
    claimNo: z.string(),
    action: z.enum(["KEEP", "MODIFY", "DELETE", "ADD"]),
    originalText: z.string(),
    proposedText: z.string(),
    changes: z.array(z.object({
      changeId: z.string(),
      addedText: z.string(),
      support: z.array(evidenceRefSchema),
      technicalContribution: z.string()
    }))
  })),
  renumbering: z.array(z.object({ from: z.string(), to: z.string() })),
  consistencyUpdates: z.array(z.string())
}).superRefine((plan, context) => {
  for (const claim of plan.claims) {
    for (const change of claim.changes) {
      if (change.addedText.trim() && change.support.length === 0) {
        context.addIssue({ code: "custom", message: `新增特征 ${change.changeId} 缺少原申请依据`, path: ["claims", claim.claimNo, "changes", change.changeId] });
      }
    }
  }
});

export const statementParagraphSchema = z.object({
  text: z.string().min(1),
  kind: z.enum(["body", "quote", "subheading"]).default("body"),
  evidenceIds: z.array(z.string()).default([]),
  issueIds: z.array(z.string()).default([])
});
export const statementSchema = schemaEnvelope.extend({
  title: z.literal("意见陈述书"),
  applicationNumber: z.string(),
  inventionTitle: z.string(),
  applicant: z.string(),
  oaRound: z.string(),
  oaDate: z.string(),
  oaSerial: z.string(),
  lead: z.array(statementParagraphSchema),
  sections: z.array(z.object({ heading: z.string(), paragraphs: z.array(statementParagraphSchema) })),
  closing: z.array(statementParagraphSchema),
  reviewNotes: z.array(z.never()).max(0)
});
export type Statement = z.infer<typeof statementSchema>;

export const qaFindingSchema = z.object({
  severity: z.enum(["INFO", "WARNING", "ERROR", "BLOCKER"]),
  code: z.string(),
  location: z.string().nullable(),
  message: z.string(),
  expected: z.unknown().nullable(),
  actual: z.unknown().nullable(),
  basis: z.unknown().nullable()
});
export const qaReportSchema = schemaEnvelope.extend({ findings: z.array(qaFindingSchema), issueCoverage: z.number().min(0).max(1) });

export const createCaseSchema = z.object({
  title: z.string().trim().max(500).optional().nullable(),
  applicationNo: z.string().trim().max(100).optional().nullable(),
  internalCaseNo: z.string().trim().max(100).optional().nullable()
});
export const updateCaseSchema = createCaseSchema.partial();
export const uploadInitSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.enum(["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/msword"]),
  size: z.number().int().positive(),
  sha256: z.string().regex(/^[a-fA-F0-9]{64}$/)
});
export const uploadCompleteSchema = z.object({ documentVersionId: z.string().uuid() });
export const classificationUpdateSchema = z.object({
  role: documentRoleSchema,
  oaRound: z.number().int().positive().nullable().optional(),
  priorArtLabel: z.string().regex(/^D[1-9]\d*$/).nullable().optional()
});

export function jsonSchemaFor(name: string): Record<string, unknown> {
  return { type: "object", additionalProperties: false, title: name };
}
