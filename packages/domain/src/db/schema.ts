import {
  bigint, boolean, date, index, integer, jsonb, numeric, pgEnum, pgTable,
  primaryKey, text, timestamp, unique, uniqueIndex, uuid
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const userRole = pgEnum("user_role", ["USER", "ADMIN"]);
export const documentRole = pgEnum("document_role", ["UNKNOWN", "APPLICATION_ORIGINAL", "OFFICE_ACTION", "RESPONSE_STATEMENT", "CLAIMS_CURRENT", "CLAIMS_REPLACEMENT", "CLAIMS_COMPARISON", "PRIOR_ART", "OTHER"]);
export const caseStatus = pgEnum("case_status", ["INCOMPLETE", "NEEDS_CONFIRMATION", "READY", "PROCESSING", "COMPLETED", "FAILED"]);
export const uploadStatus = pgEnum("upload_status", ["INIT", "UPLOADING", "UPLOADED", "FAILED"]);
export const parseStatus = pgEnum("parse_status", ["PENDING", "PROCESSING", "PARSED", "FAILED"]);
export const runStatus = pgEnum("run_status", ["QUEUED", "ANALYZING", "DRAFTING", "QUALITY_CHECK", "GENERATING_DOCUMENT", "COMPLETED", "FAILED", "QA_FAILED", "CANCELLED"]);
export const stepStatus = pgEnum("step_status", ["PENDING", "RUNNING", "SUCCEEDED", "FAILED", "SKIPPED"]);
export const workerJobStatus = pgEnum("worker_job_status", ["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED"]);
export const workerJobType = pgEnum("worker_job_type", ["PARSE_DOCUMENT", "BUILD_DOCX", "RENDER_DOCX"]);
export const artifactType = pgEnum("artifact_type", ["PARSED_MANIFEST", "CASE_SNAPSHOT", "ISSUE_LIST", "EVIDENCE_MATRIX", "STRATEGY_DECISION", "AMENDMENT_PLAN", "STATEMENT_JSON", "QA_REPORT", "STATEMENT_DOCX", "RENDERED_PDF", "PAGE_RENDER_ARCHIVE", "RUN_TRACE"]);
export const qaSeverity = pgEnum("qa_severity", ["INFO", "WARNING", "ERROR", "BLOCKER"]);
export const repairStatus = pgEnum("repair_status", ["OPEN", "AUTO_FIXED", "MANUAL_FIXED", "WAIVED"]);
export const skillVersionStatus = pgEnum("skill_version_status", ["DRAFT", "STAGING", "PUBLISHED", "ARCHIVED"]);
export const modelPurpose = pgEnum("model_purpose", ["CLASSIFICATION", "EXTRACTION", "ANALYSIS", "DRAFTING", "QA", "VISION_QA"]);
export const evalRunStatus = pgEnum("eval_run_status", ["QUEUED", "RUNNING", "COMPLETED", "FAILED"]);

export const appUsers = pgTable("app_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  identityUserId: text("identity_user_id").notNull().unique(),
  email: text("email").notNull(),
  role: userRole("role").notNull().default("USER"),
  createdAt: createdAt(),
  updatedAt: updatedAt()
});

/**
 * Self-hosted credentials. The password hash never leaves this table, and
 * `app_users.identity_user_id` keeps a stable external identifier
 * (`local:<email>`) so the rest of the schema is unchanged.
 */
export const userCredentials = pgTable("user_credentials", {
  userId: uuid("user_id").primaryKey().references(() => appUsers.id, { onDelete: "cascade" }),
  passwordHash: text("password_hash").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt()
});

/** Server-side sessions. Only the hash of the cookie value is stored. */
export const userSessions = pgTable("user_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id").notNull().references(() => appUsers.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [index("user_sessions_user_idx").on(table.userId)]);

