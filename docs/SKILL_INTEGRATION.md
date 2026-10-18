# Skill 接入说明（V2 · feat/v2-skill-integration）

本文记录"新版 Skill 如何真正参与生成"，以及如何验证、切换与回退。

## 1. 身份与来源

| 项 | 值 |
|---|---|
| 运行时标识（`skills.slug`） | `cn-patent-oa-response` |
| 运行时版本（`skill_versions.version`） | **2.0.0** |
| Skill 原始标识 | `oa-response-cn` |
| Skill 原始版本 | **v0.2**（2026-10-14） |
| 上传归档 SHA-256 | `92f38f376326872f5ce88cdb1f31ad9bb6fd4e970389fe97c037de5f5d12f214` |
| 仓库内置副本 | `skills/oa-response-cn/`（21 个文件 + `runtime-manifest.json`，已脱敏） |
| 历史版本 | `1.0.0` 记录保留，不删除、不改写 |

`skills/oa-response-cn/runtime-manifest.json` 同时记录运行时身份、原始身份、每个文件的 sha256 与归档指纹，保证来源可追溯。真实客户案卷复盘不随仓库分发：`.gitignore` 排除 `skills/private/` 与 `skills/*/references/case_*.md`，需要时放在这些位置本地使用。

## 2. V1 为什么没有真正用上 Skill

- `createRun` 只冻结 `runs.skill_version_id`；
- `run-workflow.ts` 仅读取 `skill_versions.bundle_sha256` 写入 `model_calls.skill_bundle_hash`；
- 每一步的提示词是代码里写死的短句，`skill_assets` / `runtime_manifest` 从未被读取。

即：Skill 只被"登记与授权"，没有被"执行"。

## 3. V2 的加载与注入机制

```text
resolveSkillContent({ skillVersionId, slug })     ← apps/web/lib/skill/source.ts
   ├─ SKILL_CONTEXT_MODE=repo（默认）：读 skills/oa-response-cn/（开发、测试、本地验证）
   ├─ SKILL_CONTEXT_MODE=db         ：读 skill_assets(is_runtime_text) → OSS 文本（/admin 导入的包）
   └─ SKILL_CONTEXT_MODE=off        ：不注入，逐字复现 V1 提示词（回退开关）

buildSkillContext(skill, stepKey, charLimit)      ← apps/web/lib/skill/context.ts
   ├─ 按步骤取规则文件（见下表），按顺序填充
   ├─ 超出 SKILL_CONTEXT_CHAR_LIMIT（默认 40000 字符）→ 截断最后一个文件并标记"已截断"
   └─ 产出 { text, hash, files[] }，hash = sha256(身份 + 实际注入的文件与长度)
```

注入点：`run-workflow.ts` 的 `structured()`。最终 system prompt = `注入防护 + Skill 规则块 + 该步任务指令`；材料仍包在
`<CASE_MATERIALS_UNTRUSTED_DATA>` 中（材料是数据，不是指令）。

**可验证性**：`model_calls.skill_bundle_hash` 现在记录的是**注入规则块的哈希**（而不是 Skill 版本包的哈希），
同样的规则内容 → 同一哈希；换了规则文件或截断策略 → 哈希变化。每次调用另打一行日志：

```text
skill_injected run=<id> step=DRAFT_STATEMENT skill=cn-patent-oa-response@2.0.0（原始 oa-response-cn v0.2） origin=repo chars=12939 files=references/oa_writing_style.md,… hash=5f17730e06cf…
```

## 4. 步骤 → 规则文件映射（按 SKILL.md 的渐进加载表）

