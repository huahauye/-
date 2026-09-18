# 中国发明专利 OA 答复 Agent

一个从零实现的案件制、版本化、可追溯 OA 答复系统。用户上传申请文件、
审查意见、历次答复和对比文件，确认 Current OA 与 Current Claims 后，
系统通过固定异步工作流生成可编辑的《意见陈述书》DOCX 工作稿。

> 本系统生成的是专业工作稿，不自动提交 CNIPA，不承诺授权或“可直接提交”。

## 架构

- **Web / API**：Next.js App Router、TypeScript、Netlify Identity。
- **数据**：PostgreSQL + Drizzle；案件、文档、权利要求、Skill、Run 与产物均版本化。
- **文件**：Cloudflare R2/S3 兼容直传，服务端只签发短时 URL 并核验对象。
- **工作流**：Netlify Async Workloads，固定 16 步，可重试、可审计。
- **重任务**：独立 Python Worker 执行 PDF/DOC/DOCX 解析、OCR、DOCX 构建、
  LibreOffice 渲染和逐页检查。
- **模型**：Provider Adapter + 后台 Model Profile；模型配置与 Secret 分离。
- **Skill**：ZIP 导入、静态检查、脚本隔离、Staging、Eval 门禁与原子发布。

## 仓库结构

```text
apps/web/                       用户端、管理端、API、工作流核心
packages/domain/                领域类型、Readiness、Drizzle schema
packages/schemas/               模型与 API 的 Zod 结构化输出约束
packages/skill-runtime/         Skill ZIP 安全检查与运行时清单
netlify/database/migrations/    PostgreSQL 初始迁移
netlify/async-workloads/        Run 工作流事件处理器
netlify/functions/              Netlify 可发现的函数入口
services/document-worker/       外置文档 Worker 与 Docker 镜像
skills/seed/                    可导入的基线 Skill 源文件
fixtures/private/               私有 Golden Case 占位目录（内容不入 Git）
```

## 直接部署到 Netlify

Web、API、身份认证、数据库和异步工作流均以 Netlify 为默认运行环境，不需要在
本机启动 Docker、PostgreSQL 或 MinIO。

```bash
pnpm install
netlify login
netlify sites:create --name <your-site-name>
netlify db init
netlify env:pull .env.netlify
pnpm db:setup:netlify
pnpm db:seed:netlify
netlify deploy --build --prod
```

部署前还需在 Netlify 配置 DeepSeek 与 Cloudflare R2 环境变量，并启用 Identity
和 Async Workloads。`.env.netlify` 含远程数据库凭据，已被 `.env.*` 规则忽略，
不得提交到 Git。

### 必须使用 Linux 构建

**不要在 Windows 上用 `netlify deploy --build` 交付生产包。**
`@netlify/plugin-nextjs` 在 Windows 上会把 `/var/task/apps/web` 写成带反斜杠的
路径，打包后转义成控制字符，函数在 Linux 运行时抛
`Cannot find package '\u000bar\taskappsweb'`（502）。同时该插件会用 `fs.cp` 复制
依赖软链，未开启开发者模式的 Windows 账号会直接 `EPERM`。

正确做法是把仓库连到 Netlify 做云端 Linux 构建（Project configuration →
Build & deploy → Continuous deployment → Link repository），`netlify.toml` 已提供
构建命令与发布目录，Base directory 留空；之后 `git push` 即自动发布。

### 同源校验

跨站写请求的 Origin 校验在 `apps/web/lib/errors.ts` 的 `assertSameOrigin` 中实现，
由 `readJson` 及无请求体的写接口调用。它不再使用 Next.js middleware，因为
Next 16 的 `proxy.ts` 会走 Node middleware 打包路径，使本地 Windows 构建不可用。

## 已实现功能

- 邮箱注册、登录、找回入口及用户/管理员权限隔离。
- 案件 CRUD、软删除、所有权检查和审计事件。
- R2 预签名直传、SHA-256/大小/类型校验、短时下载 URL。
- PDF、DOC、DOCX 解析；扫描 PDF OCR；元数据和权利要求候选提取。
- 多轮 OA、D1/D2…归类、人工修正、Current OA/Claims 确认与 Readiness 阻断。
- Run 输入、Skill、模型配置、解析器/构建器版本的不可变快照。
- 问题拆解、证据矩阵、三策略评估、修改方案、起草、语义 QA、确定性 QA、
  DOCX 生成、渲染和视觉检查。
