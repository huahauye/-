# 中国发明专利 OA 答复 Agent — 数据库设计文档

| 项 | 值 |
|---|---|
| 文档版本 | V2（现状版，对应提交 `d3e70f1`） |
| 数据库 | PostgreSQL 16.15（Ubuntu 24.04 发行版包），与本机 Web/Worker 同机 |
| ORM / 定义位置 | Drizzle ORM 0.45.2 — `packages/domain/src/db/schema.ts` |
| DDL 迁移 | `db/migrations/0001_initial.sql` … `0005_model_output_ceiling.sql` |
| 迁移执行器 | `scripts/apply-migrations.mjs`（维护 `schema_migrations`） |
| 规模（生产实测） | 数据库 10 MB；关系数据 2.1 MB；**27 张表 / 50 个索引** |
| 相关文档 | 架构见 [`ARCHITECTURE.md`](ARCHITECTURE.md)；总体设计见 [`TECH_DESIGN.md`](TECH_DESIGN.md) |

---

## 1. 设计概览

### 1.1 命名与类型约定

| 约定 | 规则 | 目的 |
|---|---|---|
| 表名 / 列名 | 小写蛇形（`document_versions`、`parse_status`）；Drizzle 侧用驼峰映射 | SQL 可读性与 ORM 一致性 |
| 主键 | `uuid` + `gen_random_uuid()`（PG 内置，无需扩展；迁移仍声明 `pgcrypto` 兜底） | 不暴露自增规模、可离线生成、便于跨库搬迁 |
| 时间 | 一律 `timestamptz`，默认 `now()`；业务侧写入 `new Date()` 时也带时区 | 服务器为 `Asia/Shanghai`，避免夏令时/跨区歧义 |
| 状态与分类 | 一律用原生 `enum`（15 个），不用字符串 | 约束在库层生效，ORM 类型自动收窄 |
| 半结构化数据 | `jsonb`，默认 `{}` 或 `[]` 而非 NULL | 读取端不必处理 NULL；可建 GIN 索引（当前未建，量级未到） |
| 审计字段 | `created_at` 必有；可变表加 `updated_at` | 追加型表（解析结果、产物、质检、模型调用）刻意不带 `updated_at` |
| 软删除 | `cases.deleted_at`；业务查询统一附加 `deleted_at IS NULL` | 立即断访问，对象清理异步 |
| 版本化 | 内容变更产生**新行**而非覆盖：`document_versions`、`claim_versions`、`skill_versions`、`artifacts.attempt`、`run_steps.step_key` | 可追溯、可重放、幂等 |

### 1.2 四个核心建模模式

1. **载体 / 版本分离**：`documents`（案件内的逻辑材料：角色、D 标签、OA 轮次、是否人工确认）与
   `document_versions`（某次上传的物理版本：文件名、MIME、大小、sha256、对象键、上传与解析状态）。
   替换文件只新增版本，逻辑材料的身份与人工确认结果不变。
2. **不可变 Run 快照**：`runs`（一次生成的意图与版本坐标）+ `run_inputs`（用到的材料版本）+
   `run_model_snapshots`（模型与参数）。历史 Run 永远指向当时的输入与配置。
3. **表即队列**：`worker_jobs` 用 `status + locked_by + locked_at` 实现 `FOR UPDATE SKIP LOCKED` 领取模型，
   部分唯一索引保证同一文档版本不会并发解析。
4. **步骤化执行**：`run_steps` 以 `(run_id, step_key)` 唯一键记录 16 步执行痕迹，
   `artifacts` 以 `(run_id, type, attempt)` 唯一键记录产物，重放同一 Run 不会产生重复行。

### 1.3 实体关系（文字 ER 图）

```text
app_users ──1:1── user_credentials
    │
    ├──1:N── user_sessions
    ├──1:N── cases (owner_user_id)
    │           │
    │           ├──1:N── documents ──1:N── document_versions ──1:1── parsed_documents
    │           │                                   │
    │           │                                   └──1:N── claim_versions
    │           ├──1:N── case_events
    │           ├──0:N── claim_versions (case_id)
    │           └──1:N── runs
    │                       │
    │                       ├──1:N── run_inputs ──N:1── document_versions
    │                       ├──1:N── run_model_snapshots
    │                       ├──1:N── run_steps ──N:0..1── artifacts
    │                       ├──1:N── artifacts
    │                       ├──1:N── qa_findings
    │                       ├──1:N── model_calls
    │                       ├──1:N── worker_jobs
    │                       └──0:N── runs (parent_run_id, 自引用)
    │
skills ──1:N── skill_versions ──1:N── skill_assets
                    │
                    └──1:N── runs (skill_version_id，冻结)
                    └──1:N── eval_runs

model_profiles            独立配置表（不存密钥，只存 secret_ref）
audit_events              独立审计流（actor_user_id 可为空 = 系统动作）
eval_cases ──1:N── eval_case_inputs ──N:1── document_versions
           └──1:N── eval_runs ──1:N── eval_metrics
```

