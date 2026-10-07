# 中国发明专利 OA 答复 Agent — 技术架构文档

| 项 | 值 |
|---|---|
| 文档版本 | V2（现状版，对应提交 `d3e70f1`） |
| 生产环境 | `http://39.108.58.140`（阿里云 ECS，自托管） |
| 代码仓库 | `https://github.com/huahauye/-`（私有） |
| 相关文档 | 数据库设计见 [`DATABASE_DESIGN.md`](DATABASE_DESIGN.md)；总体设计（含业务逻辑与运维手册）见 [`TECH_DESIGN.md`](TECH_DESIGN.md)；运维脚本见 [`../tools/README.md`](../tools/README.md) |

本文聚焦**架构层面的决策、模块边界与运行时行为**；业务规则细节与运维操作手册见 `TECH_DESIGN.md`。

---

## 1. 架构总览

### 1.1 架构风格

```text
自托管三进程单体（Web） + 外置工作进程（Worker） + 单一 PostgreSQL 事实源
通信方式：全部经数据库；不存在 Web→Worker 的直接调用
部署形态：单机（2 vCPU / 1.6 GB + 4 GB swap），仅 80 端口对外
```

四条基本设计原则：

| 原则 | 含义 | 具体体现 |
|---|---|---|
| **单一事实源** | 状态只存在于 PostgreSQL；进程不持有业务状态 | 队列即表（`worker_jobs`），Run 进度即表（`run_steps`），前端靠轮询 |
| **同源边界** | 浏览器只与本站点通信 | 上传/下载经服务端中转，无预签名跨域地址、无 Bucket CORS 依赖 |
| **不可变快照** | Run 一旦创建，其输入/技能/模型固定 | `run_inputs`、`run_model_snapshots`、`skill_version_id` 冻结 |
| **失败可诊断** | 任何失败必须落到可读的字段 | `runs.error_code`、`run_steps.error_code`、`worker_jobs.error_code`、`qa_findings` |

### 1.2 部署视图

```text
                          公网
                           │  80/tcp
                           ▼
        ┌──────────────────────────────────────────────────────────────┐
        │  ECS 39.108.58.140 — Ubuntu 24.04.2 LTS, 2 vCPU / 1.6 GB      │
        │                                                              │
        │  ┌──────────────┐   proxy_pass    ┌─────────────────────────┐ │
        │  │ nginx        │ ───────────────▶│ oa-web  (Next.js)       │ │
        │  │ :80 对外      │  127.0.0.1:3000 │  systemd, node 22        │ │
        │  │              │                 │  · SSR + API Routes      │ │
        │  │ /healthz ────┼──┐              │  · 16 步 Run（进程内）    │ │
        │  └──────────────┘  │              │  · OSS 中转（上/下行）    │ │
        │                    │              └───────────┬─────────────┘ │
        │                    │  127.0.0.1:8080          │ SQL           │
        │                    ▼                          ▼               │
        │  ┌──────────────────────────┐    ┌─────────────────────────┐  │
        │  │ oa-worker (FastAPI)      │    │ PostgreSQL 16  :5432    │  │
        │  │ systemd, uvicorn         │───▶│ 27 张表 / 50 索引        │  │
        │  │ · 轮询 worker_jobs        │SQL │ 仅回环监听               │  │
        │  │ · 解析 / DOCX / 渲染      │    └─────────────────────────┘  │
        │  └────────────┬─────────────┘                                 │
        └───────────────┼───────────────────────────────────────────────┘
                        │ HTTPS 443
                        ▼
        ┌───────────────────────────────────────────────────────────────┐
        │ 阿里云：OSS(12-3@cn-hongkong) · IMM(doc-parse-hk) · OCR(杭州) │
        │ DeepSeek API（api.deepseek.com，由 oa-web 调用）               │
        └───────────────────────────────────────────────────────────────┘
```

### 1.3 网络与信任边界