- 管理端 Run 调试、Skill 校验/发布、模型配置、Eval 记录。
- 结构化错误码、并发任务领取、过期锁恢复、幂等产物写入。

## 数据库迁移

初始迁移位于
`netlify/database/migrations/0001_initial.sql`。创建 Netlify DB 并拉取变量后执行：

```bash
pnpm db:setup:netlify
pnpm db:seed:netlify
```

迁移包含完整的外键、唯一约束、单 Current Claims、单 Published Skill、
Run step 幂等键和 Worker 活跃解析任务约束。

## 环境变量

Netlify 站点至少配置：

- `NETLIFY_DB_URL`（`netlify db init` 自动创建）
- `NETLIFY_IDENTITY_URL`
- `R2_ENDPOINT` / `R2_BUCKET` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`
- `DEEPSEEK_API_KEY`、`DEEPSEEK_BASE_URL` 和 `DEEPSEEK_MODEL`（使用 DeepSeek 时）
- Worker 使用的同一数据库与对象存储变量
- `ACTIVE_SKILL_SLUG`、`PARSER_VERSION`、`BUILDER_VERSION`

生产必须设置 `AUTH_MODE=netlify`、`WORKFLOW_DRIVER=netlify`，且不得使用
`LLM_PROVIDER=mock`。

## 外置 Worker 部署

文档 Worker 需要 LibreOffice、Poppler、OCR 和中文字体，不能运行在普通 Netlify
Functions 中。将 `services/document-worker` 部署到支持容器的云平台（例如
Railway、Render 或 Fly.io），无需在本机运行 Docker。Worker 需要能访问 Netlify
DB 与 R2；`/healthz` 用于探针，多实例通过 `FOR UPDATE SKIP LOCKED` 安全竞争任务。

## Netlify 控制台配置

1. 创建/关联站点；手工部署时从本目录运行 Netlify CLI。
2. 开启 Identity 的邮箱注册、确认邮件和密码恢复模板。
3. 创建 Netlify DB，注入数据库变量并执行迁移。
4. 配置所有环境变量和 LLM Secret。
5. 启用 Async Workloads，确认 `run.created` 已注册。
6. 在 R2 配置仅允许站点域名的 PUT/GET CORS；禁止公开 Bucket。
7. 将 Worker 健康检查、日志和告警接入托管平台。

## 管理员初始化

用户第一次通过 Identity 登录后，在数据库将其 `app_users.role` 更新为
`ADMIN`。随后访问 `/admin`：

1. 建立 Model Profiles，仅填写 Secret 环境变量名，不填密钥值。
2. 将 `skills/seed/cn-patent-oa-response` 打成 ZIP，在 Skill 管理页导入。
3. 验证为 Staging，登记私有 Golden Case，运行 Eval。
4. 门禁指标全部通过后发布；发布是事务性的，不影响在跑 Run。

## 测试

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
python -m compileall services/document-worker/app
```

单元测试覆盖 Readiness、Skill ZIP 隔离和确定性元数据 QA；Playwright 包含公开页
smoke 测试。涉及真实数据库、R2、Identity、OCR 与 LibreOffice 的集成/E2E 需在
完整本地栈或 Preview 环境执行，真实案件材料不得提交到 Git。

## 已知限制

- R2 和外置文档 Worker 仍是独立托管资源，Netlify 负责 Web/API/Identity/DB/工作流。
- Skill 管理 API 直接接收 ZIP；若站点函数请求体上限低于 20 MB，应按文档上传
  流程扩展为 R2 预签名导入。
- OCR、旧 DOC 和字体兼容性依赖部署镜像与输入质量，低质量结果会进入人工确认。
- Eval 数据模型和发布门禁已实现，批量 Golden Case 调度界面仍是 V1 精简版。

## 剩余 P1

- 在 Preview 环境完成 Identity 邮件链路、R2 CORS 和 200 MB 上传实测。
- 用至少一套脱敏真实案件完成解析—分类—生成—渲染全链路 smoke test。
- 为 Skill 大包增加 R2 直传导入，并完善 Eval 批量执行/版本对比视图。
- 接入生产日志聚合、Run/Worker 告警、数据库备份与对象生命周期策略。

实现采用 OpenAI Responses 的结构化输出、Netlify Identity 和 Async Workloads；
部署时请复核对应平台的最新官方文档。