### 1.4 外键与删除行为矩阵

| 子表.列 | 父表 | 删除行为 | 说明 |
|---|---|---|---|
| `documents.case_id` | `cases` | **CASCADE** | 删除案件连带材料 |
| `document_versions.document_id` | `documents` | **CASCADE** | |
| `parsed_documents.document_version_id` | `document_versions` | **CASCADE** | |
| `claim_versions.case_id` | `cases` | **CASCADE** | |
| `claim_versions.source_document_version_id` | `document_versions` | NO ACTION | 来源版本存在时不允许硬删 |
| `case_events.case_id` | `cases` | **CASCADE** | |
| `case_events.document_id` | `documents` | NO ACTION | 事件可指向已删除材料前需先清理 |
| `runs.case_id` | `cases` | NO ACTION | **硬删案件前必须先删 runs**（业务只用软删除，故不触发） |
| `runs.created_by` | `app_users` | NO ACTION | 用户不可删除 |
| `runs.current_oa_document_id` | `documents` | NO ACTION | 快照坐标 |
| `runs.current_claim_version_id` | `claim_versions` | NO ACTION | |
| `runs.skill_version_id` | `skill_versions` | NO ACTION | 冻结引用 |
| `runs.parent_run_id` | `runs` | NO ACTION | 约束 `runs_parent_fk`（迁移 0001 末尾添加） |
| `run_inputs.run_id` | `runs` | **CASCADE** | |
| `run_model_snapshots.run_id` | `runs` | **CASCADE** | |
| `artifacts.run_id` / `document_version_id` | `runs` / `document_versions` | **CASCADE** | 两列均可空（材料级产物可无 Run） |
| `run_steps.run_id` | `runs` | **CASCADE** | |
| `run_steps.output_artifact_id` | `artifacts` | NO ACTION | |
| `worker_jobs.run_id` / `document_version_id` | `runs` / `document_versions` | NO ACTION | 队列行需显式清理 |
| `qa_findings.run_id` | `runs` | **CASCADE** | |
| `model_calls.run_id` | `runs` | **CASCADE** | |
| `user_credentials.user_id` / `user_sessions.user_id` | `app_users` | **CASCADE** | 删用户即撤凭据与会话 |
| `skill_versions.skill_id` / `skill_assets.skill_version_id` | `skills` / `skill_versions` | **CASCADE** | |
| `cases.current_oa_document_id` | `documents` | NO ACTION | 约束 `cases_current_oa_fk` |
| `cases.current_claim_version_id` | `claim_versions` | NO ACTION | 约束 `cases_current_claim_fk` |
| `eval_case_inputs.eval_case_id` / `eval_metrics.eval_run_id` | `eval_cases` / `eval_runs` | **CASCADE** | |

> 注：`cases` 与 `documents`/`claim_versions` 互相引用，因此两个"current"外键在 `0001_initial.sql`
> 的末尾（建表之后）才 `ALTER TABLE ... ADD CONSTRAINT`，用于打破建表顺序依赖。

---

## 2. 枚举字典（15 个）

| 枚举 | 取值 | 使用位置 |
|---|---|---|
| `user_role` | USER, ADMIN | `app_users.role` |
| `document_role` | UNKNOWN, APPLICATION_ORIGINAL, OFFICE_ACTION, RESPONSE_STATEMENT, CLAIMS_CURRENT, CLAIMS_REPLACEMENT, CLAIMS_COMPARISON, PRIOR_ART, OTHER | `documents.role` |
| `case_status` | INCOMPLETE, NEEDS_CONFIRMATION, READY, PROCESSING, COMPLETED, FAILED | `cases.status`（由 Readiness 推导） |
| `upload_status` | INIT, UPLOADING, UPLOADED, FAILED | `document_versions.upload_status` |
| `parse_status` | PENDING, PROCESSING, PARSED, FAILED | `document_versions.parse_status` |
| `run_status` | QUEUED, ANALYZING, DRAFTING, QUALITY_CHECK, GENERATING_DOCUMENT, COMPLETED, FAILED, QA_FAILED, CANCELLED | `runs.status` |
| `step_status` | PENDING, RUNNING, SUCCEEDED, FAILED, SKIPPED | `run_steps.status` |
| `worker_job_status` | QUEUED, RUNNING, SUCCEEDED, FAILED, CANCELLED | `worker_jobs.status` |
| `worker_job_type` | PARSE_DOCUMENT, BUILD_DOCX, RENDER_DOCX | `worker_jobs.job_type` |
| `artifact_type` | PARSED_MANIFEST, CASE_SNAPSHOT, ISSUE_LIST, EVIDENCE_MATRIX, STRATEGY_DECISION, AMENDMENT_PLAN, STATEMENT_JSON, QA_REPORT, STATEMENT_DOCX, RENDERED_PDF, PAGE_RENDER_ARCHIVE, RUN_TRACE | `artifacts.type` |
| `qa_severity` | INFO, WARNING, ERROR, BLOCKER | `qa_findings.severity` |
| `repair_status` | OPEN, AUTO_FIXED, MANUAL_FIXED, WAIVED | `qa_findings.repair_status` |
| `skill_version_status` | DRAFT, STAGING, PUBLISHED, ARCHIVED | `skill_versions.status` |
| `model_purpose` | CLASSIFICATION, EXTRACTION, ANALYSIS, DRAFTING, QA, VISION_QA | `model_profiles.purpose` |
| `eval_run_status` | QUEUED, RUNNING, COMPLETED, FAILED | `eval_runs.status` |