| 步骤 | 注入的规则文件 | 实测注入量 |
|---|---|---|
| `EXTRACT_OA_ISSUES` | SKILL.md、intake_workflow、evidence_protocol、legal_sources | 4 文件 / 6,781 字符 |
| `BUILD_EVIDENCE_MATRIX` | evidence_protocol、creativity_framework | 2 文件 / 2,836 字符 |
| `GENERATE_STRATEGIES` | mairui_decision_tree、creativity_framework、examiner_counterattack、claim_amendment | 4 文件 / 9,158 字符 |
| `BUILD_AMENDMENT_PLAN` | claim_amendment、evidence_protocol、examiner_counterattack | 3 文件 / 3,210 字符 |
| `DRAFT_STATEMENT` | oa_writing_style、opinion_body_outline、claim_amendment、creativity_framework、evidence_protocol | 5 文件 / 12,939 字符 |
| `REPAIR_DRAFT(_n)` | oa_writing_style、opinion_body_outline、evidence_protocol、examiner_counterattack | 4 文件 / 10,705 字符 |
| `SEMANTIC_QA` | evaluation_rubric、examiner_counterattack、evidence_protocol、oa_writing_style | 4 文件 / 10,626 字符 |
| `VERIFY_REPAIR` | evaluation_rubric、smoke_tests、examiner_counterattack、evidence_protocol | 4 文件 / 3,655 字符 |

Skill 文本合计 40,686 字符（19 个文本文件；模板 `.docx` 与 `scripts/*.py` 不参与注入）。默认预算下无截断。

## 5. 同步调整的契约（保持历史兼容）

| 变更 | 原因 |
|---|---|
| `strategySchema.candidates` 最少数量 3 → 1 | Skill 明确"不能为凑三个方案而编造修改特征"；三种类型仍可用 |
| `strategySchema` 增加可选 `counterattack` | 记录审查员最可能的二次攻击 |
| `oaIssueSchema` 增加可选 `factStatus`、`oaLocation` | 区分"审查员主张"与"原文已核"，并记录通知书出处 |
| `evidenceRefSchema` 增加可选 `sourceTag` | 七种证据标签（原文已核/OA主张/推断/未检索到/待核/用户确认） |

以上均为**可选字段**或**放宽**的约束，历史 Run 的存储 JSON、既有逻辑与 DOCX 生成器不受影响。
**本轮不修改 DOCX 生成器**，仍按 `statement.json` 的既有结构渲染；Skill 的正文骨架通过提示词约束。

## 6. 切换与回退

| 目标 | 做法 |
|---|---|
| 生产默认（本分支） | `SKILL_CONTEXT_MODE=repo`（未设置即为默认值） |
| 改用 /admin 导入的 Skill 包 | `SKILL_CONTEXT_MODE=db`（需要 `skill_assets.is_runtime_text` 非空） |
| 回退到 V1 行为 | `SKILL_CONTEXT_MODE=off` |
| 调整上下文预算 | `SKILL_CONTEXT_CHAR_LIMIT`（字符） |
| 指定其它目录（本地试验） | `SKILL_REPO_DIR`（绝对路径或相对 cwd） |

## 7. 发布新版 Skill 的流程（沿用现有机制，未改发布代码）

1. `/admin` → Skill → 导入 ZIP（`oa-response-cn-v0.2.zip`），版本号填 `2.0.0`；
2. `validate` 校验（必须含 `SKILL.md`；可执行资产不得作为运行文本）→ 状态 `STAGING`；
3. 登记 Eval 并满足门禁（BLOCKER=0、METADATA_ERROR=0、ISSUE_COVERAGE=1、DOCX_BUILD_SUCCESS=1）；
4. `publish` 在事务内把同 Skill 的既有 active 版本置为 `ARCHIVED` 并激活 `2.0.0`；
   —— `1.0.0` 的记录与文件保留，历史 Run 通过 `runs.skill_version_id` 仍指向其原版本，不受影响。

## 8. 本轮未做（明确记录）

- 未接入 `assets/意见陈述书正文_空白模板.docx`（DOCX 生成器保持不变）；
- 未接入 `scripts/qa_docx.py`（现有确定性元数据 QA 与渲染检查继续负责机械校验）；
- 未修改生产数据库、生产 `.env` 与部署形态；真实质量对比需在隔离测试环境执行（见交付说明）。
