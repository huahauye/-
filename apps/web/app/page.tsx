import Link from "next/link";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { ArrowRight, FileSearch, FileText, ScanSearch, Upload } from "lucide-react";
import { cases, runs } from "@oa/domain/db";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";

const statusLabel: Record<string, string> = {
  INCOMPLETE: "材料未齐",
  NEEDS_CONFIRMATION: "待确认",
  READY: "可生成",
  PROCESSING: "处理中",
  COMPLETED: "已完成",
  FAILED: "需处理"
};
const runStatusLabel: Record<string, string> = {
  QUEUED: "排队中",
  ANALYZING: "审查意见分析",
  DRAFTING: "生成答复",
  QUALITY_CHECK: "文稿质检",
  GENERATING_DOCUMENT: "生成文件",
  COMPLETED: "已生成",
  QA_FAILED: "已生成（附质检提示）",
  FAILED: "未完成",
  CANCELLED: "已取消"
};

function statusClass(status: string): string {
  if (status === "READY" || status === "COMPLETED") return "badge good";
  if (status === "FAILED") return "badge bad";
  return "badge warn";
}

function runStatusClass(status: string): string {
  if (status === "COMPLETED") return "badge good";
  if (status === "QA_FAILED") return "badge warn";
  if (status === "FAILED") return "badge bad";
  return "badge neutral";
}

const START_STEPS: Array<[typeof Upload, string, string]> = [
  [Upload, "上传材料", "本申请、本次审查意见、D1—Dn 对比文件"],
  [ScanSearch, "确认版本", "核对文件角色与当前权利要求版本"],
  [FileText, "生成答复", "自动运行分析、起草与质检，产出 DOCX"]
];