| 边界 | 规则 |
|---|---|
| 公网 → ECS | 仅 80（安全组放行）；22 用于运维 |
| nginx → 应用 | 仅回环；`client_max_body_size 512m`；`proxy_request_buffering off`（上传直通） |
| Web → PostgreSQL | 回环，口令认证 |
| Worker → PostgreSQL | 回环，同一账号 |
| Web → OSS/IMM/OCR/DeepSeek | 出网 HTTPS，使用服务器 `.env` 中的凭据 |
| 浏览器 → OSS | **不存在**（设计上禁止；上传下载都经应用） |
| Worker → 浏览器 | **不存在**（Worker 无公网端口） |

信任假设：浏览器不可信；案件材料不可信（提示注入防护）；`/opt/oa-agent/.env` 是唯一凭据来源（600 权限）。

---

## 2. 分层与依赖方向

```text
apps/web/app/**           页面与 API 路由（Next.js App Router）
        │  只能向下
        ▼
apps/web/lib/**           业务能力层（认证、案件状态、Run 编排、存储、LLM 适配、工作流）
        │
        ▼
packages/domain           领域类型 + Readiness 纯函数 + Drizzle schema
packages/schemas          Zod 契约（API 入参 + LLM 结构化输出）
packages/skill-runtime    Skill ZIP 安全校验（被 apps/web 调用）

services/document-worker 独立进程，不 import 任何 TS 代码；
                          与 Web 的唯一契约是 PostgreSQL 表 + OSS 对象键约定
```

依赖纪律：

- `packages/*` 不依赖 `apps/*`（可单测、可复用）。
- `lib/workflow/**` 只依赖 `lib/*` 与 `packages/*`，不依赖 React。
- 页面组件（`components/*`）只通过 `/api/**` 访问数据，不直接触碰 `db`。
- Worker 与 Web **共享数据库 schema**，但各自只操作自己负责的表：
  Web 写 `runs/run_steps/artifacts(JSON 类)/qa_findings`，Worker 写 `parsed_documents/claim_versions/artifacts(DOCX/PDF/PNG)/worker_jobs.status`。

---

## 3. 运行时组件

### 3.1 `oa-web` — Next.js 应用进程

| 项 | 说明 |
|---|---|
| 启动方式 | `/usr/bin/pnpm --filter @oa/web exec next start -H 127.0.0.1 -p 3000` |
| systemd 关键项 | `EnvironmentFile=/opt/oa-agent/.env`、`NODE_OPTIONS=--max-old-space-size=768`、`StartLimitBurst=5/IntervalSec=120`、`Restart=always` |
| 页面分组 | `app/(auth)/*` 登录注册改密；`app/(app)/*` 案件/运行（`layout.tsx` 内 `requireUser()` 未登录即重定向）；`app/admin/*` 管理端 |
| API 路由 | 20 个用户端 + 9 个管理端（清单见 `TECH_DESIGN.md` §6） |
| 长任务承载 | **16 步 Run 在本进程内以 Promise 形式异步执行**，不在请求生命周期内 |
| 启动钩子 | `instrumentation.ts` → `recoverInterruptedRuns()`：把上次进程遗留的非终态 Run 标记 `FAILED/WORKFLOW_INTERRUPTED` |
| 健康信号 | nginx 的 `/healthz` 转发到 Worker；Web 自身无健康端点（由 nginx 502 与日志体现） |

**为什么把工作流放在 Web 进程内**（相对 V1 的 Async Workloads / Background Function）：

1. 无平台执行时限（不再需要 13 分钟自我截止）；
2. 无"部署形态决定调用形状"的不确定性（历史上出现过"返回 202 但函数体从不执行且无日志"）；
3. 睡眠与轮询就是 `setTimeout`，不需要外部调度器；
4. 代价：进程重启会打断在跑的 Run —— 由启动钩子兜底，用户可重新发起。

### 3.2 `oa-worker` — 文档工作进程

