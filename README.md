# 中国发明专利 OA 答复 Agent

一个从零实现的案件制、版本化、可追溯 OA 答复系统。用户上传申请文件、
审查意见、历次答复和对比文件，确认 Current OA 与 Current Claims 后，
系统通过固定异步工作流生成可编辑的《意见陈述书》DOCX 工作稿。

> 本系统生成的是专业工作稿，不自动提交 CNIPA，不承诺授权或“可直接提交”。

> 完整的产品技术设计文档（技术栈、架构、模块底层逻辑、数据库表结构、部署运维）见
> [`docs/TECH_DESIGN.md`](docs/TECH_DESIGN.md)；另有两份配套文档：
> [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)（技术架构）与
> [`docs/DATABASE_DESIGN.md`](docs/DATABASE_DESIGN.md)（数据库设计）；
> 运维与验证脚本见 [`tools/README.md`](tools/README.md)。

## 架构

整套系统自托管在阿里云 ECS `39.108.58.140` 上，不再依赖 Netlify 提供
Web、身份认证、数据库或工作流：

- **Web / API**：Next.js App Router（`next start`，systemd 常驻，nginx 反向代理）。
- **登录**：自建邮箱 + 密码（scrypt 哈希 + 服务端会话表），无外部身份服务。
- **数据**：本机 PostgreSQL 16 + Drizzle；案件、文档、权利要求、Skill、Run 与产物均版本化。
- **文件**：阿里云 OSS（S3 兼容接口）。上传经服务端转发，下载用短时签名 URL。
- **工作流**：16 步 Run 在 Web 进程内异步执行并逐步落库；无需 Serverless 时限或后台函数。
- **重任务**：常驻 Python Worker（systemd）负责解析编排、DOCX 生成与逐页渲染检查；
  格式转换交给阿里云 IMM，扫描件识别交给阿里云 OCR，材料不离开自己的账号。
- **模型**：Provider Adapter + 后台 Model Profile；模型配置与 Secret 分离。
- **Skill**：ZIP 导入、静态检查、脚本隔离、Staging、Eval 门禁与原子发布。

## 仓库结构

```text
apps/web/                       用户端、管理端、API、工作流核心
apps/web/instrumentation.ts     启动时收敛上次进程遗留的 RUNNING Run
packages/domain/                领域类型、Readiness、Drizzle schema
packages/schemas/               模型与 API 的 Zod 结构化输出约束
packages/skill-runtime/         Skill ZIP 安全检查与运行时清单
db/migrations/                  PostgreSQL 迁移（0001 结构、0002 基线、0003 本地登录）
deploy/deploy-ecs.sh            幂等部署脚本（迁移、构建、服务与 nginx）
deploy/oa-web.service           Web 的 systemd 单元
deploy/oa-worker.service        Worker 的 systemd 单元
deploy/nginx-oa-agent.conf      反向代理站点
scripts/apply-migrations.mjs    迁移执行器（记录 schema_migrations）
scripts/migrate-neon-to-local.py 从旧 Neon 库搬迁数据（可重复执行）
services/document-worker/       外置文档 Worker
skills/seed/                    可导入的基线 Skill 源文件
fixtures/private/               私有 Golden Case 占位目录（内容不入 Git）
```

## 部署到阿里云 ECS

### 1. 服务器基础（一次性）

```bash
# 4 GB swap（1.6 GB 内存的机器没有它无法安全构建前端）
fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

apt-get update && apt-get install -y nginx postgresql postgresql-contrib libmagic1 python3-venv
curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs
corepack enable && corepack prepare pnpm@11.19.0 --activate

sudo -u postgres psql -c "CREATE ROLE oa LOGIN PASSWORD '<password>'"
sudo -u postgres createdb -O oa oa_agent
```

### 2. 上传源码与生产环境变量

```bash
# 在开发机上（.env 不入包，服务器上的 .env 是部署状态，不是源码）
tar -czf oa-agent-src.tgz -C <repo> --exclude=node_modules --exclude=.git --exclude=.next --exclude=.env .
scp oa-agent-src.tgz root@39.108.58.140:/root/
scp .env root@39.108.58.140:/opt/oa-agent/.env      # 生产变量，chmod 600

ssh root@39.108.58.140 'mkdir -p /opt/oa-agent && tar -xzf /root/oa-agent-src.tgz -C /opt/oa-agent'
```