---

## 3. 表字典

> 图例：**NN** = NOT NULL；默认值列省略 `now()` 说明；🔑 = 主键；🔗 = 外键；⛓ = 唯一约束；◐ = 部分唯一索引。

### 3.1 身份与认证

#### `app_users` — 应用用户

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | uuid | 🔑 default gen_random_uuid() | |
| identity_user_id | text | NN ⛓ | 外部身份标识；本地账号为 `local:<email>`（保留字段名以兼容早期 Netlify Identity 数据） |
| email | text | NN | 登录名；注册时小写归一 |
| role | user_role | NN default `USER` | `BOOTSTRAP_FIRST_ADMIN=true` 且库内无 ADMIN 时首个注册者为 ADMIN |
| created_at / updated_at | timestamptz | NN | |

访问路径：登录按 `email` 查（无独立索引，量级小）；注册按 `identity_user_id` 冲突检测（唯一索引）。

#### `user_credentials` — 口令凭据（1:1）

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| user_id | uuid | 🔑 🔗 app_users CASCADE | 与用户一一对应 |
| password_hash | text | NN | `scrypt$<salt hex>$<hash hex>`，N=16384/r=8/p=1/keylen=64 |
| created_at / updated_at | timestamptz | NN | 改密更新 `updated_at` |

#### `user_sessions` — 服务端会话

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| token_hash | text | 🔑 | Cookie 原始值的 SHA-256（**不存原值**） |
| user_id | uuid | NN 🔗 app_users CASCADE | |
| expires_at | timestamptz | NN | 签发时 +30 天 |
| created_at | timestamptz | NN | |
| last_seen_at | timestamptz | NN default now() | 预留活跃度统计 |

索引：`user_sessions_user_idx (user_id)` — 支持"撤销某用户全部会话"（改密/重置口令时使用）。
访问路径：每次请求按 `token_hash` 主键点查 ⋈ `app_users`。

### 3.2 案件与材料

#### `cases` — 案件

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | uuid | 🔑 | |
| owner_user_id | uuid | NN 🔗 app_users | 所有业务查询的第一过滤条件 |
| application_no / title / applicant / internal_case_no | text | 可空 | 案件识别信息；`application_no` 在为空时会由解析元数据回填 |
| status | case_status | NN default `INCOMPLETE` | 由 `recomputeCaseState()` 推导 |
| current_oa_document_id | uuid | 🔗 documents（`cases_current_oa_fk`） | 当前审查意见 |
| current_claim_version_id | uuid | 🔗 claim_versions（`cases_current_claim_fk`） | 当前权利要求版本 |
| current_oa_confirmed / current_claims_confirmed | boolean | NN default false | 人工确认标记；未确认不进入 READY |
| readiness_json | jsonb | 可空 | Readiness 检查项快照（供 UI 直接渲染） |
| created_at / updated_at | timestamptz | NN | |
| deleted_at | timestamptz | 可空 | 软删除；所有查询附加 `IS NULL` |

索引：
- `cases_owner_updated_idx (owner_user_id, updated_at)` — 案件列表按更新时间倒序
- `cases_application_no_idx (application_no)` — 按申请号检索
- `cases_deleted_at_idx (deleted_at)` — 过滤软删除

#### `documents` — 案件内逻辑材料

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | uuid | 🔑 | |
| case_id | uuid | NN 🔗 cases CASCADE | |
| role | document_role | NN default `UNKNOWN` | 人工可纠正 |
| oa_round | integer | CHECK `>= 1` | 仅审查意见/答复有意义 |
| prior_art_label | text | CHECK `~ '^D[1-9][0-9]*$'` | D 标签 |
| role_confidence | numeric(4,3) | 可空 | 启发式或模型置信度（0.000–1.000） |
| user_confirmed | boolean | NN default false | **解析回写保护位**：为 true 时重新解析不覆盖 role/oa_round/prior_art_label |
| display_name | text | 可空 | |
| ai_suggestion | jsonb | 可空 | 启发式建议原文（供审计/对照） |
| created_at / updated_at | timestamptz | NN | |

索引：`documents_case_idx (case_id)`。