export const cases = pgTable("cases", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerUserId: uuid("owner_user_id").notNull().references(() => appUsers.id),
  applicationNo: text("application_no"),
  title: text("title"),
  applicant: text("applicant"),
  internalCaseNo: text("internal_case_no"),
  status: caseStatus("status").notNull().default("INCOMPLETE"),
  currentOaDocumentId: uuid("current_oa_document_id"),
  currentClaimVersionId: uuid("current_claim_version_id"),
  currentOaConfirmed: boolean("current_oa_confirmed").notNull().default(false),
  currentClaimsConfirmed: boolean("current_claims_confirmed").notNull().default(false),
  readinessJson: jsonb("readiness_json"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  deletedAt: timestamp("deleted_at", { withTimezone: true })
}, (table) => [
  index("cases_owner_updated_idx").on(table.ownerUserId, table.updatedAt),
  index("cases_application_no_idx").on(table.applicationNo),
  index("cases_deleted_at_idx").on(table.deletedAt)
]);

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseId: uuid("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }),
  role: documentRole("role").notNull().default("UNKNOWN"),
  oaRound: integer("oa_round"),
  priorArtLabel: text("prior_art_label"),
  roleConfidence: numeric("role_confidence", { precision: 4, scale: 3 }),
  userConfirmed: boolean("user_confirmed").notNull().default(false),
  displayName: text("display_name"),
  aiSuggestion: jsonb("ai_suggestion"),
  createdAt: createdAt(),
  updatedAt: updatedAt()
}, (table) => [index("documents_case_idx").on(table.caseId)]);

export const documentVersions = pgTable("document_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  versionNo: integer("version_no").notNull(),
  originalFilename: text("original_filename").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
  sha256: text("sha256").notNull(),
  storageKey: text("storage_key").notNull().unique(),
  uploadStatus: uploadStatus("upload_status").notNull().default("INIT"),
  parseStatus: parseStatus("parse_status").notNull().default("PENDING"),
  parseErrorCode: text("parse_error_code"),
  createdAt: createdAt()
}, (table) => [unique("document_versions_document_version_uq").on(table.documentId, table.versionNo)]);

export const parsedDocuments = pgTable("parsed_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentVersionId: uuid("document_version_id").notNull().unique().references(() => documentVersions.id, { onDelete: "cascade" }),
  parserVersion: text("parser_version").notNull(),
  pageCount: integer("page_count"),
  textQuality: numeric("text_quality", { precision: 4, scale: 3 }),
  isScanned: boolean("is_scanned").notNull().default(false),
  fullTextKey: text("full_text_key").notNull(),
  manifestKey: text("manifest_key").notNull(),
  extractedMetadata: jsonb("extracted_metadata").notNull().default({}),
  createdAt: createdAt()
});

export const caseEvents = pgTable("case_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseId: uuid("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  eventDate: date("event_date"),
  documentId: uuid("document_id").references(() => documents.id),
  source: text("source").notNull(),
  confidence: numeric("confidence", { precision: 4, scale: 3 }),
  data: jsonb("data").notNull().default({}),
  createdAt: createdAt()
});

export const claimVersions = pgTable("claim_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseId: uuid("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }),
  sourceDocumentVersionId: uuid("source_document_version_id").references(() => documentVersions.id),
  ordinal: integer("ordinal").notNull(),
  label: text("label"),
  effectiveDate: date("effective_date"),
  claimsJson: jsonb("claims_json").notNull(),
  confidence: numeric("confidence", { precision: 4, scale: 3 }).notNull(),
  isCurrent: boolean("is_current").notNull().default(false),
  evidenceJson: jsonb("evidence_json").notNull().default([]),
  createdAt: createdAt()
}, (table) => [
  unique("claim_versions_case_ordinal_uq").on(table.caseId, table.ordinal),
  uniqueIndex("claim_versions_one_current_uq").on(table.caseId).where(sql`${table.isCurrent} = true`)
]);

export const skills = pgTable("skills", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  createdAt: createdAt()
});