| 项 | 说明 |
|---|---|
| 启动方式 | `.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8080` |
| 组成 | FastAPI 应用（仅 `/healthz`）+ 一个守护线程执行轮询循环 |
| 信号处理 | 在 `main.py` 的 startup 中注册 `SIGTERM/SIGINT`（**必须在主线程**，线程内注册会抛 `signal only works in main thread`） |
| 循环（`worker.py`） | 每轮：① 距上次超过 60 s 则 `recover_stale_jobs()`；② `claim_job()`；③ 无任务则按 `WORKER_POLL_MS`（默认 1500 ms）等待；④ 有任务则 `process_job()` 后 `complete_job()`，异常则 `fail_job()` 并写规范化错误码 |
| 错误码归一 | boto3 的长英文异常 → `S3_<CODE>`；其余取冒号前片段，整体截断 100 字符 |
| 并发度 | `WORKER_CONCURRENCY` 默认 1；任务领取用 `FOR UPDATE SKIP LOCKED`，多实例安全 |
| 幂等 | 同一文档版本同时只允许一个活跃 `PARSE_DOCUMENT`（部分唯一索引）；解析结果 upsert；权利要求按来源版本去重插入 |

### 3.3 PostgreSQL — 兼作队列

- 队列表 `worker_jobs`：`status` + 索引 `(status, created_at)`；Worker 用 `SKIP LOCKED` 领取并写 `locked_by/locked_at`。
- 陈旧恢复：`locked_at` 超过 `WORKER_STALE_MINUTES`（默认 20）的 `RUNNING` 任务被回收为可重试。
- 无外部消息中间件：部署只需 PostgreSQL 一个依赖项。

### 3.4 nginx 与 systemd

| 组件 | 职责 |
|---|---|
| systemd | 进程守护、开机自启、环境注入、日志落盘（`append:` 到 `/var/log/oa-agent/*.log`）、崩溃重启上限 |
| nginx | 反向代理、`/healthz` 固定转发到 Worker、大体积请求直通（不缓冲到磁盘）、超时放宽到 600 s（长 Run 的前端轮询与大文件传输） |

---

## 4. 模块地图

### 4.1 `apps/web/lib` — 业务能力层