#### `document_versions` — 物理文件版本

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | uuid | 🔑 | |
| document_id | uuid | NN 🔗 documents CASCADE | |
| version_no | integer | NN，⛓ `(document_id, version_no)` | 同材料内递增 |
| original_filename / mime_type | text | NN | MIME 以服务端 sniff 为准 |
| size_bytes | bigint | NN | 与 `artifacts.size_bytes` 同为 bigint |
| sha256 | text | NN | 浏览器计算，服务端 `HeadObject` 复核 |
| storage_key | text | NN ⛓ | 对象键，见 §7 |
| upload_status | upload_status | NN default `INIT` | |
| parse_status | parse_status | NN default `PENDING` | |
| parse_error_code | text | 可空 | 解析失败原因（如 `FILE_TYPE_UNSUPPORTED`、`OCR_FAILED:*`） |
| created_at | timestamptz | NN | |

#### `parsed_documents` — 解析结果（1:1 于版本）

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | uuid | 🔑 | |
| document_version_id | uuid | NN ⛓ 🔗 CASCADE | 唯一 → 重复解析为 upsert |
| parser_version | text | NN | 来自 `PARSER_VERSION`，用于溯源 |
| page_count / text_quality | integer / numeric(4,3) | 可空 | 页数、平均置信度 |
| is_scanned | boolean | NN default false | 是否使用过 OCR |
| full_text_key / manifest_key | text | NN | OSS 键（全文、逐页 manifest） |
| extracted_metadata | jsonb | NN default `{}` | `{applicationNo, serialNo, issueDate, citedPriorArts[]}` |
| created_at | timestamptz | NN | |

#### `case_events` — 时间线事件

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | uuid | 🔑 | |
| case_id | uuid | NN 🔗 CASCADE | |
| event_type | text | NN | 如审查意见/答复/申请日等 |
| event_date | date | 可空 | |
| document_id | uuid | 🔗 documents | 来源材料 |
| source | text | NN | 事件来源（解析/人工） |
| confidence | numeric(4,3) | 可空 | |
| data | jsonb | NN default `{}` | |
| created_at | timestamptz | NN | |

> 当前 16 步工作流的 `BUILD_TIMELINE` 直接读取 Run 快照，本表作为结构化留痕保留。

#### `claim_versions` — 权利要求版本

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | uuid | 🔑 | |
| case_id | uuid | NN 🔗 cases CASCADE | |
| source_document_version_id | uuid | 🔗 document_versions | 来源文件版本 |
| ordinal | integer | NN，⛓ `(case_id, ordinal)` | 案件内递增；重复解析同一来源不新增 |
| label | text | 可空 | 通常为来源文件名 |
| effective_date | date | 可空 | |
| claims_json | jsonb | NN | 切分出的权项数组 |
| confidence | numeric(4,3) | NN | |
| is_current | boolean | NN default false | ◐ `claim_versions_one_current_uq`：**每案至多一条 true** |
| evidence_json | jsonb | NN default `[]` | 证据引用 |
| created_at | timestamptz | NN | |

### 3.3 Run、步骤与产物

#### `runs` — 一次生成

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | uuid | 🔑 | |
| case_id / created_by | uuid | NN 🔗 | |
| status | run_status | NN default `QUEUED` | 状态机：QUEUED→ANALYZING→DRAFTING→QUALITY_CHECK→GENERATING_DOCUMENT→终态 |
| current_oa_document_id / current_claim_version_id | uuid | NN 🔗 | 冻结的裁决基准 |
| skill_version_id | uuid | NN 🔗 skill_versions | 冻结的 Skill 版本 |
| parser_version / builder_version | text | NN | 生成该 Run 时使用的解析器/构建器版本 |
| app_git_sha | text | 可空 | 代码版本溯源 |
| parent_run_id | uuid | 🔗 runs（`runs_parent_fk`） | 重跑谱系 |
| started_at / finished_at | timestamptz | 可空 | |
| error_code | text | 可空 | **诊断入口**：`OPEN_QA_FINDINGS`、`METADATA_QA_FAILED`、`WORKFLOW_INTERRUPTED`、`OUTPUT_TRUNCATED` 等 |
| user_message | text | 可空 | 面向用户的 `RUN-XXXX` 编号 |
| created_at | timestamptz | NN | |

索引：`runs_case_created_idx (case_id, created_at)`。

#### `run_inputs` — Run 使用的材料版本

| 列 | 类型 | 约束 |
|---|---|---|
| run_id | uuid | 🔗 runs CASCADE，🔑(联合) |
| document_version_id | uuid | 🔗 document_versions，🔑(联合) |
| input_role | text | NN（当时的角色快照） |

#### `run_model_snapshots` — Run 的模型配置快照

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| run_id | uuid | 🔗 runs CASCADE，🔑(联合) | |
| purpose | text | 🔑(联合) | ANALYSIS / DRAFTING / QA … |
| provider / model / secret_ref | text | NN | **只存密钥引用名，不存密钥** |
| config | jsonb | NN | 含 `maxOutputTokens`、`temperature` 等 |