export default async function Home() {
  const user = await currentUser();

  // 未登录：说明产品定位，并提供顶部导航里的登录 / 注册入口。
  if (!user) {
    return (
      <div className="landing">
        <span className="eyebrow">中国发明专利 OA 答复</span>
        <h1>把审查意见拆解、对比文件核对与意见陈述书起草<br />放进一条可追溯的工作流</h1>
        <p className="muted" style={{ fontSize: 15 }}>
          面向专利代理师与企业 IPR：上传本次审查意见、本申请与引证对比文件，确认当前权利要求后，一键生成可编辑的《意见陈述书》工作稿。
        </p>
        <div className="landing-points">
          {[
            ["逐条重建审查意见", "摘录审查员原话、法条与对比文件组合，区分“审查员主张”与“原文已核”。"],
            ["逐技术特征核对公开", "按当前有效权利要求切分特征，标注各对比文件的公开状态与出处。"],
            ["先证据后判断地成文", "修改说明、逐项答复与创造性论证分别落笔，并附独立质检记录。"]
          ].map(([title, desc]) => (
            <div className="landing-point" key={title}>
              <span className="landing-dot">✓</span>
              <div>
                <strong>{title}</strong>
                <div className="muted" style={{ fontSize: 13 }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link className="button" href="/login">登录工作台</Link>
          <Link className="button ghost" href="/register">注册账户</Link>
        </div>
        <p className="muted" style={{ marginTop: 20, fontSize: 12.5 }}>
          生成结果为供专业人员复核的工作稿，不自动提交国知局，也不承诺授权结论。
        </p>
      </div>
    );
  }

  const caseRows = await db.select({
    id: cases.id,
    title: cases.title,
    applicationNo: cases.applicationNo,
    status: cases.status,
    updatedAt: cases.updatedAt
  }).from(cases)
    .where(and(eq(cases.ownerUserId, user.id), isNull(cases.deletedAt)))
    .orderBy(desc(cases.updatedAt))
    .limit(200);

  const runRows = await db.select({
    id: runs.id,
    status: runs.status,
    createdAt: runs.createdAt,
    caseId: runs.caseId,
    caseTitle: cases.title,
    applicationNo: cases.applicationNo
  }).from(runs)
    .innerJoin(cases, eq(cases.id, runs.caseId))
    .where(and(eq(cases.ownerUserId, user.id), isNull(cases.deletedAt)))
    .orderBy(desc(runs.createdAt))
    .limit(6);

  const [runTotalRow] = await db.select({ total: sql<number>`count(*)::int` }).from(runs)
    .innerJoin(cases, eq(cases.id, runs.caseId))
    .where(and(eq(cases.ownerUserId, user.id), isNull(cases.deletedAt)));

  const readyCount = caseRows.filter((row) => row.status === "READY").length;
  const pendingCount = caseRows.filter((row) => row.status === "INCOMPLETE" || row.status === "NEEDS_CONFIRMATION").length;
  const generatedCount = runRows.filter((row) => row.status === "COMPLETED" || row.status === "QA_FAILED").length;
  const recentCases = caseRows.slice(0, 5);
  const lastRun = runRows[0];

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">工作台</h1>
          <p className="page-sub">欢迎回来，{user.email}。这里是您的审通答复概览。</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link className="button ghost" href="/cases">全部案件</Link>
          <Link className="button" href="/cases/new">新建案件</Link>
        </div>
      </div>

      <div className="stats">
        <div className="stat"><div className="stat-label">案件总数</div><div className="stat-value">{caseRows.length}</div><div className="stat-foot">按申请组织的案件档案</div></div>
        <div className="stat"><div className="stat-label">材料已就绪</div><div className="stat-value">{readyCount}</div><div className="stat-foot">可以直接生成答复</div></div>
        <div className="stat"><div className="stat-label">待补充 / 待确认</div><div className="stat-value">{pendingCount}</div><div className="stat-foot">缺材料或未确认当前版本</div></div>
        <div className="stat"><div className="stat-label">生成记录</div><div className="stat-value">{runTotalRow?.total ?? 0}</div><div className="stat-foot">{generatedCount > 0 ? `最近 ${runRows.length} 次中 ${generatedCount} 次已出稿` : "还没有完成出稿"}</div></div>
      </div>

      <div style={{ height: 20 }} />

      <div className="feature-grid">
        <div className="feature">
          <span className="feature-icon"><FileSearch size={20} /></span>
          <div className="feature-body">
            <div className="feature-title">审查意见答复</div>
            <div className="feature-desc">上传本次 OA、本申请与引证对比文件 → 确认当前权利要求 → 生成可编辑的意见陈述书工作稿。</div>
            <div style={{ display: "flex", gap: 8 }}>
              <Link className="button" href={lastRun ? `/cases/${lastRun.caseId}` : "/cases"}>{lastRun ? "继续上次案件" : "开始第一个案件"}</Link>
              <Link className="button ghost" href="/cases/new">新建案件</Link>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="section-head"><h3>怎么开始</h3></div>
          <div className="slot-list">
            {START_STEPS.map(([Icon, title, desc]) => (
              <div className="slot" key={title}>
                <span className="slot-icon"><Icon size={16} /></span>
                <div className="slot-main">
                  <div className="slot-name">{title}</div>
                  <div className="slot-label">{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ height: 20 }} />

      <div className="grid grid-2">
        <section className="card" style={{ padding: 0 }}>
          <div className="section-head" style={{ padding: "16px 16px 0", marginBottom: 8 }}>
            <h3>最近案件</h3>
            <Link className="link" href="/cases" style={{ fontSize: 13 }}>全部 →</Link>
          </div>
          {recentCases.length === 0 ? (
            <div className="empty">还没有案件，先创建一个案件档案。</div>
          ) : recentCases.map((row) => (
            <Link className="list-row" href={`/cases/${row.id}`} key={row.id}>
              <div className="list-main">
                <div className="list-title">{row.title || "未命名案件"}</div>
                <div className="list-meta">{row.applicationNo || "尚未填写申请号"} · 更新于 {new Date(row.updatedAt).toLocaleDateString("zh-CN")}</div>
              </div>
              <span className={statusClass(row.status)}>{statusLabel[row.status] ?? row.status}</span>
              <ArrowRight size={15} color="#9ca3af" />
            </Link>
          ))}
        </section>

        <section className="card" style={{ padding: 0 }}>
          <div className="section-head" style={{ padding: "16px 16px 0", marginBottom: 8 }}>
            <h3>最近生成</h3>
          </div>
          {runRows.length === 0 ? (
            <div className="empty">还没有生成记录。</div>
          ) : runRows.map((row) => (
            <Link className="list-row" href={`/runs/${row.id}`} key={row.id}>
              <div className="list-main">
                <div className="list-title">{row.caseTitle || row.applicationNo || "未命名案件"}</div>
                <div className="list-meta">{new Date(row.createdAt).toLocaleString("zh-CN")}</div>
              </div>
              <span className={runStatusClass(row.status)}>{runStatusLabel[row.status] ?? row.status}</span>
            </Link>
          ))}
        </section>
      </div>
    </>
  );
}