export const skillVersions = pgTable("skill_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  skillId: uuid("skill_id").notNull().references(() => skills.id, { onDelete: "cascade" }),
  version: text("version").notNull(),
  status: skillVersionStatus("status").notNull().default("DRAFT"),
  isActive: boolean("is_active").notNull().default(false),
  bundleKey: text("bundle_key").notNull(),
  bundleSha256: text("bundle_sha256").notNull(),
  runtimeManifest: jsonb("runtime_manifest").notNull(),
  changelog: text("changelog"),
  createdBy: uuid("created_by").references(() => appUsers.id),
  createdAt: createdAt(),
  publishedAt: timestamp("published_at", { withTimezone: true })
}, (table) => [
  unique("skill_versions_skill_version_uq").on(table.skillId, table.version),
  uniqueIndex("skill_versions_one_active_uq").on(table.skillId).where(sql`${table.isActive} = true`)
]);

export const skillAssets = pgTable("skill_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  skillVersionId: uuid("skill_version_id").notNull().references(() => skillVersions.id, { onDelete: "cascade" }),
  path: text("path").notNull(),
  assetType: text("asset_type").notNull(),
  storageKey: text("storage_key").notNull(),
  sha256: text("sha256").notNull(),
  isRuntimeText: boolean("is_runtime_text").notNull().default(false),
  isExecutable: boolean("is_executable").notNull().default(false),
  createdAt: createdAt()
}, (table) => [unique("skill_assets_version_path_uq").on(table.skillVersionId, table.path)]);

export const modelProfiles = pgTable("model_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  purpose: modelPurpose("purpose").notNull(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  secretRef: text("secret_ref").notNull(),
  temperature: numeric("temperature", { precision: 3, scale: 2 }),
  maxOutputTokens: integer("max_output_tokens"),
  enabled: boolean("enabled").notNull().default(true),
  config: jsonb("config").notNull().default({}),
  updatedAt: updatedAt()
});

export const runs = pgTable("runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseId: uuid("case_id").notNull().references(() => cases.id),
  createdBy: uuid("created_by").notNull().references(() => appUsers.id),
  status: runStatus("status").notNull().default("QUEUED"),
  currentOaDocumentId: uuid("current_oa_document_id").notNull().references(() => documents.id),
  currentClaimVersionId: uuid("current_claim_version_id").notNull().references(() => claimVersions.id),
  skillVersionId: uuid("skill_version_id").notNull().references(() => skillVersions.id),
  parserVersion: text("parser_version").notNull(),
  builderVersion: text("builder_version").notNull(),
  appGitSha: text("app_git_sha"),
  parentRunId: uuid("parent_run_id"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  errorCode: text("error_code"),
  userMessage: text("user_message"),
  createdAt: createdAt()
}, (table) => [index("runs_case_created_idx").on(table.caseId, table.createdAt)]);

export const runInputs = pgTable("run_inputs", {
  runId: uuid("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
  documentVersionId: uuid("document_version_id").notNull().references(() => documentVersions.id),
  inputRole: text("input_role").notNull()
}, (table) => [primaryKey({ columns: [table.runId, table.documentVersionId] })]);

export const runModelSnapshots = pgTable("run_model_snapshots", {
  runId: uuid("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
  purpose: text("purpose").notNull(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  secretRef: text("secret_ref").notNull(),
  config: jsonb("config").notNull()
}, (table) => [primaryKey({ columns: [table.runId, table.purpose] })]);

export const artifacts = pgTable("artifacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id").references(() => runs.id, { onDelete: "cascade" }),
  documentVersionId: uuid("document_version_id").references(() => documentVersions.id, { onDelete: "cascade" }),
  type: artifactType("type").notNull(),
  storageKey: text("storage_key").notNull(),
  mimeType: text("mime_type").notNull(),
  sha256: text("sha256"),
  sizeBytes: bigint("size_bytes", { mode: "number" }),
  isUserDownloadable: boolean("is_user_downloadable").notNull().default(false),
  metadata: jsonb("metadata").notNull().default({}),
  attempt: integer("attempt").notNull().default(1),
  createdAt: createdAt()
}, (table) => [unique("artifacts_run_type_attempt_uq").on(table.runId, table.type, table.attempt)]);

export const runSteps = pgTable("run_steps", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
  stepKey: text("step_key").notNull(),
  status: stepStatus("status").notNull().default("PENDING"),
  attempt: integer("attempt").notNull().default(0),
  inputHash: text("input_hash"),
  outputArtifactId: uuid("output_artifact_id").references(() => artifacts.id),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  errorCode: text("error_code"),
  errorDetailKey: text("error_detail_key"),
  createdAt: createdAt(),
  updatedAt: updatedAt()
}, (table) => [unique("run_steps_run_key_uq").on(table.runId, table.stepKey)]);

