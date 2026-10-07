# 中国发明专利 OA 答复 Agent — 产品技术设计文档（现状版 / V2）

> 本文档以初版《V1 技术设计文档》为基线，描述**代码里实际存在的系统**，而不是计划中的系统。
> 凡与 V1 不一致处，均已按实际实现修正，并在附录 A 给出取舍变更对照。
>
> 生产环境：`http://39.108.58.140`（阿里云 ECS，自托管）
> 代码仓库：`https://github.com/huahauye/-`（私有）
> 文档版本：V2 · 与提交 `22a2449` 对应

---

## 0. V1 → V2 的关键变化

| 领域 | V1 设计 | 现状（本文档所述） | 原因 |
|---|---|---|---|
| Web / API 托管 | Netlify（免费版） | 阿里云 ECS，`next start` + systemd + nginx | 免费额度耗尽导致部署被拒（`Skipped due to account credit usage exceeded`），且私有仓库触发构建白名单限制 |
| 身份认证 | Netlify Identity | 自建邮箱 + 密码（scrypt） + 服务端会话表 | 摆脱托管平台绑定；Identity 端点固定在 `${origin}/.netlify/identity`，非 Netlify 域名下不可用 |
| 数据库 | Netlify DB（Neon） | 同机 PostgreSQL 16 | 同上；且旧库端点被禁用后不可恢复 |
| 工作流驱动 | Async Workloads → Background Function | **常驻 Node 进程内派发** | Async Workloads 的路由函数在 CLI/GH Actions 部署链路中下发失败（404 被 SDK 静默吞掉）；Background Function 出现"返回 202 但函数体从不执行"且无法取日志 |
| 文件上传 | 浏览器 → R2/OSS 预签名直传 | 浏览器 → **同源 API** → 服务端流式写 OSS | Bucket CORS 无法配置（当前 AccessKey 非 Bucket 属主），且预签名跨域地址在受限网络下不可达 |
| 文件下载 | 5 分钟预签名 GET | 同源流式下载 | 同上（实测预签名地址在该网络下 TLS 断流） |
| 格式转换 / OCR | Worker 内置 LibreOffice / PaddleOCR | 阿里云 IMM + 阿里云 OCR | 镜像从 ~1.5 GB 降到数百 MB，免维护重依赖 |
| 运行平台 | Netlify DB + 外置 Worker | 单机 2 vCPU / 1.6 GB（含 swap） | 成本；并因此获得"构建必须限内存"的硬性运维约束 |

---

## 1. 当前实际技术栈

### 1.1 应用层

| 组件 | 技术 | 版本 | 说明 |
|---|---|---|---|
| 运行时 | Node.js | 22.23.3（服务器） / ≥22（engines） | ESM + TypeScript 5.9.3 strict |
| 包管理 | pnpm workspaces | 11.19.0（`packageManager` 固定） | monorepo：`apps/*` + `packages/*` |
| Web 框架 | Next.js App Router | 16.3.5 | Turbopack 构建；`output: "standalone"` |
| UI | React / lucide-react | 19.3.0 / 1.46.0 | 客户端组件 + 服务端组件混用 |
| 数据访问 | Drizzle ORM + postgres.js | 0.45.2 / 3.4.9 | `prepare: false`（适配连接池中间件） |
| Schema 校验 | Zod | 4.6.5 | API 入参 + **LLM 结构化输出**（`z.toJSONSchema` 生成 JSON Schema 提示） |
| 定时/轮询 | 前端 3–4 秒 polling | — | 无 WebSocket（V1 亦如此） |

### 1.2 数据与存储

| 组件 | 技术 | 版本 | 说明 |
|---|---|---|---|
| 数据库 | PostgreSQL | 16.15（Ubuntu 包） | 与本机 Web/Worker 同机，`127.0.0.1:5432` |
| 迁移 | SQL 文件 + 自研执行器 | `db/migrations/0001–0005` | `scripts/apply-migrations.mjs` 记录 `schema_migrations` |
| 对象存储 | 阿里云 OSS（S3 兼容） | `s3.oss-cn-hongkong.aliyuncs.com` | 虚拟主机寻址；仅服务端访问，Bucket 保持私有 |

### 1.3 文档处理（Python Worker）

| 组件 | 技术 | 版本 | 说明 |
|---|---|---|---|
| Web 框架 | FastAPI + uvicorn | 0.116.1 / 0.35.0 | 仅 `127.0.0.1:8080`，只暴露 `/healthz` |
| PDF 处理/栅格化 | PyMuPDF | 1.26.4 | 文本层判定、逐页转 PNG |
| OSS 客户端 | boto3 | 1.40.30 | **必须 `signature_version="s3"`（V2 签名）**，V4 的 aws-chunked 被 OSS 拒绝 |
| 格式转换 | 阿里云 IMM | `alibabacloud_imm20200930` 5.0.1 | `.doc` 取文本、DOCX→PDF、Office→图片 |
| 扫描件识别 | 阿里云 OCR | `alibabacloud_ocr_api20210707` 3.1.3 | 中心化端点 `ocr-api.cn-hangzhou.aliyuncs.com` |
| DOCX 生成 | python-docx | 1.2.0 | 由 `statement.json` 生成可编辑工作稿 |
| 类型探测 | python-magic + libmagic1 | 0.4.27 | 服务端嗅探，不信任声明 MIME |

### 1.4 模型接入

| 组件 | 技术 | 说明 |
|---|---|---|
| Provider | DeepSeek（OpenAI 兼容接口） | `deepseek-flash`，`https://api.deepseek.com` |
| 适配层 | `apps/web/lib/llm/{provider,deepseek,openai}.ts` | 统一 `generateStructured` / `generateText` |
| 密钥解析 | `lib/secrets.ts` | `secret_ref` → 环境变量名（`DEEPSEEK` → `DEEPSEEK_API_KEY`），模型与密钥分离 |
| 输出预算 | `model_profiles.config.maxOutputTokens` | 现为 **32768**（实测依据见 §3.10） |

---

## 2. 系统架构

### 2.1 部署视图（文字架构图）

```text
                        ┌─────────────────────────────────────────────┐
   浏览器 (公网)  ──80──▶│  ECS 39.108.58.140 (Ubuntu 24.04, 2C/1.6G)  │
                        │                                             │
                        │  nginx (systemd)                            │
                        │   ├── /            ──▶ 127.0.0.1:3000       │
                        │   └── /healthz     ──▶ 127.0.0.1:8080       │
                        │                                             │
                        │  oa-web  (systemd)  next start :3000        │
                        │   ├── Next.js SSR/API                       │
                        │   ├── 16 步 Run 工作流（进程内异步执行）     │
                        │   └── 上传/下载流式中转 ──┐                  │
                        │                            │                │
                        │  oa-worker (systemd) uvicorn :8080          │
                        │   └── 轮询 worker_jobs（SKIP LOCKED）        │
                        │                            │                │
                        │  postgresql (systemd) :5432 (仅本机)         │
                        └────────────┬───────────────┼────────────────┘
                                     │               │
                     SQL (5432)      │               │  HTTPS (443)
                                     ▼               ▼
                          ┌────────────────┐  ┌──────────────────────────────┐
                          │ PostgreSQL 16  │  │ 阿里云                        │
                          │ 26 张业务表     │  │  · OSS  (12-3 @ cn-hongkong) │
                          └────────────────┘  │  · IMM  (doc-parse-hk)       │
                                              │  · OCR  (cn-hangzhou 中心端点)│
                                              └──────────────────────────────┘
                                     ▲
                                     │ HTTPS (443)
                          ┌──────────┴─────────┐
                          │ DeepSeek API       │
                          │ api.deepseek.com   │
                          └────────────────────┘
```

要点：

- **只有 80 端口对外**。PostgreSQL(5432)、Web(3000)、Worker(8080) 均只监听回环地址。
- **没有任何跨域信任**：浏览器的所有请求都打到同一 origin，由服务端代理到 OSS。
- **没有服务端到服务端的 Worker 调用**：Web 只往 `worker_jobs` 表插入任务，Worker 轮询取任务（数据库即队列）。
- Web 与 Worker **共享同一个 `.env`**（`/opt/oa-agent/.env`），但只有 Web 需要 `AUTH_*`、Worker 只读 `WORKER_*` / `ALIYUN_*` / `S3_*`。