| 模块 | 职责 | 关键约束 |
|---|---|---|
| `config.ts` | 用 Zod 校验并缓存环境变量；导出 `serverConfig` / `databaseUrl` / `storageConfig` | 生产环境启动即拒绝 `AUTH_MODE=mock` 或 `LLM_PROVIDER=mock` |
| `db.ts` | postgres.js 客户端 + Drizzle 实例（非生产环境挂到 `globalThis` 避免热重载重复建连） | `prepare: false` |
| `errors.ts` | `AppError`（带错误码与 HTTP 状态）、`errorResponse`（统一 JSON 形状 + requestId）、`readJson`、`assertSameOrigin`（CSRF） | 未知异常一律 500 且不泄露堆栈 |
| `auth.ts` | `requireUser` / `requireAdmin` / `hasSession` / `shouldBootstrapAdmin` / `loadAppUser` | 会话查库校验有效期；mock 模式仅供本地与测试 |
| `local-auth.ts` | scrypt 口令哈希与校验、会话 token 生成与哈希、Cookie 读写与清除 | 数据库只存 token 的 SHA-256 |
| `ownership.ts` / `run-ownership.ts` | 案件/运行的归属校验（含软删除过滤） | 越权返回 404，不区分"不存在"与"无权限" |
| `rate-limit.ts` | 进程内滑动窗口（`Map<key, timestamps[]>`） | 单实例有效；超限抛 429 |
| `case-state.ts` | `recomputeCaseState`（唯一的案件状态推导入口）、`latestVersionsForCase`（每文档最新已上传版本） | 自动推断 Current OA/Claims 的置信度门槛为 0.85 |
| `run-service.ts` | `createRun`（事务冻结快照）、`startRunWorkflow`（进程内启动）、`recoverInterruptedRuns`（启动收尾） | 单进程内 `activeRuns` 集合防止重复启动 |
| `storage.ts` | OSS 客户端（S3 兼容）、对象键构造、流式上传、字节/文本读取、预签名下载（遗留能力） | 必须 `signature_version="s3"`；`requestChecksumCalculation="WHEN_REQUIRED"`；上传显式 `ContentLength` |
| `sha256.ts` | 浏览器侧文件摘要：优先 WebCrypto，缺失时回退纯 TS 实现 | 兼容纯 HTTP 部署（非安全上下文） |
| `secrets.ts` | `secret_ref` → 环境变量名解析 | 密钥永不入库 |
| `llm/provider.ts` | Provider 接口（`generateStructured` / `generateText` / `supportsVision`） | 结构化调用必须携带 Zod schema |
| `llm/deepseek.ts` | DeepSeek 适配：JSON 模式、schema 提示、失败分类（截断/解析/schema）、重试时回灌失败原因 | 输出上限由 Profile 的 `maxOutputTokens` 控制 |
| `llm/openai.ts` / `llm/mock.ts` | OpenAI 适配（备选）与测试用 Mock | Mock 禁止在生产启用 |
| `llm/index.ts` | `createProvider(provider, secretRef)` 工厂 | 未知 provider 直接报错 |
| `workflow/run-workflow.ts` | 16 步固定工作流实现 | 每步一行 `run_steps`；识别字段盖章；返修循环 |
| `workflow/metadata-qa.ts` | 确定性元数据 QA（纯函数）+ 归一化比较 | 硬门禁；含中文数字/日期/大小写归一 |
| `instrumentation.ts` | Next 启动钩子 | 构建阶段（`NEXT_PHASE`）跳过 |

### 4.2 `packages/*`

| 包 | 内容 | 说明 |
|---|---|---|
| `@oa/domain` | `types.ts`（枚举、错误码、Readiness 类型）、`readiness.ts`（纯函数 `computeReadiness`）、`db/schema.ts`（Drizzle 全量 schema） | 无 I/O，可直接单测（`readiness.test.ts`） |
| `@oa/schemas` | API 入参 Schema + LLM 结构化输出 Schema（`issueList`、`evidenceMatrix`、`strategy`、`amendmentPlan`、`statement`、`qaReport` 等） | `amendmentPlanSchema` 用 `superRefine` 强制"新增特征必须有原申请依据" |
| `@oa/skill-runtime` | `inspectSkillZip()`：路径穿越/文件数（≤200）/体积（≤20 MB）/可执行文件识别 | 无 I/O 依赖，可单测 |

### 4.3 `services/document-worker/app`

| 模块 | 职责 |
|---|---|
| `main.py` | FastAPI 应用、`/healthz`、startup 注册信号并启动轮询线程、shutdown 停线程 |
| `worker.py` | 轮询循环与错误码归一 |
| `database.py` | `claim_job` / `complete_job` / `fail_job` / `recover_stale_jobs`（`FOR UPDATE SKIP LOCKED`） |
| `jobs.py` | 三类作业实现：`parse_job`（解析 + 分类 + 权利要求）、`build_job`（DOCX）、`render_job`（PDF + 逐页 PNG + 页面质检） |
| `parsers/parser.py` | 格式路由（PDF 文本层/OCR、DOCX、`.doc` 经 IMM）、元数据正则、分类启发式、权利要求切分 |
| `docx_builder/builder.py` | `build_statement()`：识别信息表 + 分节正文 + 页码 + 内部词过滤 |
| `render.py` | IMM 转 PDF（临时前缀用后即删）+ PyMuPDF 栅格化 + 空白页/密度检查 |
| `aliyun.py` | IMM（Office→pdf/txt/png，`target_uriprefix` 字段、任务轮询、超时）与 OCR（中心化端点、`OCR_FAILED:<code>`）适配 |
| `storage.py` | boto3 S3 客户端（V2 签名、虚拟主机寻址、5 次标准重试）、下载/上传/列举/删除/读取字节 |
| `config.py` | pydantic-settings；`ALIYUN_*` 缺省回退到 `S3_*`；`worker_temp_dir` 启动即创建 |