#### `artifacts` — 产物登记

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | uuid | 🔑 | |
| run_id / document_version_id | uuid | 🔗 CASCADE，可空 | 材料级产物可无 Run |
| type | artifact_type | NN | |
| storage_key | text | NN | |
| mime_type | text | NN | |
| sha256 | text | 可空 | |
| size_bytes | bigint | 可空 | |
| is_user_downloadable | boolean | NN default false | **决定能否经 `/api/artifacts/{id}/download` 下载**：DOCX 与 RENDERED_PDF 为 true，内部 JSON 与页面归档为 false |
| metadata | jsonb | NN default `{}` | |
| attempt | integer | NN default 1 | 与 type 组成幂等键（返修/重试递增） |
| created_at | timestamptz | NN | |

约束：⛓ `artifacts_run_type_attempt_uq (run_id, type, attempt)`；写入用 `ON CONFLICT DO UPDATE`。

#### `run_steps` — 步骤执行痕迹

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | uuid | 🔑 | |
| run_id | uuid | NN 🔗 CASCADE | |
| step_key | text | NN，⛓ `(run_id, step_key)` | 16 个固定键 + 返修第 N 轮 `REPAIR_DRAFT_N` |
| status | step_status | NN default `PENDING` | |
| attempt | integer | NN default 0 | |
| input_hash | text | 可空 | 输入指纹（预留重放判定） |
| output_artifact_id | uuid | 🔗 artifacts | 该步主产物 |
| started_at / finished_at | timestamptz | 可空 | 用于逐步耗时分析 |
| error_code / error_detail_key | text | 可空 | |
| created_at / updated_at | timestamptz | NN | |

#### `worker_jobs` — 工作进程队列

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | uuid | 🔑 | |
| run_id / document_version_id | uuid | 🔗 | 二者按作业类型择一 |
| job_type | worker_job_type | NN | PARSE_DOCUMENT / BUILD_DOCX / RENDER_DOCX |
| status | worker_job_status | NN default `QUEUED` | |
| payload | jsonb | NN default `{}` | 如 `{storageKey, mimeType, sha256}` 或 `{statementKey, outputKey}` |
| result | jsonb | 可空 | 成功结果（如 `{pageCount, findings}`） |
| attempt | integer | NN default 0 | |
| locked_by / locked_at | text / timestamptz | 可空 | 领取者与时间（陈旧判定依据） |
| error_code | text | 可空 | 由 `error_code()` 归一（如 `S3_NOSUCHKEY`） |
| created_at / updated_at | timestamptz | NN | |

索引与约束：
- `worker_jobs_claim_idx (status, created_at)` — 领取扫描
- ◐ `worker_jobs_active_parse_uq (document_version_id, job_type) WHERE status IN ('QUEUED','RUNNING') AND job_type='PARSE_DOCUMENT'` — 同一版本不并发解析

### 3.4 质检、模型调用与审计

#### `qa_findings` — 质检结论（三层共用）

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | uuid | 🔑 | |
| run_id | uuid | NN 🔗 CASCADE | |
| severity | qa_severity | NN | INFO/WARNING/ERROR/BLOCKER |
| code | text | NN | 如 `ISSUE_COVERAGE_FAILED`、`BLANK_PAGE`、`BROKEN_CLAIM_REFERENCE` |
| location | text | 可空 | 段落路径或 `page:N` |
| message | text | NN | 面向人的说明 |
| expected / actual / basis | jsonb | 可空 | 期望值 / 实际值 / 依据 |
| repair_status | repair_status | NN default `OPEN` | 返修成功后批量置 `AUTO_FIXED` |
| created_at | timestamptz | NN | |

终态判定：存在 `repair_status='OPEN'` 且 severity ∈ {ERROR, BLOCKER} → Run 记 `QA_FAILED/OPEN_QA_FINDINGS`（文档仍交付）。

#### `model_calls` — 模型调用记录

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | uuid | 🔑 | |
| run_id | uuid | NN 🔗 CASCADE | |
| step_key / purpose | text | NN | 步骤与用途 |
| provider / model | text | NN | |
| request_schema_version | text | NN | 契约版本 |
| prompt_template_hash / skill_bundle_hash / input_hash | text | NN | 可追溯指纹（不存全文） |
| started_at | timestamptz | NN | |
| finished_at | timestamptz | 可空 | |
| usage | jsonb | 可空 | token 用量 |
| response_artifact_key | text | 可空 | |

> 限制：当前**只记录成功调用**；失败调用由 `runs.error_code` 与日志承载。

#### `audit_events` — 审计事件

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | uuid | 🔑 | |
| actor_user_id | uuid | 🔗 app_users，可空 | 空 = 系统动作 |
| action | text | NN | 如 `CURRENT_OA_OVERRIDE`、`CURRENT_CLAIMS_OVERRIDE`、`DOCUMENT_CLASSIFICATION_OVERRIDE` |
| entity_type / entity_id | text | NN | |
| metadata | jsonb | NN default `{}` | **只记元数据，不记正文** |
| created_at | timestamptz | NN | |