### 2.2 组件职责

| 组件 | 职责 | 明确不做 |
|---|---|---|
| nginx | TLS 终结（当前为 HTTP）、反向代理、大文件直通（`proxy_request_buffering off`）、`/healthz` 固定转发 | 不做业务鉴权 |
| oa-web | 认证、案件与文档 CRUD、Readiness、Run 编排与执行、LLM 调用、DOCX/PDF 交付 | 不做 PDF 栅格化、不做 Office 转换 |
| oa-worker | 解析（PDF/DOCX/`.doc`）、分类启发式、DOCX 生成、渲染与逐页视觉检查 | 不做业务编排、不直接对外提供接口 |
| PostgreSQL | 唯一事实源：案件、文档版本、权利要求版本、Run/步骤/产物、质检记录、审计 | — |
| OSS | 原始文件与全部产物（parsed 文本、manifest、statement.json、DOCX、PDF、逐页 PNG） | 不公开读 |

### 2.3 关键数据流

**A. 上传（同源代理，不用预签名）**

```text
浏览器 --POST /api/cases/{c}/uploads/init--> oa-web
   oa-web: 建 documents + document_versions(UPLOADING) 行，返回
           uploadUrl = /api/cases/{c}/uploads/{versionId}/content
浏览器 --PUT 该 URL（body=文件）----------> oa-web
   oa-web: 校验归属 → 流式写入 OSS（ContentLength 显式给出，
           Metadata.sha256 记录），浏览器侧不做分片
浏览器 --POST .../uploads/complete--------> oa-web
   oa-web: HeadObject 校验 size + sha256 → UPLOADED
           → INSERT worker_jobs(PARSE_DOCUMENT)
oa-worker: 轮询取任务 → 解析 → 写 parsed_documents + 全文本/ manifest 到 OSS
```

**B. 解析（`PARSE_DOCUMENT`）**

```text
magic 嗅探 → PDF?  ├─ 文本层密度足够 → 直接取文本
                  └─ 文本过少/密度低 → 页面 2x 栅格化 → 阿里云 OCR（取更长的结果）
             DOCX? → python-docx（段落 + 表格 + 页眉页脚）
             .doc ? → IMM 转 txt（long_text, hold_line_feed）
→ 正则抽取元数据（申请号 / 发文序号 / 发文日 / D 标签引用）
→ 文件名+全文启发式分类（role / oa_round / prior_art_label / confidence）
→ 若为申请文件或权利要求类：切分权利要求 → claim_versions
```

**C. Run（16 步，进程内）**

```text
POST /api/cases/{c}/runs
  → 校验 Readiness=READY
  → 冻结快照：runs + run_inputs（材料版本）+ run_model_snapshots（模型 + Secret 引用 + 参数）
  → 立即返回 202 {runId}；工作流在同一 Node 进程内异步继续
     （每步落库 run_steps；产物落 OSS + artifacts）
前端 /runs/{id} 每 3 秒轮询；终态后展示下载按钮 + 质检记录
```

**D. 交付**

```text
浏览器 --GET /api/artifacts/{a}/download--> oa-web（校验：本人案件 + is_user_downloadable）
   → 从 OSS 取字节 → 以附件形式返回（Content-Disposition 带申请号）
```

### 2.4 端口与网络边界

| 位置 | 端口 | 对外 | 说明 |
|---|---|---|---|
| nginx | 80 | ✅ 安全组放行 | 唯一入口 |
| oa-web | 3000 | ❌ 127.0.0.1 | 由 nginx 代理 |
| oa-worker | 8080 | ❌ 127.0.0.1 | 仅 `/healthz`；nginx 暴露固定路径做健康检查 |
| PostgreSQL | 5432 | ❌ 127.0.0.1 | 无外部访问 |
| SSH | 22 | ✅ 安全组放行 | 运维通道 |

---

## 3. 核心功能模块的底层逻辑

### 3.1 认证与会话（`lib/local-auth.ts`、`lib/auth.ts`、`/api/auth/*`）

- **口令**：`scrypt`（N=16384, r=8, p=1, keylen=64, 16 字节随机盐），存储格式 `scrypt$<salt hex>$<hash hex>`；
  校验用 `timingSafeEqual`。无原生依赖，也不需要 bcrypt 编译。
  - 与 Python 侧互通：`scripts/migrate-neon-to-local.py`、`scripts/reset-password.mjs` 生成同格式哈希。
- **会话**：32 字节随机 token，**数据库只存 SHA-256 哈希**（`user_sessions.token_hash` 为主键）；
  有效期 30 天；Cookie `oa_session`，`HttpOnly` + `SameSite=Lax`（`COOKIE_SECURE=true` 时加 `Secure`，当前站点为 HTTP 故为 `false`）。
- **退出即失效**：`POST /api/auth/logout` 删除会话行，不只是清 Cookie。
- **注册即登录**：`POST /api/auth/register` 创建 `app_users`（`identity_user_id = "local:<email>"`）+ `user_credentials`，直接开会话。
  当 `BOOTSTRAP_FIRST_ADMIN=true` 且库内无 ADMIN 时，首个注册者成为 ADMIN。
- **授权链**：`requireUser()` 返回 AppUser（含 role）→ `requireOwnedCase` / `requireOwnedRun` 在 **服务端**校验归属；
  越权一律 404（不泄露"存在但无权"）。
- **CSRF**：写接口经 `readJson()` → `assertSameOrigin(request)`，比较 `Origin` 与 `request.url.origin`（或 `APP_BASE_URL`）；
  同源 PUT 若未带 Origin 亦由 `SameSite=Lax` 兜底。

### 3.2 上传与对象存储（`app/api/cases/[caseId]/uploads/*`、`lib/storage.ts`）

设计取舍：**放弃浏览器直传**，改为服务端流式中转。代价是请求体经过应用（nginx 限 512 MB），收益是：

1. 不需要 Bucket CORS（当前凭据也确实无权限修改 CORS：`GetBucketCors → AccessDenied: The bucket you access does not belong to you`）；
2. 预签名地址无法被重放；
3. 上传与下载都不依赖浏览器能否直连 OSS。

实现要点：

- `PutObjectCommand` **必须显式传 `ContentLength`**：否则 AWS SDK 在长度未知时切到 aws-chunked 编码，而 OSS 拒绝该编码。
- 对象键：`cases/{caseId}/documents/{documentId}/versions/{versionId}/raw/{safeFilename}`；
  解析产物写同前缀下 `parsed/full_text.txt` 与 `parsed/manifest.json`。
- 完整性：`sha256` 在**浏览器侧**计算（`lib/sha256.ts`）后随 init 提交；`complete` 用 `HeadObject` 校验大小与元数据摘要。
  - 该实现对部署协议敏感：`crypto.subtle` 只在安全上下文存在，纯 HTTP 公网 IP 下为 `undefined`，
    因此 `sha256HexOfBytes()` 会在 WebCrypto 不可用时回退到纯 TypeScript 实现（含单测覆盖两个分支）。
- 幂等：`complete` 对已 `UPLOADED` 的版本直接返回，不重复入队。

### 3.3 文档解析（`services/document-worker/app/parsers/parser.py`）

路由与判据：

| 输入 | 处理 | 判据 |
|---|---|---|
| PDF | PyMuPDF 取文本层 | 每页 `len(text) >= 80` 且密度 `len/(w*h/10000) >= 1.2` 视为有文本层 |
| PDF（扫描件） | 页面 2x 栅格 → 阿里云 OCR | 文本层不足时调用 OCR，**仅当 OCR 结果更长时采用**，并记录 `ocr_used=True` 与置信度 |
| DOCX | python-docx | 段落 + 表格（制表符连接）+ 页眉页脚 |
| `.doc`（旧格式） | IMM → `txt`（`long_text`, `hold_line_feed`） | 由 `declared_mime` 或 magic 判定；IMM 读写同一 OSS，临时产物用后即删 |
| 其它 | 拒绝 | `magic.from_file()` 结果必须属于白名单（PDF/DOC/DOCX/ZIP） |