### 3. 部署（每次发布）

```bash
ssh root@39.108.58.140 'cd /opt/oa-agent && tar -xzf /root/oa-agent-src.tgz -C /opt/oa-agent && bash deploy/deploy-ecs.sh'
```

`deploy-ecs.sh` 是幂等的：安装依赖 → 执行迁移 → 清空 `.next` 构建 → 建 Python venv 并装
worker 依赖 → 安装 systemd 单元与 nginx 站点 → 重启服务 → 健康检查。
**它绝不会写 `/opt/oa-agent/.env`**，缺文件会直接失败退出。

### 4. 必须限制构建内存

这台机器只有 1.6 GB 内存，一次无上限的 `next build` 曾把内核推到 OOM 并让
sshd 十几分钟无法响应。构建必须放在 cgroup 限额里，让构建失败而不是让机器卡死：

```bash
systemd-run --scope --collect -p MemoryMax=1300M -p MemorySwapMax=1200M -p CPUQuota=190% \
  --unit=oa-build env NODE_OPTIONS="--max-old-space-size=1024" ./node_modules/.bin/next build
```

同时 Web 单元设置了 `NODE_OPTIONS=--max-old-space-size=768` 与
`StartLimitBurst=5`（崩溃循环会被 systemd 停下，而不是持续吃满进程与内存）。

### 5. 运维

```bash
systemctl status oa-web oa-worker nginx
journalctl -u oa-web -n 50
tail -f /var/log/oa-agent/web.log /var/log/oa-agent/worker.log
curl -s localhost/healthz            # worker 健康检查（经 nginx 固定转发）

# 忘记密码：由管理员在服务器上重置（本部署没有邮件服务）
cd /opt/oa-agent
DATABASE_URL=$(grep -E '^DATABASE_URL=' .env | cut -d= -f2-) \
  node scripts/reset-password.mjs user@example.com 'new-password'
```

生产库直接操作：

```bash
export PGPASSWORD=$(grep -E '^DATABASE_URL=' /opt/oa-agent/.env | sed -E 's#.*://oa:([^@]+)@.*#\1#')
psql -h 127.0.0.1 -U oa -d oa_agent -c "select status, count(*) from runs group by 1"
```

## 环境变量

生产变量集中在 `/opt/oa-agent/.env`（权限 600，Web 与 Worker 共用），模板见
`.env.example`。关键项：

- `DATABASE_URL`：本机 `postgresql://oa:...@127.0.0.1:5432/oa_agent`
- `AUTH_MODE=local`、`COOKIE_SECURE=false`（上 HTTPS 后改 `true`）、`APP_BASE_URL`
- `BOOTSTRAP_FIRST_ADMIN=true`：仅在实例还没有任何账号时生效，首个注册者成为管理员
- `S3_ENDPOINT` / `S3_REGION` / `S3_BUCKET` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`
  （阿里云 OSS；`S3_FORCE_PATH_STYLE=false`）
- `ALIYUN_IMM_PROJECT` / `ALIYUN_IMM_REGION`、`ALIYUN_OCR_MODE`
- `DEEPSEEK_API_KEY`、`DEEPSEEK_BASE_URL`、`DEEPSEEK_MODEL`
- `MAX_REPAIR_ATTEMPTS`：语义 QA 未通过时允许的返修轮数（默认 2）

生产禁止 `AUTH_MODE=mock` 与 `LLM_PROVIDER=mock`，服务启动时会直接报错。

## 上传与对象存储

浏览器把文件 PUT 到**同源**路由
`/api/cases/{caseId}/uploads/{documentVersionId}/content`，由服务端流式写入 OSS，
再由 `uploads/complete` 用 `HeadObject` 校验大小与 SHA-256。

这样做有两个好处：OSS 不需要为部署域名配置 CORS（当前 AccessKey 也不允许改
Bucket 的 CORS），且被截获的地址无法重放上传。因此 nginx 的
`client_max_body_size` 需要覆盖 `MAX_UPLOAD_MB`（当前 512m）。

## 数据迁移

```bash
SOURCE_DATABASE_URL='postgresql://...' TARGET_DATABASE_URL="$DATABASE_URL" \
ADMIN_EMAIL='you@example.com' ADMIN_PASSWORD='<new password>' \
  services/document-worker/.venv/bin/python scripts/migrate-neon-to-local.py