---

## 5. 关键流程（时序）

### 5.1 登录与会话

```text
浏览器  POST /api/auth/login {email,password}
 oa-web  assertSameOrigin → 查 app_users ⋈ user_credentials
         verifyPassword(scrypt, timingSafeEqual)
         → 生成 32B token → 存 SHA-256 到 user_sessions → Set-Cookie(oa_session)
         → 200 {user}
后续请求  requireUser(): 读 Cookie → 哈希 → 查会话（未过期）⋈ 用户 → AppUser
退出      POST /api/auth/logout → DELETE 会话行 + 清 Cookie
```

### 5.2 上传 → 解析 → 分类 → Readiness

```text
① init      浏览器 → POST .../uploads/init
            oa-web 建 documents(role=UNKNOWN) + document_versions(UPLOADING)
                    返回同源 uploadUrl
② 传输      浏览器 → PUT .../uploads/{versionId}/content（原始字节）
            oa-web 归属校验 → 流式写 OSS（显式 ContentLength + Metadata.sha256）
③ 完成      浏览器 → POST .../uploads/complete
            oa-web HeadObject 校验 size+sha256 → UPLOADED → INSERT worker_jobs(PARSE_DOCUMENT)
            （已 UPLOADED 则幂等返回）
④ 解析      oa-worker claim_job → parse_job
            magic 嗅探 → PDF/DOCX/.doc 分支 → 文本(必要时 OCR)
            → 元数据正则 → 分类启发式（user_confirmed 保护）→ 权利要求切分
            → 写 parsed_documents + OSS(parsed/full_text.txt, manifest.json)
⑤ 状态      前端轮询 /documents；用户可纠正角色/OA 轮次/D 标签
            → recomputeCaseState() 重算 Readiness（必要时自动确定唯一 Current OA）
```

### 5.3 Run 创建 → 执行 → 交付

```text
POST /api/cases/{c}/runs
  ├─ 限流 5 次/分/用户
  ├─ recomputeCaseState → 必须 READY
  ├─ 取生效 Skill 版本、校验 ANALYSIS/DRAFTING/QA 三类模型 Profile
  ├─ 事务：INSERT runs + run_inputs + run_model_snapshots
  ├─ 202 {runId}（HTTP 立即返回）
  └─ 进程内 startRunWorkflow(runId) 异步继续：
       SNAPSHOT_CASE → BUILD_TIMELINE → RESOLVE_* → EXTRACT_OA_ISSUES
       → BUILD_EVIDENCE_MATRIX → GENERATE_STRATEGIES → BUILD_AMENDMENT_PLAN
       → DRAFT_STATEMENT → SEMANTIC_QA → REPAIR_DRAFT(×MAX_REPAIR_ATTEMPTS)
       → [确定性元数据 QA：不通过则 QA_FAILED 停止]
       → BUILD_DOCX(Worker) → RENDER_DOCX(Worker) → VISUAL_QA → FINAL_METADATA_QA
       → COMPLETE（据 OPEN 的 ERROR/BLOCKER 决定 COMPLETED 或 QA_FAILED）
前端 /runs/{id} 每 3 s 轮询 → 终态展示下载按钮 + 质检记录
GET /api/artifacts/{a}/download → 校验归属与 is_user_downloadable → 从 OSS 流式返回
```

### 5.4 Worker 作业生命周期