元数据抽取（正则，`extract_metadata`）：

```text
applicationNo : (申请号|Application No.) + 数字串
serialNo      : (通知书编号|发文序号) + 非空白串
issueDate     : (发文日|发文日期|日期) + YYYY[-年]MM[-月]DD[日]
                —— 允许数字与"年月日"之间存在空白（中国官方 PDF 常为 "2026 年 06 月 19 日"），
                   统一归一化为 "YYYY年MM月DD日"
citedPriorArts: (D\d+) …(≤80 字符，可跨行)… (CN|EP|US|WO + 公开号)
```

分类启发式（`_classify`）基于文件名与全文特征给出 `role / oa_round / prior_art_label / confidence`，
结果写 `documents.ai_suggestion`。

> **不变量（踩过坑后加固）**：分类回写采用
> `role = CASE WHEN user_confirmed THEN role ELSE <启发式> END`（oa_round / prior_art_label / role_confidence 同理）。
> 否则"重新解析"会把用户已确认的 D1/D2/D3 覆盖成启发式猜测，进而从对比文件里误抽权利要求。

权利要求切分：`^数字.` 分条；仅当**生效角色**属于 `APPLICATION_ORIGINAL / CLAIMS_CURRENT / CLAIMS_REPLACEMENT`
时插入 `claim_versions`，且以 `WHERE NOT EXISTS(同一 case + 同一 document_version)` 保证重复解析不产生重复版本。

### 3.4 案件重建与 Readiness（`lib/case-state.ts`、`packages/domain/src/readiness.ts`）

`recomputeCaseState(caseId)` 是唯一的案件状态推导入口（分类变更、材料变更、Current 选择、上传完成后均调用），流程：

1. 取全部 documents + 最新版本 + 解析元数据；
2. **自动推断 Current OA**：仅当恰好一份 `OFFICE_ACTION` 且（置信度 ≥ 0.85 或用户已确认）；
3. **自动推断 Current Claims**：已有 `is_current` 优先，否则仅当恰好一份且置信度 ≥ 0.85（此时 `confirmed=false`，要求人工确认）；
4. **对比文件完整性**：以 Current OA 元数据中的 `citedPriorArts[].label` 为需求集合，减去本案 `PRIOR_ART.prior_art_label` 的实际集合，差集即缺失；
5. 调用纯函数 `computeReadiness()` 生成检查项，写回 `cases.readiness_json` 与 `cases.status`。

Readiness 规则表：

| 检查 | 触发 BLOCKER 的条件 | 动作 |
|---|---|---|
| `APPLICATION_PRESENT` | 无 `APPLICATION_ORIGINAL` | 上传 |
| `CURRENT_OA_RESOLVED` | 未确定或未确认 | 确认 |
| `CURRENT_CLAIMS_RESOLVED` | 无当前版本或未确认 | 确认 |
| `PRIOR_ART_COMPLETE` | OA 引用的 D 标签在本案缺失 | 上传（`ALLOW_GENERATE_WITH_MISSING_PRIOR_ART=true` 时降级为 WARNING） |
| `HISTORY_COMPLETE` | `oaRound > 1` 且缺历史 OA 或上一轮答复 | 上传 |

状态归约：存在 BLOCKER 且其中含 `action=CONFIRM` → `NEEDS_CONFIRMATION`；存在其他 BLOCKER → `INCOMPLETE`；否则 `READY`。
`createRun` 只接受 `READY`。

### 3.5 Run 创建与不可变快照（`lib/run-service.ts`）

`createRun(caseId, userId)`：

1. 重新计算 Readiness，非 READY 直接 409；
2. 校验归属、Current OA、Current Claims；
3. 取当前生效的 Skill 版本（`skills.slug = ACTIVE_SKILL_SLUG` 且 `PUBLISHED` + `is_active`）；
4. 校验模型配置：`ANALYSIS`、`DRAFTING`、`QA` 三类 Profile 必须存在且启用；
5. **单事务冻结快照**：`runs`（含 `parser_version` / `builder_version` / `app_git_sha`）、
   `run_inputs`（每份材料的最新已上传版本 + 角色）、`run_model_snapshots`（provider / model / secretRef / 参数）；
6. 返回 `runId` 并**在进程内异步启动工作流**，HTTP 立即 202。

不可变性：Run 一旦创建，其输入版本、Skill 版本、模型配置均固定；后续上传新版本、发布新 Skill、改模型参数都不会影响已存在的 Run。

### 3.6 16 步工作流（`lib/workflow/run-workflow.ts`）

驱动方式：进程内 `step.run(id, fn)` + `step.sleep(id, duration)` 垫片；`run_steps` 每步一行
（`UNIQUE(run_id, step_key)`），失败即 `FAILED` 并把错误冒泡为 Run 的 `FAILED`。

| # | step key | 类型 | 输入 → 输出（产物） | 失败语义 |
|---|---|---|---|---|
| 1 | `SNAPSHOT_CASE` | 确定性 | run/inputs/claim 版本 → `CASE_SNAPSHOT`（含各文件文本，总长受 `LLM_CONTEXT_CHAR_LIMIT` 截断，按角色优先级 OA > Claims > 申请 > 对比 > 历史答复分配预算） | 材料未解析 |
| 2 | `BUILD_TIMELINE` | 确定性 | snapshot → OA/答复时间线 | — |
| 3 | `RESOLVE_CURRENT_OA` | 确定性 | 校验快照内 OA 一致 | `CURRENT_OA_UNRESOLVED` |
| 4 | `RESOLVE_CURRENT_CLAIMS` | 确定性 | 校验当前权利要求版本 | `CURRENT_CLAIMS_UNRESOLVED` |
| 5 | `EXTRACT_OA_ISSUES` | LLM(ANALYSIS) | snapshot → `ISSUE_LIST`（逐项：权项、法条、审查员命题、证据、必回应项） | `MODEL_SCHEMA_INVALID` 等 |
| 6 | `BUILD_EVIDENCE_MATRIX` | LLM(ANALYSIS) | snapshot+issues → `EVIDENCE_MATRIX`（独立权利要求语义完整特征 × {本申请/审查员认定/每份对比文件} 的公开状态 EXPLICIT…DISPUTED） | — |
| 7 | `GENERATE_STRATEGIES` | LLM(ANALYSIS) | issues+matrix → `STRATEGY_DECISION`（不改而争 / 修改并争 / 进一步限缩，各带范围损失、依据风险、证据强度） | — |
| 8 | `BUILD_AMENDMENT_PLAN` | LLM(ANALYSIS) | snapshot+matrix+strategy → `AMENDMENT_PLAN`（逐权项 KEEP/MODIFY/DELETE/ADD、新增文本及其原申请依据、重新编号、连带一致性更新） | schema `superRefine`：新增特征无依据直接判不合法 |
| 9 | `DRAFT_STATEMENT` | LLM(DRAFTING) | 全部上述 → `STATEMENT_JSON` | — |
| 10 | `SEMANTIC_QA` | LLM(QA) | 独立复查答复稿 → `QA_REPORT`（findings: severity/code/location/message/…） | — |
| 11 | `REPAIR_DRAFT`(+`_2`) | LLM(DRAFTING+QA) | 严重 findings + 稿 → 修订稿 + 复查报告 | 最多 `MAX_REPAIR_ATTEMPTS` 轮；每轮独立复查，不看上一轮结论 |
| — | *确定性元数据 QA* | 纯代码 | 见 §3.7 | **硬门禁**：不通过则 `QA_FAILED` 并停止（不生成文档） |
| 12 | `BUILD_DOCX` | Worker | `statement.json` → `statement.docx`（`STATEMENT_DOCX`） | `DOCX_BUILD_FAILED` |
| 13 | `RENDER_DOCX` | Worker | DOCX → PDF + 逐页 PNG 归档 + 质检 findings | `RENDER_QA_FAILED` |
| 14 | `VISUAL_QA` | 占位 | 渲染 findings 已在步骤 13 落库 | — |
| 15 | `FINAL_METADATA_QA` | 占位 | 确定性门禁已在步骤 11 之后执行 | — |
| 16 | `COMPLETE` | 确定性 | 汇总 OPEN 的 ERROR/BLOCKER → 决定 `COMPLETED` 或 `QA_FAILED` | 不抛错（见 §3.7） |