```

脚本按外键顺序复制、`ON CONFLICT DO NOTHING` 可重入，把 `cases` 的两个前向引用
先置空后回填，并为指定邮箱写入 scrypt 密码（与 `apps/web/lib/local-auth.ts` 同格式）。
迁移工具需 `psycopg`，直接用 worker 虚拟环境即可。

## 管理员初始化

`db/migrations/0002_seed_reference_data.sql` 写入基线数据：`cn-patent-oa-response`
Skill 的 1.0.0 已发布版本与五个 DeepSeek Model Profile，可重复执行。

新实例把 `BOOTSTRAP_FIRST_ADMIN=true`，第一个注册的账号即管理员；已有账号不会被
改动，初始化完成后请改回 `false`。随后访问 `/admin`：

1. 检查或调整 Model Profiles，只填 Secret 环境变量名，不填密钥值。
2. 需要真实来源溯源时，把 `skills/seed/cn-patent-oa-response` 打成 ZIP 在 Skill 管理页导入。
3. 验证为 Staging，登记私有 Golden Case，运行 Eval。
4. 门禁指标全部通过后发布；发布是事务性的，不影响在跑 Run。

## 工作流与 QA 语义

16 步固定流程：快照案件 → 时间线 → 确认 Current OA/Claims → 拆解审查意见 →
证据矩阵 → 三策略评估 → 修改方案 → 起草 → 语义 QA → 返修（最多 `MAX_REPAIR_ATTEMPTS`
轮，每轮独立复查）→ 确定性元数据 QA → 生成 DOCX → 渲染 PDF 与逐页图 → 视觉检查 →
完成。

- **案件识别字段（申请号、申请人、OA 次数/日期/文号）由系统按案件快照写入**，
  不采用模型输出，因此不可能出现编号或日期被改写。
- **确定性元数据 QA** 是硬门禁：申请号、OA 日期/文号/次数、审查意见覆盖、
  内部信息泄露，任一不符即 `QA_FAILED` 且不生成文档。
- **语义 QA** 是独立复查，仍存在的 ERROR/BLOCKER 会保留为 OPEN：此时文档照常生成
  并可直接下载（它是明确标注的工作稿），Run 以 `QA_FAILED` 结束并把 findings 一并展示，
  而不是丢弃成果或谎报通过。

## 测试

```bash
pnpm typecheck
pnpm test                     # Readiness、Skill ZIP 隔离、确定性元数据 QA
pnpm --filter @oa/web build
python -m compileall services/document-worker/app
```

端到端验证（真实数据库 / OSS / IMM / OCR / DeepSeek）：`scripts` 之外使用
`e2e_full.py` 一类的脚本，按 上传 → 解析 → 分类 → 确认 → Run → 下载 DOCX 的顺序跑通，
并可用 PyMuPDF 把渲染出的 PDF 逐页转成图片做人工/视觉复核。

## 已知限制

- OSS、IMM、OCR 是阿里云托管资源；ECS 上的 PostgreSQL 需要自行做备份
  （`pg_dump` + 对象存储归档）。
- Skill 管理 API 直接接收 ZIP，大包应改为 OSS 导入。
- 旧 DOC 与扫描件的识别质量取决于 IMM/OCR 与输入质量，低质量结果进入人工确认。
- IMM 单文件上限 200 MB，与 `MAX_UPLOAD_MB` 一致。
- 语义 QA 由模型执行，判定较严；同一份稿子可能持续给出新的表述类 findings。
  需要“全绿”时，应调整 QA 提示词与严重级别策略，而不是放宽确定性门禁。
- 服务器是 2 vCPU / 1.6 GB：不要在该机上执行无内存上限的前端构建，也不要同时跑多个构建。