```text
QUEUED ──claim(SKIP LOCKED)──▶ RUNNING ──成功──▶ SUCCEEDED(result)
                                   │
                                   ├─失败──▶ FAILED(error_code)   （Run 侧 waitForWorker 读到即抛错）
                                   └─超时陈旧──▶ recover_stale_jobs() 回收到 QUEUED
Web 侧 waitForWorker：每 5 s 查询作业状态，最多 240 次（约 20 分钟）后判 WORKER_JOB_TIMEOUT
```

---

## 6. 一致性、并发与容错

### 6.1 幂等与唯一性（数据库强制）

| 场景 | 机制 |
|---|---|
| 步骤重放 | `run_steps (run_id, step_key)` UNIQUE |
| 产物重写 | `artifacts (run_id, type, attempt)` UNIQUE + `ON CONFLICT DO UPDATE` |
| 上传完成重复调用 | `complete` 对已 `UPLOADED` 直接返回 |
| 解析重复入队 | 部分唯一索引：同版本仅一个活跃 `PARSE_DOCUMENT` |
| 重复解析同一版本 | `parsed_documents.document_version_id` UNIQUE（upsert）；`claim_versions` 按来源版本 `NOT EXISTS` 去重 |
| 每案单一当前权利要求 | 部分唯一索引 `claim_versions_one_current_uq` |
| 每个 Skill 单一生效版本 | 部分唯一索引 `skill_versions_one_active_uq` |

### 6.2 并发

- 同一案件可有多个 Run 并行（输入是快照，互不影响）。
- 同一进程内对同一 Run 只启动一次工作流（`activeRuns` 集合）。
- Worker 多实例安全（`SKIP LOCKED` + 部分唯一索引）。
- 前端轮询为只读查询，不参与一致性。

### 6.3 重试与降级

| 层 | 策略 |
|---|---|
| LLM 调用 | 最多 2 次；第二次把"上次被拒原因"回灌模型；截断/解析/schema 错误分类上报 |
| 语义 QA 返修 | 最多 `MAX_REPAIR_ATTEMPTS`（默认 2）轮，每轮独立复查且严格标准不放松 |
| 渲染 QA | 空白页 → `ERROR/BLANK_PAGE`（进 `qa_findings`，不中断流程） |
| Worker 作业 | 失败写 `error_code` 并由 Run 侧决断；陈旧任务自动回收重试 |
| 中断恢复 | 进程启动时把遗留非终态 Run 置 `FAILED/WORKFLOW_INTERRUPTED` |

### 6.4 失败语义：硬门禁 vs 咨询

| 类别 | 例子 | 结果 |
|---|---|---|
| **硬门禁**（确定性，代码判定） | 识别字段与快照不一致、审查意见未覆盖、内部词泄露 | Run `QA_FAILED/METADATA_QA_FAILED`，**不生成文档** |
| **咨询**（模型判定） | 引用一致性、表述完整性、无证据效果等 | 记录 findings、返修、文档照常生成并可下载，Run 标 `QA_FAILED/OPEN_QA_FINDINGS` |
| **基础设施** | OSS/DB/Worker 不可用、模型报错 | Run `FAILED` + 明确 `error_code`，页面展示原因 |

---

## 7. 扩展点与配置面

| 扩展点 | 位置 | 说明 |
|---|---|---|
| 模型与参数 | `model_profiles` 表（`/admin`） | provider / model / `secret_ref` / temperature / `maxOutputTokens`；密钥只在环境变量 |
| 新增 Provider | `lib/llm/*` + `createProvider` 工厂 | 实现 `LLMProvider` 即可 |
| 提示词与流程 | `lib/workflow/run-workflow.ts` | **刻意留在受审代码中**，不随 Skill ZIP 热执行 |
| Skill 内容 | `skill_versions` / `skill_assets`（ZIP 导入） | 提供参考文档与溯源；状态机 + 原子发布 |
| 运行开关 | `/opt/oa-agent/.env` | `AUTH_MODE`、`MAX_UPLOAD_MB`、`ALLOW_GENERATE_WITH_MISSING_PRIOR_ART`、`LLM_CONTEXT_CHAR_LIMIT`、`MAX_REPAIR_ATTEMPTS`、`WORKER_*` 等 |
| 前端分组 | `app/(auth)` / `app/(app)` / `app/admin` | 布局级鉴权，新增页面自动继承 |