Run 状态机：`QUEUED → ANALYZING → DRAFTING → QUALITY_CHECK → GENERATING_DOCUMENT → (COMPLETED | QA_FAILED | FAILED)`，任意阶段可 `CANCELLED`。

**中断恢复**：工作流运行在常驻进程内，进程重启会打断在跑的 Run；`apps/web/instrumentation.ts` 在启动时调用
`recoverInterruptedRuns()`，把仍处于 `QUEUED/ANALYZING/DRAFTING/QUALITY_CHECK/GENERATING_DOCUMENT` 的 Run
标记为 `FAILED / WORKFLOW_INTERRUPTED`，避免永久悬挂。

### 3.7 质检：三层 + 返修循环

| 层 | 实现 | 判据 | 结果去向 |
|---|---|---|---|
| 语义 QA | LLM(QA)，提示词要求"独立审查：漏答、D 标签、修改依据、无证据效果、权利要求一致性、案件元数据、内部信息泄露" | 模型给出的 severity ∈ INFO/WARNING/ERROR/BLOCKER | `qa_findings`（含 location、message、expected/actual/basis） |
| 确定性元数据 QA | `lib/workflow/metadata-qa.ts`（纯函数） | ① 申请号/申请人/OA 次数/OA 日期/OA 文号与案件快照一致；② 每条审查意见都映射到至少一个答复段落（`issueIds` 覆盖）；③ 正文不含 `OPENAI_API_KEY`/`AI认为`/`Chain-of-Thought`/`内部审核`/`定稿前核验事项`/`system prompt` | 不通过 → `qa_findings` + Run `QA_FAILED / METADATA_QA_FAILED`，**不产出文档** |
| 渲染视觉检查 | `services/document-worker/app/render.py` | 逐页：文本为空 → `ERROR/BLANK_PAGE`；单页文本 > 7000 字 → `WARNING/PAGE_DENSITY_HIGH` | `qa_findings`（location = `page:N`）+ `PAGE_RENDER_ARCHIVE` |

两个关键设计决定（均由真实案件驱动）：

1. **案件识别字段由系统盖章，不采信模型输出**。
   申请书号、申请人、OA 次数/日期/文号在起草与每轮返修后由 `stampIdentification()` 用快照值覆盖，
   缺失时按「案件字段 → 当前 OA 解析元数据 → 申请文件解析元数据」回退；若案件字段为空还会回填 `cases.application_no`。
   这样"编号/日期被改写"这类问题在结构上不可能发生。
   比较时做归一化：忽略大小写、全/半角、空白、标点，中文数字与阿拉伯数字等价（`第1次` ≡ `第一次`），
   OA 次数按数字语义比较，日期按 `YYYYMMDD` 语义比较。
2. **质检不过不等于丢弃成果**。返修循环跑满 `MAX_REPAIR_ATTEMPTS` 后若仍有 OPEN 的 ERROR/BLOCKER，
   步骤 16 不再抛错，而是把 Run 记为 `QA_FAILED / OPEN_QA_FINDINGS`，**文档照常生成、渲染、可下载**，
   页面上以"已生成 + 质检记录"并列展示；仅确定性门禁（`METADATA_QA_FAILED`）保持硬阻断。

### 3.8 DOCX 生成、渲染与交付（`app/docx_builder/builder.py`、`render.py`、`/api/artifacts/[id]/download`）

- 生成：`build_statement(statement, path)`，包含识别信息表（申请号/发明名称/申请人/审查意见次数与日期）与正文分节
  （案件识别、修改说明、[修改依据]、逐项答复、独立权利要求创造性、其他权利要求、结论、落款）。
  生成前后都做内部词过滤（与确定性 QA 同一份 `FORBIDDEN` 清单）。
- 渲染：IMM 把 OSS 中的 DOCX 转 PDF 并写回 OSS（临时前缀 `runs/{id}/imm-render/{hex}/`，用后即删）；
  PyMuPDF 逐页栅格化为 `page-001.png…` 并打包 `PAGE_RENDER_ARCHIVE`。
- 交付：`GET /api/artifacts/{artifactId}/download`（同源流式）允许 `STATEMENT_DOCX` 与 `RENDERED_PDF`，
  校验"本人案件 + `is_user_downloadable`"，文件名形如 `{申请号}_意见陈述书_工作稿.docx`。
  `PAGE_RENDER_ARCHIVE` 属内部质检材料，不对外下载。
- Bug 修复记录：渲染 PDF/快照等产物落 `artifacts` 时曾一律 `is_user_downloadable=false`，
  导致"文档存在但拿不到"；现 PDF 随文档一起可下载。

### 3.9 模型接入、输出预算与失败诊断（`lib/llm/*`、`lib/secrets.ts`）

- 统一请求：`generateStructured({model, instructions, input, schemaName, schema, maxOutputTokens?, temperature?})`；
  系统提示 = 业务指令 + "只输出合法 JSON" + **由 Zod 生成的 JSON Schema**；
  输入用 `<CASE_MATERIALS_UNTRUSTED_DATA>…</CASE_MATERIALS_UNTRUSTED_DATA>` 包裹并前置注入防护指令（材料是数据不是指令）。
- 每次调用落 `model_calls`：schema 版本、提示词哈希、Skill bundle 哈希、输入哈希、token 用量、耗时。
- **失败必须可诊断**（V1 实现把真实原因吞掉，导致线上只看到"结构不符"）：
  - `finish_reason = "length"` → 明确报 `OUTPUT_TRUNCATED`；
  - JSON 解析失败 → 报解析错误；
  - Schema 不匹配 → 逐条列出字段路径与原因（最多 4 条）；
  - 重试时把"上一次为什么被拒"回灌给模型，而不是原样重发；
  - 最终错误信息写入 `runs.error_code`（前 100 字符）并 `console.error` 到 `web.log`。
- **输出上限实测（决定 `maxOutputTokens=32768`）**：

  | 请求 | finish_reason | completion tokens | JSON 合法 |
  |---|---|---|---|
  | 不传 `max_tokens` | stop | 12,752 | ✅ |
  | `max_tokens=8192` | **length** | 8,202 | ❌（截断） |
  | `max_tokens=32768` | stop | 6,899 | ✅ |

  即：**不给上限时该模型能输出 1.2 万 token 以上，而 8192 会在 JSON 中途截断**——
  表现为"模型返回结构不符"，实际是输出被砍。因此取 32768 作为安全天花板（可经 `/admin` 调整）。

### 3.10 Skill 运行时与发布（`packages/skill-runtime`、`/api/admin/skills*`）

- ZIP 导入：`inspectSkillZip()` 做路径穿越/体积/可执行文件检查，产出 `runtime_manifest`；
  资产落 OSS，`skill_assets` 记录 sha256 与 `is_executable`；脚本类文件进入隔离区不参与运行。
- 状态机：`DRAFT → STAGING → PUBLISHED → ARCHIVED`；部分唯一索引保证每个 Skill 只有一条 `is_active=true`。
- Run 冻结 `skill_version_id`；发布是事务性的，不影响在跑的 Run。
- 提示词目前**留在受审代码中**（`run-workflow.ts`），Skill ZIP 提供参考文档与溯源，不参与热执行。

---

## 4. 数据库表结构（Drizzle schema）

Schema 定义：`packages/domain/src/db/schema.ts`；DDL 迁移：`db/migrations/0001`（结构）、`0002`（基线数据）、
`0003`（本地登录）、`0004`/`0005`（模型输出预算）。`scripts/apply-migrations.mjs` 另外维护 `schema_migrations`
（文件名 + 应用时间），故生产库共 **27 张表**。

### 4.1 枚举（12 个）