### 3.5 Skill 与模型配置

#### `skills` / `skill_versions` / `skill_assets`

| 表 | 关键列 | 约束 |
|---|---|---|
| `skills` | id 🔑, slug ⛓, name | slug 如 `cn-patent-oa-response` |
| `skill_versions` | id 🔑, skill_id 🔗 CASCADE, version, status, is_active, bundle_key, bundle_sha256, runtime_manifest jsonb, changelog, created_by 🔗, published_at | ⛓ `(skill_id, version)`；◐ `skill_versions_one_active_uq` 保证每 Skill 单一生效版本 |
| `skill_assets` | id 🔑, skill_version_id 🔗 CASCADE, path, asset_type, storage_key, sha256, is_runtime_text, is_executable | ⛓ `(skill_version_id, path)` |

#### `model_profiles` — 模型配置（不含密钥）

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | uuid | 🔑 | |
| name | text | NN ⛓ | 如 `drafting-primary` |
| purpose | model_purpose | NN | 与 Run 快照的 `purpose` 对应 |
| provider / model | text | NN | 如 `deepseek` / `deepseek-flash` |
| secret_ref | text | NN，CHECK ∈ {OPENAI_PRIMARY, OPENAI_SECONDARY, DEEPSEEK, MOCK} | 解析为环境变量名 |
| temperature | numeric(3,2) | 可空 | |
| max_output_tokens | integer | 可空 | 历史列；当前实现读取 `config.maxOutputTokens`（默认 32768） |
| enabled | boolean | NN default true | 停用后新建 Run 会因缺少必需 purpose 被拒 |
| config | jsonb | NN default `{}` | 实际生效的参数包 |
| updated_at | timestamptz | NN | |

### 3.6 Eval 与迁移台账

| 表 | 关键列 | 约束 |
|---|---|---|
| `eval_cases` | id 🔑, name, description, created_by 🔗, created_at | 管理员登记的 Golden Case |
| `eval_case_inputs` | eval_case_id 🔗 CASCADE, document_version_id 🔗, input_role | 🔑(联合) |
| `eval_runs` | id 🔑, eval_case_id 🔗, skill_version_id 🔗, status, run_id 🔗 runs, created_at, finished_at | 一次 Eval 执行 |
| `eval_metrics` | id 🔑, eval_run_id 🔗 CASCADE, metric, value numeric, detail jsonb | ⛓ `(eval_run_id, metric)` |
| `schema_migrations` | filename text 🔑, applied_at timestamptz default now() | 迁移执行器维护，非业务表 |

---

## 4. 索引总览（生产实测 50 个）

按用途分类（合计 50）：

| 用途 | 对应索引 |
|---|---|
| 主键（27） | 每表一个；联合主键三张：`run_inputs(run_id, document_version_id)`、`run_model_snapshots(run_id, purpose)`、`eval_case_inputs(eval_case_id, document_version_id)` |
| **业务不变量**（部分唯一索引，4） | `claim_versions_one_current_uq`（每案至多一条当前权利要求）、`skill_versions_one_active_uq`（每 Skill 至多一个生效版本）、`worker_jobs_active_parse_uq`（同版本不并发解析）、（`cases`/`documents` 的两个 current 外键不建索引） |
| **幂等键**（唯一约束） | `run_steps(run_id, step_key)`、`artifacts(run_id, type, attempt)`、`document_versions(document_id, version_no)`、`document_versions.storage_key`、`parsed_documents.document_version_id`、`claim_versions(case_id, ordinal)`、`skill_versions(skill_id, version)`、`skill_assets(skill_version_id, path)`、`eval_metrics(eval_run_id, metric)`、`app_users.identity_user_id`、`skills.slug`、`model_profiles.name` |
| **访问路径**（普通索引） | `cases_owner_updated_idx(owner_user_id, updated_at)`、`cases_application_no_idx`、`cases_deleted_at_idx`、`documents_case_idx(case_id)`、`runs_case_created_idx(case_id, created_at)`、`worker_jobs_claim_idx(status, created_at)`、`user_sessions_user_idx(user_id)` |

设计取舍：**不为 `jsonb` 建 GIN 索引**。当前数据量（10 MB / 最大表 196 行）下顺序扫描更划算；
若将来需要按 `qa_findings.actual` 或 `extracted_metadata` 内部字段检索，再评估 GIN。

---

## 5. 典型访问路径（按功能）

