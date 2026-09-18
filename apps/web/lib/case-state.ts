import { and, desc, eq, inArray } from "drizzle-orm";
import { claimVersions, cases, documents, documentVersions, parsedDocuments } from "@oa/domain/db";
import { computeReadiness } from "@oa/domain";
import { db } from "./db";
import { serverConfig } from "./config";

type ExtractedMetadata = { citedPriorArts?: Array<{ label?: string; publicationNo?: string }>; issueDate?: string };

export async function recomputeCaseState(caseId: string) {
  const caseRows = await db.select().from(cases).where(eq(cases.id, caseId)).limit(1);
  const patentCase = caseRows[0];
  if (!patentCase) return null;
  const docs = await db.select({
    id: documents.id,
    role: documents.role,
    confirmed: documents.userConfirmed,
    confidence: documents.roleConfidence,
    oaRound: documents.oaRound,
    createdAt: documents.createdAt,
    versionId: documentVersions.id,
    parseStatus: documentVersions.parseStatus,
    metadata: parsedDocuments.extractedMetadata
  }).from(documents)
    .leftJoin(documentVersions, eq(documentVersions.documentId, documents.id))
    .leftJoin(parsedDocuments, eq(parsedDocuments.documentVersionId, documentVersions.id))
    .where(eq(documents.caseId, caseId));

  const oaDocs = docs.filter((document) => document.role === "OFFICE_ACTION" && document.parseStatus === "PARSED")
    .sort((a, b) => (b.oaRound ?? 0) - (a.oaRound ?? 0) || b.createdAt.getTime() - a.createdAt.getTime());
  let currentOaDocumentId = patentCase.currentOaDocumentId;
  let currentOaConfirmed = patentCase.currentOaConfirmed;
  if (!currentOaDocumentId && oaDocs.length === 1 && (Number(oaDocs[0]?.confidence ?? 0) >= 0.85 || oaDocs[0]?.confirmed)) {
    currentOaDocumentId = oaDocs[0]?.id ?? null;
    currentOaConfirmed = Boolean(oaDocs[0]?.confirmed);
  }

  const claims = await db.select().from(claimVersions).where(eq(claimVersions.caseId, caseId)).orderBy(desc(claimVersions.ordinal));
  let currentClaimVersionId = patentCase.currentClaimVersionId ?? claims.find((claim) => claim.isCurrent)?.id ?? null;
  let currentClaimsConfirmed = patentCase.currentClaimsConfirmed;
  if (!currentClaimVersionId && claims.length === 1 && Number(claims[0]?.confidence ?? 0) >= 0.85) {
    currentClaimVersionId = claims[0]?.id ?? null;
    currentClaimsConfirmed = false;
  }

  const currentOa = docs.find((document) => document.id === currentOaDocumentId);
  const metadata = (currentOa?.metadata ?? {}) as ExtractedMetadata;
  const requiredLabels = new Set((metadata.citedPriorArts ?? []).map((item) => item.label).filter((label): label is string => Boolean(label)));
  const presentLabels = new Set<string>();
  const priorArtDocs = await db.select({ label: documents.priorArtLabel }).from(documents).where(and(eq(documents.caseId, caseId), eq(documents.role, "PRIOR_ART")));
  for (const doc of priorArtDocs) if (doc.label) presentLabels.add(doc.label);
  const missingPriorArtLabels = [...requiredLabels].filter((label) => !presentLabels.has(label));
  const oaRound = currentOa?.oaRound ?? null;
  const hasPreviousOa = docs.some((document) => document.role === "OFFICE_ACTION" && (document.oaRound ?? 0) < (oaRound ?? 1));
  const hasPreviousResponse = docs.some((document) => document.role === "RESPONSE_STATEMENT" && (document.oaRound ?? 0) < (oaRound ?? 1));
  const readiness = computeReadiness({
    documents: docs.map((document) => ({ id: document.id, role: document.role, confirmed: document.confirmed, confidence: document.confidence ? Number(document.confidence) : null, oaRound: document.oaRound })),
    currentOaDocumentId,
    currentClaimVersionId,
    currentOaConfirmed,
    currentClaimsConfirmed,
    missingPriorArtLabels,
    oaRound,
    hasPreviousOa,
    hasPreviousResponse,
    allowMissingPriorArt: serverConfig().ALLOW_GENERATE_WITH_MISSING_PRIOR_ART === "true"
  });
  await db.update(cases).set({
    currentOaDocumentId,
    currentClaimVersionId,
    currentOaConfirmed,
    currentClaimsConfirmed,
    readinessJson: readiness,
    status: readiness.status,
    updatedAt: new Date()
  }).where(eq(cases.id, caseId));
  return readiness;
}

export async function latestVersionsForCase(caseId: string) {
  const rows = await db.select({ version: documentVersions, document: documents }).from(documents)
    .innerJoin(documentVersions, eq(documentVersions.documentId, documents.id))
    .where(and(eq(documents.caseId, caseId), inArray(documentVersions.uploadStatus, ["UPLOADED"])));
  const latest = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const current = latest.get(row.document.id);
    if (!current || row.version.versionNo > current.version.versionNo) latest.set(row.document.id, row);
  }
  return [...latest.values()];
}