---

## 8. 非功能特性

| 维度 | 现状 |
|---|---|
| 性能量级 | 单案 Run 端到端约 3–10 分钟（受模型与返修轮数支配）；页面轮询 3 s；上传为流式单次 PUT |
| 数据规模 | 生产库当前 10 MB / 2.1 MB 关系数据；27 表 / 50 索引；`artifacts` 与 `run_steps` 为主要增长表 |
| 容量红线 | 内存 1.6 GB：**构建必须 cgroup 限额**（`MemoryMax=1300M`）；Web 运行时堆限 768 MB；禁止并发构建 |
| 可用性 | 单机单点；无副本、无自动备份；systemd 崩溃重启 + 启动时 Run 收尾 |
| 安全 | 见 `TECH_DESIGN.md` §7：私有 Bucket、同源中转、服务端会话、owner 校验、CSRF、限流、提示注入防护、内部词过滤 |
| 可观测性 | 文件日志（Web/Worker）+ 数据库可查询面（`runs`/`run_steps`/`model_calls`/`qa_findings`/`audit_events`/`worker_jobs`） |
| 成本 | 1 台 ECS + OSS/IMM/OCR 按量 + DeepSeek 按 token；无托管平台订阅 |

---

## 9. 架构层技术债与演进

| 债务 | 影响 | 建议 |
|---|---|---|
| Run 生命周期与 Web 进程耦合 | 进程重启打断在跑 Run（已降级为 FAILED 而非悬挂） | 需要多实例或高可用时，改为独立 runner 进程 + 数据库/队列驱动（现有表结构已支持） |
| 无 HTTPS | Cookie 不能 `Secure`；浏览器告警；`crypto.subtle` 不可用 | 域名 + 证书，或 `sslip.io` + Let's Encrypt；随后 `COOKIE_SECURE=true` |
| 单机 PostgreSQL，无备份 | 数据风险 | 定时 `pg_dump` + OSS 归档，定期恢复演练；量级增长后可切 RDS（仅改 `DATABASE_URL`） |
| 限流为进程内 | 多实例后失效 | 迁移到数据库计数或网关层 |
| `model_calls` 只记录成功调用 | 失败调用缺用量与输入哈希 | 失败路径也写一行（字段可空） |
| 上传无断点续传/进度 | 大文件体验一般 | 分片上传（OSS Multipart）+ 前端进度 |
| 权利要求重新编号依赖模型 | 语义 QA 反复就"引用一致性"提意见 | 改为代码确定性重排，模型只产出"删除/新增/替换"意图 |

---

## 附录：运行时矩阵

| 进程 | 用户 | 端口 | 依赖 | 重启策略 | 日志 |
|---|---|---|---|---|---|
| nginx | root | 80 | oa-web:3000, oa-worker:8080 | systemd 默认 | `/var/log/nginx/*` |
| oa-web | root（当前） | 3000（回环） | PostgreSQL、OSS、DeepSeek | `Restart=always` + 崩溃上限 | `/var/log/oa-agent/web.log` |
| oa-worker | root（当前） | 8080（回环） | PostgreSQL、OSS、IMM、OCR | `Restart=always` | `/var/log/oa-agent/worker.log` |
| postgresql | postgres | 5432（回环） | — | 发行版默认 | `/var/log/postgresql/*` |

> 说明：Web/Worker 当前以 root 运行（简化部署）。若需加固，可增加专用系统用户并把 `/opt/oa-agent` 与 `/var/log/oa-agent` 的属主交出去；systemd 单元已用 `EnvironmentFile` 注入，无需 root 特权端口。