| 功能 | 主要查询 |
|---|---|
| 案件列表 | `cases WHERE owner_user_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC` → `cases_owner_updated_idx` |
| 案件详情 | `cases` 主键 + `documents ⋈ document_versions ⋈ parsed_documents` by `case_id` |
| Readiness | 上述连接结果 + `claim_versions` by `case_id` + `PRIOR_ART.prior_art_label` 集合求差 |
| 上传完成 | `document_versions` 主键 → `HeadObject` → 更新状态 → `INSERT worker_jobs` |
| 解析领取 | `worker_jobs WHERE status='QUEUED' ORDER BY created_at FOR UPDATE SKIP LOCKED` → `worker_jobs_claim_idx` |
| Run 详情 | `runs` 主键 + `run_steps by run_id` + `artifacts by run_id` + `qa_findings by run_id` |
| 下载校验 | `artifacts ⋈ runs ⋈ cases WHERE artifacts.id=? AND is_user_downloadable AND cases.owner_user_id=?` |
| 管理端 Run 调试 | 同上但不带 owner 过滤（走 `requireAdmin`）+ `model_calls by run_id` |
| 会话校验 | `user_sessions` 主键 + `expires_at > now()` ⋈ `app_users` |

---

## 6. 数据生命周期与保留

```text
上传 init ──▶ documents + document_versions(UPLOADING) ──▶ UPLOADED ──▶ parse_status: PENDING→PARSED/FAILED
                                   │                              │
                                   ▼                              ▼
                        parsed_documents(1:1, upsert)      claim_versions(按来源去重)
                                   │
Run 创建 ──▶ runs + run_inputs + run_model_snapshots（冻结）
   执行   ──▶ run_steps(16 行) + artifacts(JSON 类) + qa_findings + model_calls
   文档   ──▶ artifacts(STATEMENT_DOCX / RENDERED_PDF / PAGE_RENDER_ARCHIVE, attempt 递增)
案件删除 ──▶ cases.deleted_at 置位（立即断访问）→ 后续清理：对象存储 + 级联删除业务行
```

| 数据 | 保留策略现状 |
|---|---|
| 案件与材料 | 软删除；对象与级联清理尚未自动化（见 §9） |
| Run 与产物 | 永久保留（可追溯要求）；`artifacts` 因 `(run_id,type,attempt)` 唯一而不会重复膨胀 |
| 质检与审计 | 永久保留；`qa_findings` 为质控证据，`audit_events` 不含正文 |
| 会话 | 过期行不会自动清理（每次登录新增一行），建议加定时清理 |
| 对象存储 | OSS 生命周期由 Bucket 属主配置（当前未配置） |

---

## 7. 对象存储键规范（数据模型的一部分）

| 内容 | 键 | 说明 |
|---|---|---|
| 原始文件 | `cases/{caseId}/documents/{documentId}/versions/{versionId}/raw/{safeFilename}` | `safeFilename()` 归一化并截断 180 字符 |
| 解析全文 | 同前缀 `parsed/full_text.txt` | UTF-8 文本 |
| 解析清单 | 同前缀 `parsed/manifest.json` | 逐页文本、OCR 标记、置信度、元数据 |
| Run JSON 产物 | `runs/{runId}/{case-snapshot,issue-list,evidence-matrix,strategy,amendment-plan,statement,qa-report,qa-report-repaired}.json` | 文件名固定，`artifacts.attempt` 区分轮次 |
| 交付文档 | `runs/{runId}/statement.docx`、`runs/{runId}/rendered.pdf`、`runs/{runId}/pages.zip` | 命中 `is_user_downloadable` 的可下载 |
| IMM 临时产物 | `runs/{runId}/imm-render/{hex}/`、`…/imm-doc/{hex}/` | 用后即删（`try/finally` 清理） |
| Skill 包与资产 | `skills/{skillId}/{versionId}/bundle.zip`、`…/assets/{path}` | 与 `skill_assets` 一一对应 |

---

## 8. 迁移管理

### 8.1 迁移清单

| 文件 | 内容 | 应用时间（生产） |
|---|---|---|
| `0001_initial.sql` | 15 个枚举 + 24 张表 + 索引 + 末尾补两个 `cases` 外键 | 2026-10-02 02:42 |
| `0002_seed_reference_data.sql` | 基线数据：`cn-patent-oa-response` Skill 1.0.0（PUBLISHED + active）与 5 个模型 Profile（含 `maxOutputTokens: 32768`）；可重复执行 | 2026-10-02 02:42 |
| `0003_local_auth.sql` | 自建登录：`user_credentials`、`user_sessions` + 两个索引 | 2026-10-02 02:42 |
| `0004_model_output_budget.sql` | 为长期输出步骤补 `maxOutputTokens=8192` | 2026-10-02 21:48 |
| `0005_model_output_ceiling.sql` | 修正为 32768（实测 8192 会截断 JSON） | 2026-10-02 22:09 |

### 8.2 执行器行为（`scripts/apply-migrations.mjs`）

1. 连接 `DATABASE_URL`（`NETLIFY_DB_URL` 为兼容回退）；
2. `CREATE TABLE IF NOT EXISTS schema_migrations`；
3. 按文件名排序遍历 `db/migrations/*.sql`；已记录的跳过；
4. 未应用的整文件执行 `sql.unsafe(contents)` 后登记文件名。