export const workerJobs = pgTable("worker_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id").references(() => runs.id),
  documentVersionId: uuid("document_version_id").references(() => documentVersions.id),
  jobType: workerJobType("job_type").notNull(),
  status: workerJobStatus("status").notNull().default("QUEUED"),
  payload: jsonb("payload").notNull().default({}),
  result: jsonb("result"),
  attempt: integer("attempt").notNull().default(0),
  lockedBy: text("locked_by"),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  errorCode: text("error_code"),
  createdAt: createdAt(),
  updatedAt: updatedAt()
}, (table) => [
  index("worker_jobs_claim_idx").on(table.status, table.createdAt),
  uniqueIndex("worker_jobs_active_parse_uq").on(table.documentVersionId, table.jobType).where(sql`${table.status} IN ('QUEUED','RUNNING') AND ${table.jobType} = 'PARSE_DOCUMENT'`)
]);

export const qaFindings = pgTable("qa_findings", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
  severity: qaSeverity("severity").notNull(),
  code: text("code").notNull(),
  location: text("location"),
  message: text("message").notNull(),
  expected: jsonb("expected"),
  actual: jsonb("actual"),
  basis: jsonb("basis"),
  repairStatus: repairStatus("repair_status").notNull().default("OPEN"),
  createdAt: createdAt()
});

export const modelCalls = pgTable("model_calls", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
  stepKey: text("step_key").notNull(),
  purpose: text("purpose").notNull(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  requestSchemaVersion: text("request_schema_version").notNull(),
  promptTemplateHash: text("prompt_template_hash").notNull(),
  skillBundleHash: text("skill_bundle_hash").notNull(),
  inputHash: text("input_hash").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  usage: jsonb("usage"),
  responseArtifactKey: text("response_artifact_key")
});

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorUserId: uuid("actor_user_id").references(() => appUsers.id),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: createdAt()
});

export const evalCases = pgTable("eval_cases", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  createdBy: uuid("created_by").references(() => appUsers.id),
  createdAt: createdAt()
});

export const evalCaseInputs = pgTable("eval_case_inputs", {
  evalCaseId: uuid("eval_case_id").notNull().references(() => evalCases.id, { onDelete: "cascade" }),
  documentVersionId: uuid("document_version_id").notNull().references(() => documentVersions.id),
  inputRole: text("input_role").notNull()
}, (table) => [primaryKey({ columns: [table.evalCaseId, table.documentVersionId] })]);

export const evalRuns = pgTable("eval_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  evalCaseId: uuid("eval_case_id").notNull().references(() => evalCases.id),
  skillVersionId: uuid("skill_version_id").notNull().references(() => skillVersions.id),
  status: evalRunStatus("status").notNull().default("QUEUED"),
  runId: uuid("run_id").references(() => runs.id),
  createdAt: createdAt(),
  finishedAt: timestamp("finished_at", { withTimezone: true })
});

export const evalMetrics = pgTable("eval_metrics", {
  id: uuid("id").primaryKey().defaultRandom(),
  evalRunId: uuid("eval_run_id").notNull().references(() => evalRuns.id, { onDelete: "cascade" }),
  metric: text("metric").notNull(),
  value: numeric("value").notNull(),
  detail: jsonb("detail").notNull().default({}),
  createdAt: createdAt()
}, (table) => [unique("eval_metrics_run_metric_uq").on(table.evalRunId, table.metric)]);