| 枚举 | 取值 |
|---|---|
| `user_role` | USER, ADMIN |
| `document_role` | UNKNOWN, APPLICATION_ORIGINAL, OFFICE_ACTION, RESPONSE_STATEMENT, CLAIMS_CURRENT, CLAIMS_REPLACEMENT, CLAIMS_COMPARISON, PRIOR_ART, OTHER |
| `case_status` | INCOMPLETE, NEEDS_CONFIRMATION, READY, PROCESSING, COMPLETED, FAILED |
| `upload_status` | INIT, UPLOADING, UPLOADED, FAILED |
| `parse_status` | PENDING, PROCESSING, PARSED, FAILED |
| `run_status` | QUEUED, ANALYZING, DRAFTING, QUALITY_CHECK, GENERATING_DOCUMENT, COMPLETED, FAILED, QA_FAILED, CANCELLED |
| `step_status` | PENDING, RUNNING, SUCCEEDED, FAILED, SKIPPED |
| `worker_job_status` | QUEUED, RUNNING, SUCCEEDED, FAILED, CANCELLED |
| `worker_job_type` | PARSE_DOCUMENT, BUILD_DOCX, RENDER_DOCX |
| `artifact_type` | PARSED_MANIFEST, CASE_SNAPSHOT, ISSUE_LIST, EVIDENCE_MATRIX, STRATEGY_DECISION, AMENDMENT_PLAN, STATEMENT_JSON, QA_REPORT, STATEMENT_DOCX, RENDERED_PDF, PAGE_RENDER_ARCHIVE, RUN_TRACE |
| `qa_severity` | INFO, WARNING, ERROR, BLOCKER |
| `repair_status` | OPEN, AUTO_FIXED, MANUAL_FIXED, WAIVED |
| `skill_version_status` | DRAFT, STAGING, PUBLISHED, ARCHIVED |
| `model_purpose` | CLASSIFICATION, EXTRACTION, ANALYSIS, DRAFTING, QA, VISION_QA |
| `eval_run_status` | QUEUED, RUNNING, COMPLETED, FAILED |

### 4.2 身份与认证

| 表 | 字段 | 约束/索引 |
|---|---|---|
| `app_users` | id uuid PK, identity_user_id text, email text, role user_role, created_at, updated_at | `identity_user_id` UNIQUE；本地账号取 `local:<email>` |
| `user_credentials` | user_id uuid PK→app_users, password_hash text, created_at, updated_at | 1:1；哈希格式 `scrypt$salt$hash` |
| `user_sessions` | token_hash text PK, user_id uuid→app_users, expires_at, created_at, last_seen_at | `user_sessions_user_idx(user_id)`；只存 token 的 SHA-256 |

### 4.3 案件与材料

| 表 | 字段 | 约束/索引 |
|---|---|---|
| `cases` | id uuid PK, owner_user_id→app_users, application_no, title, applicant, internal_case_no, status case_status, current_oa_document_id uuid, current_claim_version_id uuid, current_oa_confirmed bool, current_claims_confirmed bool, readiness_json jsonb, created_at, updated_at, deleted_at | 索引 `(owner_user_id, updated_at)`、`application_no`、`deleted_at`；后加 FK `cases_current_oa_fk` / `cases_current_claim_fk`（迁移末尾添加以打破循环依赖） |
| `documents` | id uuid PK, case_id→cases(CASCADE), role document_role, oa_round int, prior_art_label text, role_confidence numeric(4,3), user_confirmed bool, display_name, ai_suggestion jsonb, created_at, updated_at | 索引 `documents_case_idx(case_id)`；CHECK `prior_art_label ~ '^D[1-9][0-9]*$'`、`oa_round >= 1` |
| `document_versions` | id uuid PK, document_id→documents(CASCADE), version_no int, original_filename, mime_type, size_bytes bigint, sha256, storage_key text, upload_status, parse_status, parse_error_code, created_at | `storage_key` UNIQUE；`(document_id, version_no)` UNIQUE |
| `parsed_documents` | id uuid PK, document_version_id→document_versions(CASCADE), parser_version, page_count, text_quality numeric(4,3), is_scanned bool, full_text_key, manifest_key, extracted_metadata jsonb, created_at | `document_version_id` UNIQUE（重复解析即 upsert） |
| `case_events` | id uuid PK, case_id→cases(CASCADE), event_type, event_date date, document_id→documents, source, confidence numeric(4,3), data jsonb, created_at | 时间线事件（当前工作流读 snapshot 为主，此表为结构化留痕） |
| `claim_versions` | id uuid PK, case_id→cases(CASCADE), source_document_version_id→document_versions, ordinal int, label, effective_date date, claims_json jsonb, confidence numeric(4,3), is_current bool, evidence_json jsonb, created_at | `(case_id, ordinal)` UNIQUE；**部分唯一索引** `claim_versions_one_current_uq`：每案至多一条 `is_current` |

### 4.4 Run、步骤与产物

| 表 | 字段 | 约束/索引 |
|---|---|---|
| `runs` | id uuid PK, case_id→cases, created_by→app_users, status run_status, current_oa_document_id→documents, current_claim_version_id→claim_versions, skill_version_id→skill_versions, parser_version, builder_version, app_git_sha, parent_run_id→runs, started_at, finished_at, error_code, user_message, created_at | 索引 `(case_id, created_at)`；`error_code` 是诊断入口（如 `OPEN_QA_FINDINGS`、`OUTPUT_TRUNCATED`） |
| `run_inputs` | run_id→runs(CASCADE), document_version_id→document_versions, input_role | PK `(run_id, document_version_id)` |
| `run_model_snapshots` | run_id→runs(CASCADE), purpose, provider, model, secret_ref, config jsonb | PK `(run_id, purpose)` |
| `run_steps` | id uuid PK, run_id→runs(CASCADE), step_key, status step_status, attempt int, input_hash, output_artifact_id→artifacts, started_at, finished_at, error_code, error_detail_key, created_at, updated_at | `(run_id, step_key)` UNIQUE → 步骤级幂等 |
| `artifacts` | id uuid PK, run_id→runs(CASCADE), document_version_id→document_versions(CASCADE), type artifact_type, storage_key, mime_type, sha256, size_bytes bigint, is_user_downloadable bool, metadata jsonb, attempt int, created_at | `(run_id, type, attempt)` UNIQUE → 产物幂等；`is_user_downloadable` 决定能否下载 |
| `worker_jobs` | id uuid PK, run_id→runs, document_version_id→document_versions, job_type worker_job_type, status worker_job_status, payload jsonb, result jsonb, attempt int, locked_by, locked_at, error_code, created_at, updated_at | 索引 `(status, created_at)` 供 `FOR UPDATE SKIP LOCKED` 领取；**部分唯一索引** `worker_jobs_active_parse_uq`：同一版本同时只有一个活跃 `PARSE_DOCUMENT` |

### 4.5 质检、模型调用与审计

| 表 | 字段 | 说明 |
|---|---|---|
| `qa_findings` | id uuid PK, run_id→runs(CASCADE), severity qa_severity, code, location, message, expected jsonb, actual jsonb, basis jsonb, repair_status repair_status, created_at | 三层质检统一落此表；`repair_status=OPEN` 且 severity ∈ {ERROR,BLOCKER} 决定 Run 的最终状态 |
| `model_calls` | id uuid PK, run_id→runs(CASCADE), step_key, purpose, provider, model, request_schema_version, prompt_template_hash, skill_bundle_hash, input_hash, started_at, finished_at, usage jsonb, response_artifact_key | **成功调用**才写入（失败由 `error_code` + 日志承载） |
| `audit_events` | id uuid PK, actor_user_id→app_users, action, entity_type, entity_id, metadata jsonb, created_at | 记录 Current OA/Claims 覆盖、分类覆盖、Skill 发布等；不含正文 |

### 4.6 Skill、模型配置与 Eval