配套约定：

- 迁移**必须幂等**（`IF NOT EXISTS` / `ON CONFLICT` / 条件 `UPDATE`），因为执行器不提供事务回滚语义；
- 结构变更走新文件，不改历史文件（历史文件已登记，改了对已有环境无效）；
- 种子数据（`0002`）与结构变更分离，且只触碰基线表（Skill、Model Profile），不动案件数据。

### 8.3 新增迁移规范

```sql
-- 0006_<short_name>.sql
-- 说明为什么改、影响哪些查询、是否可重复执行
ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...;
UPDATE ... WHERE ... IS NULL;   -- 幂等回填
CREATE INDEX IF NOT EXISTS ...;
```

随后：本地 typecheck/单测 → `pnpm --filter @oa/web build` → 上传 → `bash deploy/deploy-ecs.sh`（会自动执行迁移）。

---

## 9. 运维

### 9.1 生产数据快照（2026-10-02）

| 表 | 行数 | 表 | 行数 |
|---|---|---|---|
| run_steps | 196 | parsed_documents | 28 |
| qa_findings | 154 | user_sessions | 16 |
| artifacts | 148 | claim_versions | 14 |
| model_calls | 109 | runs | 14 |
| run_model_snapshots | 70 | cases | 7 |
| run_inputs | 67 | schema_migrations | 5 |
| worker_jobs | 61 | model_profiles | 5 |
| audit_events | 34 | app_users / user_credentials | 3 / 3 |
| document_versions / documents | 28 / 28 | skills / skill_versions | 1 / 1 |

数据库总大小 10 MB，关系数据 2.1 MB。**对象存储为主要体量**（PDF/DOCX/逐页 PNG），数据库增长主因是 `run_steps`、`qa_findings`、`artifacts`（每次 Run 约 12–20 行 + 10 余个产物）。

### 9.2 备份与恢复

```bash
# 逻辑备份（建议每日 + 每次发布前；当前未配置自动化）
pg_dump --no-owner --no-acl "$DATABASE_URL" | gzip > /var/backups/oa_agent_$(date +%F).sql.gz

# 恢复
createdb -O oa oa_agent_restore
psql -d oa_agent_restore -f dump.sql
# 校验：schema_migrations 内容应与代码中的迁移清单一致，缺列则补跑 scripts/apply-migrations.mjs
```

注意：备份**不包含**对象存储内容。恢复后若 OSS 仍在，`storage_key` 依然有效；若 OSS 丢失，文件与产物需要重新上传/重新生成。

### 9.3 日常维护

| 操作 | 命令 / 说明 |
|---|---|
| 查看表与索引体积 | `select relname, pg_size_pretty(pg_total_relation_size(relid)) from pg_stat_user_tables order by 2 desc;` |
| 统计信息 | `ANALYZE;`（大量 Run 后） |
| 空间回收 | `VACUUM (ANALYZE) <table>;`（更新频繁者：`runs`、`worker_jobs`、`cases`） |
| 连接数 | 连接池上限 Web 5 + Worker `max(2, concurrency+1)`；默认 100 连接远未触及 |
| 慢查询 | `pg_stat_statements` 未启用（量级未到）；需要时加 `shared_preload_libraries` |
| 清理过期会话 | `DELETE FROM user_sessions WHERE expires_at < now();`（建议定时任务） |

### 9.4 已知限制与演进建议

| 限制 | 影响 | 建议 |
|---|---|---|
| 无自动备份、单实例 | 数据风险 | 定时 `pg_dump` + OSS 归档；增长后迁 RDS（仅改 `DATABASE_URL`） |
| `runs.case_id` 无级联 | 硬删案件会因存在 Run 而失败 | 若实现硬删除，需按序清理 `runs`（及其级联子表）与 `worker_jobs` |
| `worker_jobs` 无自动清理 | 表随解析次数线性增长 | 定期归档 `SUCCEEDED` 且超过 N 天的作业 |
| `model_calls` 只记成功调用 | 失败调用缺用量与输入指纹 | 失败路径也写一行（`finished_at` 置位、`usage` 为空） |
| `model_profiles.max_output_tokens` 为历史列 | 与 `config.maxOutputTokens` 语义重叠 | 收敛为单一来源，或写入时同步两处 |
| `user_sessions.last_seen_at` 未更新 | 无法据此做活跃度/会话清理 | 在 `requireUser()` 中按节流策略更新 |
| 枚举扩展需 `ALTER TYPE` | 新增产物类型/状态需迁移 | 已按此约定执行（如 `WORKFLOW_DISPATCH_FAILED` 错误码在 TS 侧枚举，非数据库枚举） |
| `jsonb` 无 GIN 索引 | 无法高效按 JSON 内部字段检索 | 出现该查询需求时再建 |
