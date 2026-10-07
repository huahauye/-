# 运维与验证脚本

这些脚本不在应用运行时路径上，只用于部署、验证和排查。它们都需要本机的凭据文件，
**这些文件不进 Git**：

| 文件 | 用途 | 需要的变量 |
|---|---|---|
| `tools/ecs.env` | ECS 登录与账号口令 | `ECS_PASSWORD`（SSH）、`OA_DB_PASSWORD`、`OA_ADMIN_PASSWORD` |
| `tools/worker.env` | OSS / 阿里云凭据（给 `oss_cors_native.py` 用） | `S3_ENDPOINT`、`S3_REGION`、`S3_BUCKET`、`S3_ACCESS_KEY_ID`、`S3_SECRET_ACCESS_KEY` |
| 仓库根 `.env` | 模型密钥（给 DeepSeek 探针用） | `DEEPSEEK_API_KEY`、`DEEPSEEK_BASE_URL`、`DEEPSEEK_MODEL` |

从仓库根目录运行；`tools/out/` 放下载物与截图。

## 服务器操作

| 脚本 | 作用 |
|---|---|
| `ecs.py run "<cmd>"` / `script <file>` / `put` / `get` | SSH 与 SFTP 助手（长超时 + 重试，适配 2 vCPU / 1.6 GB 的小机器）。`ECS_SOCKS=host:port` 可走代理连。 |
| `ecs_prep.sh` | 一次性基础：swap、nginx、PostgreSQL、Node 22、pnpm |
| `ecs_watch.py [分钟]` | 等 SSH 恢复（实例被 OOM/卡死时用），恢复即退出 |
| `oss_cors_native.py show\|set` | 查看/追加 OSS Bucket 的 CORS 规则（需 Bucket 属主权限才可写） |

正式的部署流程在 `deploy/deploy-ecs.sh`（幂等），不要用这些脚本手工替代它。

## 造数据与端到端验证

| 脚本 | 作用 |
|---|---|
| `make_fixtures.py [目录]` | 生成中文专利风格 PDF（申请文件、说明书、审查意见、D1、D2），带完整识别信息，可直接上传 |
| `e2e_full.py [站点] [邮箱] [口令]` | 全链路：登录 → 建案 → 经同源代理上传 5 份 → 解析 → 分类 → 确认 → 16 步 Run → 下载 DOCX |
| `run_case.py <caseId> [站点]` | 对已存在的案件跑一次 Run 并跟踪到结束，打印每步状态与产物、下载 DOCX |

## 浏览器验证（Playwright）

需要先装浏览器：`npx playwright install chromium`（在本机 `apps/web` 下执行）。

| 脚本 | 作用 |
|---|---|
| `ui_check_upload.mjs [站点] [caseId]` | 真实浏览器里验证上传（覆盖"纯 HTTP 无 `crypto.subtle`"这条路径），输出截图与结果 |
| `ui_check_run.mjs <runId>` | 验证 Run 页交付文件：标题、下载按钮、质检记录，并**真实点击下载**确认拿到文件 |

> 这两个脚本会临时用管理员账号登录；若目标案件属于其他账号，需先 `psql` 把
> `cases.owner_user_id` 临时改成管理员，验证后改回（见 `docs`/对话记录）。

## 模型与容量探针

| 脚本 | 作用 |
|---|---|
| `deepseek_probe.py` | 探测默认输出上限与是否截断（`finish_reason=length` 时 JSON 会不合法） |
| `deepseek_ceiling.py` | 对同一提示分别用「不传 max_tokens / 8192 / 32768」比较，确定安全上限 |

这两个脚本解释了为什么 `model_profiles.config.maxOutputTokens` 设为 32768：
不设上限时单次输出可到 12,752 token，而 8192 会在 JSON 中途截断。