| 表 | 字段 | 约束 |
|---|---|---|
| `skills` | id uuid PK, slug text UNIQUE, name, created_at | — |
| `skill_versions` | id uuid PK, skill_id→skills(CASCADE), version, status, is_active bool, bundle_key, bundle_sha256, runtime_manifest jsonb, changelog, created_by→app_users, created_at, published_at | `(skill_id, version)` UNIQUE；部分唯一索引保证每 Skill 至多一个 active |
| `skill_assets` | id uuid PK, skill_version_id→skill_versions(CASCADE), path, asset_type, storage_key, sha256, is_runtime_text bool, is_executable bool, created_at | `(skill_version_id, path)` UNIQUE |
| `model_profiles` | id uuid PK, name text UNIQUE, purpose model_purpose, provider, model, secret_ref, temperature numeric(3,2), max_output_tokens int, enabled bool, config jsonb, updated_at | CHECK `secret_ref IN ('OPENAI_PRIMARY','OPENAI_SECONDARY','DEEPSEEK','MOCK')`；**不存密钥本身** |
| `eval_cases` | id uuid PK, name, description, created_by→app_users, created_at | — |
| `eval_case_inputs` | eval_case_id→eval_cases(CASCADE), document_version_id→document_versions, input_role | PK `(eval_case_id, document_version_id)` |
| `eval_runs` | id uuid PK, eval_case_id→eval_cases, skill_version_id→skill_versions, status eval_run_status, run_id→runs, created_at, finished_at | — |
| `eval_metrics` | id uuid PK, eval_run_id→eval_runs(CASCADE), metric, value numeric, detail jsonb, created_at | `(eval_run_id, metric)` UNIQUE |
| `schema_migrations` | filename text PK, applied_at | 迁移执行器维护，不属于业务 schema |

### 4.7 关键不变量（数据库层强制）

1. 每个案件至多一条 `is_current` 的权利要求版本（部分唯一索引）。
2. 每个 Skill 至多一个 `is_active` 版本（部分唯一索引）。
3. 同一 Run 的同一 `step_key` 只有一行；同一 `(run_id, artifact_type, attempt)` 只有一行 → 重放安全。
4. 同一文档版本同时只有一个活跃解析任务（部分唯一索引）。
5. 载体删除级联：删除案件 → 文档/版本/解析/权利要求/Run/步骤/产物/质检随之清理（`ON DELETE CASCADE`）；`cases.deleted_at` 为软删除，业务层先断访问。
6. 模型密钥永不出现在数据库中，只以 `secret_ref` 环境变量名引用。

---

## 5. 部署与运维

### 5.1 目标环境与容量基线

| 项 | 值 |
|---|---|
| 主机 | 阿里云 ECS `39.108.58.140`，Ubuntu 24.04.2 LTS，2 vCPU / 1.6 GB RAM / 40 GB 系统盘 |
| Swap | 4 GB（`/swapfile`，`vm.swappiness=10`） |
| Node | 22.23.3 + pnpm 11.19.0 |
| PostgreSQL | 16.15（本机） |
| 目录 | 应用 `/opt/oa-agent`；日志 `/var/log/oa-agent/{web,worker}.log`；worker 临时目录 `/var/lib/oa-agent/tmp` |
| 对外端口 | 80（HTTP）。**尚无 HTTPS** |

> **容量红线（真实事故）**：一次**未设上限**的 `next build` 让内核触发全局 OOM
> （`Out of memory: Killed process next-build … anon-rss:1045320kB`），随后 kswapd 抖动使 sshd 十几分钟无法握手，
> 期间只能靠 OOM killer 自行恢复。因此：
> **禁止在该机执行无内存上限的前端构建，禁止并发多个构建**。

### 5.2 首次部署

```bash
# 1) 服务器基线（一次性）：swap、nginx、PostgreSQL、Node 22、pnpm
bash tools/ecs_prep.sh

# 2) 建库建角色
sudo -u postgres psql -c "CREATE ROLE oa LOGIN PASSWORD '<password>'"
sudo -u postgres createdb -O oa oa_agent

# 3) 上传源码（.env 不入包）与生产环境变量
tar -czf oa-agent-src.tgz -C <repo> --exclude=node_modules --exclude=.git --exclude=.next --exclude=.env .
scp oa-agent-src.tgz root@39.108.58.140:/root/
scp .env root@39.108.58.140:/opt/oa-agent/.env    # chmod 600

# 4) 部署（幂等）
ssh root@39.108.58.140 'mkdir -p /opt/oa-agent && tar -xzf /root/oa-agent-src.tgz -C /opt/oa-agent && bash /opt/oa-agent/deploy/deploy-ecs.sh'
```

`deploy/deploy-ecs.sh` 的步骤：校验 `.env` 存在且含 `DATABASE_URL` → `pnpm install --frozen-lockfile`
→ `node scripts/apply-migrations.mjs` → **停掉 web/worker** → 清空 `.next` → 限额构建 → 校验 `BUILD_ID`
→ 建/用 worker venv 装 `requirements.lock` → 安装 systemd 单元与 nginx 站点 → 重启 → 健康检查。
它**绝不写 `.env`**（缺文件直接失败退出）。

构建限额命令（脚本内固定形态）：

```bash
systemd-run --scope --collect -p MemoryMax=1300M -p MemorySwapMax=1200M -p CPUQuota=190% \
  --unit=oa-build env NODE_OPTIONS="--max-old-space-size=1024" ./node_modules/.bin/next build
```

cgroup 限额的意义：**内存失控时只杀构建，不拖垮整机**（已验证：限额过小表现为构建被杀，机器负载保持在 1 上下）。

### 5.3 日常发布

```bash
tar -czf oa-agent-src.tgz -C <repo> --exclude=node_modules --exclude=.git --exclude=.next --exclude=.env .
scp oa-agent-src.tgz root@39.108.58.140:/root/
ssh root@39.108.58.140 'cd /opt/oa-agent && tar -xzf /root/oa-agent-src.tgz && bash deploy/deploy-ecs.sh'
```

只改 Worker（`services/document-worker/**`）时可跳过前端构建：解包后 `systemctl restart oa-worker` 即可。

### 5.4 进程与网络

| 单元 | ExecStart | 关键配置 |
|---|---|---|
| `oa-web.service` | `/usr/bin/pnpm --filter @oa/web exec next start -H 127.0.0.1 -p 3000` | `EnvironmentFile=/opt/oa-agent/.env`；`NODE_ENV=production`；`NODE_OPTIONS=--max-old-space-size=768`；`StartLimitBurst=5 / StartLimitIntervalSec=120`（**崩溃循环必须被 systemd 停下**）；`Restart=always`；日志 append 到 `/var/log/oa-agent/web.log` |
| `oa-worker.service` | `.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8080` | 同上 `EnvironmentFile`；`Restart=always`；日志 append 到 `worker.log` |
| `nginx` | 站点 `deploy/nginx-oa-agent.conf` | `client_max_body_size 512m`；`proxy_request_buffering off`（大文件直通）；`proxy_read/send_timeout 600s`；`/healthz` → worker |

### 5.5 环境变量（`/opt/oa-agent/.env`，模板见 `.env.example`）

```text
APP_BASE_URL=http://39.108.58.140     NODE_ENV=production
AUTH_MODE=local                       COOKIE_SECURE=false
BOOTSTRAP_FIRST_ADMIN=true             MAX_UPLOAD_MB=200
ALLOW_GENERATE_WITH_MISSING_PRIOR_ART=false
ACTIVE_SKILL_SLUG=cn-patent-oa-response
PARSER_VERSION=1.0.0                  BUILDER_VERSION=1.0.0   APP_GIT_SHA=<sha>
DATABASE_URL=postgresql://oa:***@127.0.0.1:5432/oa_agent
S3_ENDPOINT/S3_REGION/S3_BUCKET/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY/S3_FORCE_PATH_STYLE=false
ALIYUN_IMM_PROJECT=doc-parse-hk       ALIYUN_IMM_REGION=cn-hongkong   ALIYUN_OCR_MODE=advanced
LLM_PROVIDER=deepseek                 DEEPSEEK_API_KEY=***   DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-flash         LLM_CONTEXT_CHAR_LIMIT=180000   MAX_REPAIR_ATTEMPTS=2
WORKER_ID=worker-ecs-1                WORKER_POLL_MS=1500   WORKER_STALE_MINUTES=20
WORKER_TEMP_DIR=/var/lib/oa-agent/tmp
```

约束：生产**禁止** `AUTH_MODE=mock` 与 `LLM_PROVIDER=mock`（`serverConfig()` 启动即报错）。

### 5.6 迁移与凭据

```bash
# 迁移（幂等，记录 schema_migrations）
cd /opt/oa-agent && DATABASE_URL=$(grep '^DATABASE_URL=' .env | cut -d= -f2-) node scripts/apply-migrations.mjs

# 重置/创建账号口令（撤销该用户全部会话）
node scripts/reset-password.mjs user@example.com 'new-password'

# 从旧库搬迁数据（可重入）
SOURCE_DATABASE_URL=... TARGET_DATABASE_URL=... ADMIN_EMAIL=... ADMIN_PASSWORD=... \
  services/document-worker/.venv/bin/python scripts/migrate-neon-to-local.py
```

> 注：旧 Netlify/Neon 端点已被禁用（`The endpoint has been disabled`），该脚本保留用于任何 PostgreSQL→PostgreSQL 的搬迁。

### 5.7 备份与恢复

当前为**同机 PostgreSQL**，尚未接入自动备份（见 §9）。最低限度操作：

```bash
# 逻辑备份（建议每日 + 每次发布前）
pg_dump --no-owner --no-acl "$DATABASE_URL" | gzip > /var/backups/oa_agent_$(date +%F).sql.gz
# 对象存储侧：OSS 版本控制/生命周期由 Bucket 属主在控制台配置
```

恢复：建空库 → `psql < dump.sql` → 确认 `schema_migrations` 内容与当前代码一致（缺列则补跑迁移）→ 重启 `oa-web`/`oa-worker`。

### 5.8 故障处置手册

| 现象 | 判据 | 处置 |
|---|---|---|
| SSH 能连 TCP 但拿不到 banner | `ssh_probe` 无 `SSH-2.0`；HTTP 也超时 | 多半是内存/IO 抖动：等待 OOM killer 收敛（本次实测约十几分钟自愈），或从控制台重启；恢复后立刻检查是否有失控构建 |
| 站点 502、日志出现 `ENOENT: .next/prerender-manifest.json` | 构建被中途打断留下半成品 | 重新执行 `deploy/deploy-ecs.sh`（内部会 `rm -rf .next` 后**完整**构建） |
| 站点反复重启 | `systemctl show oa-web -p NRestarts` 持续增长 | 看 `web.log` 尾部；修因后 `systemctl reset-failed oa-web && systemctl restart oa-web` |
| 上传按钮报 `Cannot read properties of undefined (reading 'digest')` | 纯 HTTP 下 `crypto.subtle` 缺失 | 已由 `lib/sha256.ts` 纯 JS 回退修复；若仍出现，让用户 Ctrl+F5 强刷旧 JS |
| 下载无反应/失败 | 浏览器直连 OSS 预签名地址受阻 | 已改为同源流式下载；确认 artifact 的 `is_user_downloadable=true` |
| 解析结果元数据缺失（如发文日为空） | `parsed_documents.extracted_metadata` | 修正解析器后**重新入队解析**：`UPDATE document_versions SET parse_status='PENDING'` + 插入 `PARSE_DOCUMENT` 任务；分类受 `user_confirmed` 保护，不会被覆盖 |
| Run 一直 `QUEUED` | `run_steps` 无行 | 检查 `web.log` 是否有 `structured_output_rejected`；确认 `MAX_REPAIR_ATTEMPTS`/`MODEL_*` 配置；进程重启遗留的 Run 由启动钩子自动收尾 |
| 模型报"结构不符" | `runs.error_code` | 现在会写明具体原因：`OUTPUT_TRUNCATED`（提高 `maxOutputTokens`）、字段路径不匹配（提示词/模型问题）、余额或鉴权错误（控制台充值/换 key） |
| 忘记管理员口令 | — | `node scripts/reset-password.mjs <email> <password>`（同时撤销旧会话） |

### 5.9 验证与测试

| 层次 | 命令/脚本 | 覆盖 |
|---|---|---|
| 类型 | `pnpm typecheck`（web + 各 package） | 全量 TS strict |
| 单测 | `pnpm test` | Readiness、Skill ZIP 隔离、确定性元数据 QA（含归一化分支）、SHA-256（含无 WebCrypto 分支） |
| 构建 | `pnpm --filter @oa/web build` | 生产构建（服务器上必须限额） |
| Worker 语法 | `python -m compileall services/document-worker/app` | 解析/构建/渲染模块 |
| 端到端 | `tools/e2e_full.py` | 注册/登录 → 建案 → 上传 5 份 → 解析 → 分类 → 确认 → 16 步 Run → 下载 DOCX |
| 单案复跑 | `tools/run_case.py <caseId>` | 对既有案件跑 Run 并跟踪 |
| 浏览器 | `tools/ui_check_upload.mjs` / `ui_check_run.mjs` | 真实浏览器验证上传（非安全上下文）与"页面交付文件 + 实际点击下载" |
| 模型容量 | `tools/deepseek_probe.py` / `deepseek_ceiling.py` | 输出上限与截断行为 |

---

## 6. API 清单

### 6.1 用户端

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/auth/register` | 注册即登录；首账号可提升 ADMIN |
| POST | `/api/auth/login` | 邮箱口令登录，写会话 Cookie |
| POST | `/api/auth/logout` | 删除服务端会话并清 Cookie |
| POST | `/api/auth/password` | 修改口令（需当前口令） |
| GET/POST | `/api/cases` | 列表（支持 `?q=`）/ 建案 |
| GET/PATCH/DELETE | `/api/cases/{caseId}` | 详情 / 改名 / 软删除 |
| GET | `/api/cases/{caseId}/documents` | 材料 + 最新版本 + 解析状态 |
| PATCH | `/api/cases/{caseId}/documents/{documentId}/classification` | 人工纠正角色 / OA 轮次 / D 标签 |
| POST | `/api/cases/{caseId}/uploads/init` | 建行并返回同源上传地址 |
| PUT | `/api/cases/{caseId}/uploads/{documentVersionId}/content` | 文件字节流式入 OSS |
| POST | `/api/cases/{caseId}/uploads/complete` | 大小/摘要校验 + 入队解析 |
| GET | `/api/cases/{caseId}/claim-versions` | 权利要求版本列表 |
| POST | `/api/cases/{caseId}/current-claims` | 指定当前权利要求版本 |
| POST | `/api/cases/{caseId}/current-oa` | 指定当前审查意见（须为 `OFFICE_ACTION`） |
| GET | `/api/cases/{caseId}/readiness` | Readiness 检查项 |
| GET/POST | `/api/cases/{caseId}/runs` | 生成记录 / 创建 Run（202） |
| GET | `/api/runs/{runId}` | Run + 步骤 + 产物 + **质检 findings** |
| GET | `/api/runs/{runId}/artifacts` | 产物列表 |
| POST | `/api/runs/{runId}/cancel` | 取消 |
| GET | `/api/artifacts/{artifactId}/download` | 同源下载（DOCX / PDF） |

### 6.2 管理端（`requireAdmin`）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/admin/runs`、`/api/admin/runs/{runId}` | Run 调试视图 |
| GET/POST/PATCH/DELETE | `/api/admin/model-profiles`、`/{id}` | 模型配置（只填 `secret_ref`） |
| GET/POST | `/api/admin/skills` | Skill 列表 / ZIP 导入 |
| POST | `/api/admin/skill-versions/{id}/validate`、`/publish` | 校验与原子发布 |
| GET/POST | `/api/admin/evals`、`/{evalRunId}`、`/eval-cases` | Eval 记录与 Golden Case |

---

## 7. 安全边界

| 面向 | 措施 |
|---|---|
| 文件 | Bucket 私有；服务端 magic 嗅探 + 扩展名白名单；`safeFilename()` 去路径分隔符与控制字符；OSS 键带 UUID；上传大小受 `MAX_UPLOAD_MB` 与 nginx 双重限制 |
| 传输 | 上传/下载均同源经应用，不向浏览器暴露签名地址与存储凭据 |
| 认证 | scrypt 口令哈希；服务端会话（可撤销）；`HttpOnly` + `SameSite=Lax`；登录失败对"账号不存在/口令错"返回同一提示，避免枚举 |
| 授权 | 所有资源在服务端做 owner/admin 校验；越权返回 404 |
| CSRF | 写接口统一 `assertSameOrigin`（Origin 比对）+ SameSite 兜底 |
| 限流 | 进程内滑动窗口：上传 init 30 次/分/用户，创建 Run 5 次/分/用户（单实例部署下有效） |
| 提示注入 | 材料以 `<CASE_MATERIALS_UNTRUSTED_DATA>` 包裹；系统提示显式声明材料是数据不是指令 |
| 交付纪律 | 生成前/后都过滤内部词（`OPENAI_API_KEY`、`AI认为`、`Chain-of-Thought`、`内部审核`、`定稿前核验事项`、`system prompt`）；确定性 QA 再检一次 |
| 密钥 | 只在服务器 `.env`（600）与本机 gitignored 文件；仓库内只有 `.example` 模板；已归档的运维脚本一律从文件读取凭据 |
| 已知待办 | 阿里云 AccessKey 需轮换（曾在会话中明文出现）；站点尚无 HTTPS |

---

## 8. 可观测性与错误码

- **日志**：`/var/log/oa-agent/web.log`（Next 进程，含 `structured_output_rejected model=… schema=… reason=…`）、
  `worker.log`（uvicorn + worker 轮询）、`journalctl -u oa-web`。
- **数据库即可观测面**：`runs.status/error_code`、`run_steps`（逐步耗时与状态）、`model_calls`（用量与哈希）、
  `qa_findings`（质检结论）、`audit_events`（人工覆盖轨迹）、`worker_jobs`（队列深度）。
- **错误码**（`packages/domain/src/types.ts`，写入 `runs.error_code` 或 API 响应）：

```text
AUTH_REQUIRED FORBIDDEN CASE_NOT_FOUND FILE_TOO_LARGE FILE_TYPE_UNSUPPORTED
UPLOAD_VERIFY_FAILED FILE_PARSE_FAILED OCR_FAILED DOC_CONVERSION_FAILED
CASE_IDENTITY_CONFLICT CURRENT_OA_UNRESOLVED CURRENT_CLAIMS_UNRESOLVED
PRIOR_ART_MISSING HISTORY_MISSING SKILL_NOT_PUBLISHED SKILL_INVALID
MODEL_PROFILE_MISSING MODEL_SECRET_MISSING MODEL_TIMEOUT MODEL_SCHEMA_INVALID
ISSUE_COVERAGE_FAILED CLAIM_SUPPORT_FAILED METADATA_QA_FAILED SEMANTIC_QA_FAILED
DOCX_BUILD_FAILED RENDER_QA_FAILED WORKER_UNAVAILABLE WORKFLOW_DISPATCH_FAILED
```

- **面向用户**：`userMessage = RUN-XXXX`，页面并展示可读原因；技术栈细节只出现在管理端与日志。

---

## 9. 已知限制与下一步

**限制**

1. **无 HTTPS**：会话 Cookie 不能置 `Secure`；浏览器标记"不安全"；`crypto.subtle` 不可用（已用回退实现规避）。
2. **单机单实例**：PostgreSQL 与 Web/Worker 同机，无副本；限流为进程内计数；无自动备份。
3. **语义 QA 偏严**：同一稿可能连续给出新的表述类 findings，因此 Run 常见状态是
   `QA_FAILED / OPEN_QA_FINDINGS`（文档照常交付）。当前实测集中在权利要求重新编号的引用一致性。
4. **权利要求重新编号由模型给出**（`amendment_plan.renumbering`），尚未做确定性重写，是上述 findings 的主要来源。
5. `.doc` 旧格式与扫描件的质量取决于 IMM/OCR 与原件质量；低质量结果需人工确认。
6. IMM 单文件上限 200 MB，与 `MAX_UPLOAD_MB` 一致。
7. Eval 数据模型与发布门禁已实现，批量 Golden Case 调度仍是精简版。
8. 失败模型调用未落 `model_calls`（只有成功调用入库），诊断依赖 `error_code` + 日志。

**下一步（按价值排序）**

1. 把质检 findings 回流到「修改方案」步骤，或将权利要求重新编号改为代码确定性实现 → 让常见 Run 一次跑绿。
2. HTTPS（域名 + 证书，或 `sslip.io` + Let's Encrypt）→ 开启 `COOKIE_SECURE`。
3. 数据库自动备份（`pg_dump` 定时 + OSS 归档）与恢复演练。
4. 失败模型调用入库 + 管理端指标（成功率、平均耗时、blocker 率、队列深度）。
5. 上传进度与断点续传（当前为单次 PUT）。
6. 密钥轮换（阿里云 AccessKey）与最小权限 RAM 策略复核。

---

## 附录 A：V1 §55「关键工程取舍」变更对照

| V1 取舍 | 现状 | 是否仍成立 |
|---|---|---|
| 1. Netlify 负责 Web/Auth/DB/Workflow，Worker 外置 | 全部自托管于一台 ECS；Worker 与 Web 同机不同进程 | **已改**（额度与部署链路限制） |
| 2. R2 直传，避免 serverless payload 限制 | 改为同源代理上传（应用不再是 serverless，无 payload 限制；换取免 CORS 与可重放防护） | **已改** |
| 3. Workflow Agent 而非 Autonomous Agent | 16 步固定流程 + 逐步落库 + 可重放 | **仍成立** |
| 4. Skill 热更新，代码不热执行 | ZIP 导入/校验/发布 + 提示词留在受审代码 | **仍成立** |
| 5. Run 快照不可变 | `run_inputs` / `run_model_snapshots` / `skill_version_id` 冻结 | **仍成立** |
| 6. Current Claims 是 P0 | Readiness 硬门禁 | **仍成立** |
| 7. 模型与密钥分离 | `model_profiles.secret_ref` + `lib/secrets.ts` | **仍成立** |
| 8. QA 双层 | 扩为三层（语义 LLM + 确定性元数据 + 渲染视觉） | **增强** |
| 9. 不保存隐藏思维链 | 只存结构化 evidence/decision/rationale | **仍成立** |
| 10. 真实案件不进 Git | `.gitignore` + `fixtures/private/`；运维脚本凭据不入库 | **仍成立** |

## 附录 B：以真实案件为驱动修掉的缺陷清单

| 现象 | 根因 | 修复 |
|---|---|---|
| Background Function 返回 202 但从不执行 | 部署链路下函数体未被调用（异步函数无日志可查） | 改为常驻进程内执行 + 启动时收尾中断 Run |
| Run 报"结构不符"却查不到原因 | Provider 吞掉真实异常 | 命名截断/解析/schema 错误并回灌重试（§3.9） |
| 长文稿生成失败 | 输出上限 8192 导致 JSON 中途截断 | 实测后提高到 32768（migration 0005） |
| 文书"申请号"空白 | 案件未填申请号，流程只读案件字段 | 按 OA → 申请文件回退取值并回填案件（§3.7） |
| 文书缺"发文日" | 官方 PDF 日期带空格，正则过严 | 放宽并归一化日期（§3.3） |
| 重新解析后 D1/D2/D3 变成"本申请"，还多出 4 条假权利要求 | 解析无条件覆盖用户已确认分类 | `user_confirmed` 保护 + 权利要求幂等插入（§3.3） |
| 打开不存在/他人案件整页崩白 | 客户端对错误响应假设数据结构 | 服务端归属校验 + 404 页 + 客户端容错 |
| 登录页出现"退出"按钮 | 根布局不判断会话 | 按会话渲染站点导航 |
| 上传必失败于纯 HTTP | `crypto.subtle` 仅存在于安全上下文 | 纯 TS SHA-256 回退（含单测） |
| Run 全步成功却显示"未完成"、无下载入口 | 页面仅在 `COMPLETED` 提供下载 | 只要产物存在即交付，并列出质检记录（§3.7/§3.8） |
