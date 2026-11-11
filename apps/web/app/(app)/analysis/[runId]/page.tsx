import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { requireOwnedRun } from "@/lib/run-ownership";
import {
  claimActionLabel, disclosureLabel, issueTypeLabel, levelLabel, loadRunAnalysis, strategyTypeLabel
} from "@/lib/run-analysis";

/**
 * 「分析结果」— the reasoning behind a generated document, read straight from the
 * artifacts the workflow already stored. Nothing here is generated again.
 */

/** Human label for an evidence reference (page / paragraph / claim). */
function refWhere(item: { page?: number | undefined; paragraph?: string | undefined; claim?: string | undefined }): string {
  const parts = [item.page ? `第 ${item.page} 页` : "", item.paragraph ?? "", item.claim ? `权利要求 ${item.claim}` : ""].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "说明书";
}
export default async function Page({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const user = await requireUser();
  let run;
  try {
    run = await requireOwnedRun(runId, user.id);
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }
  const { issues, matrix, strategy, amendment } = await loadRunAnalysis(runId);

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      <div className="page-head" style={{ marginBottom: 14 }}>
        <div>
          <span className="eyebrow">分析结果 {runId.slice(0, 8)}</span>
          <h1 className="page-title" style={{ marginTop: 2 }}>审查意见分析与答复推演</h1>
          <p className="page-sub">
            {new Date(run.createdAt).toLocaleString("zh-CN")} · 以下内容为该次生成实际使用的分析结果，可直接与答复正文对照复核。
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link className="button ghost sm" href={`/runs/${runId}`}>返回生成记录</Link>
          <Link className="button ghost sm" href={`/cases/${run.caseId}`}>返回案件</Link>
        </div>
      </div>

      <section className="card" style={{ marginBottom: 12 }}>
        <div className="section-head"><h3>一、审查意见争点</h3><span className="muted" style={{ fontSize: 12 }}>{issues?.issues.length ?? 0} 项</span></div>
        {!issues ? <div className="empty">本次生成没有留下争点清单。</div> : issues.issues.map((issue) => (
          <div key={issue.issueId} className="finding" style={{ alignItems: "flex-start" }}>
            <span className="badge neutral">{issue.issueId}</span>
            <div style={{ minWidth: 0 }}>
              <div className="finding-code">
                {issueTypeLabel[issue.issueType] ?? issue.issueType} · {issue.legalBasis}
                {issue.claimRefs.length > 0 && <span className="muted"> · 权利要求 {issue.claimRefs.join("、")}</span>}
                {issue.priorArts.length > 0 && <span className="muted"> · {issue.priorArts.join(" + ")}</span>}
              </div>
              <div className="finding-text"><strong>审查员主张：</strong>{issue.examinerPosition}</div>
              <div className="finding-text"><strong>认定理由：</strong>{issue.reasoning}</div>
              {issue.factStatus && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>事实状态：{issue.factStatus}</div>}
            </div>
          </div>
        ))}
      </section>

      <section className="card" style={{ marginBottom: 12 }}>
        <div className="section-head"><h3>二、逐技术特征对比</h3><span className="muted" style={{ fontSize: 12 }}>{matrix?.issues.length ?? 0} 组</span></div>
        {!matrix ? <div className="empty">本次生成没有留下特征对比矩阵。</div> : matrix.issues.map((group) => (
          <div key={group.issueId} style={{ marginBottom: 14 }}>
            <div className="section-head" style={{ marginBottom: 6 }}>
              <strong style={{ fontSize: 13 }}>{group.issueId} · 权利要求 {group.claim}</strong>
              <span className="muted" style={{ fontSize: 12 }}>{group.features.length} 个特征</span>
            </div>
            <table className="table">
              <thead><tr><th style={{ width: "34%" }}>特征</th><th>本申请依据</th><th>对比文件公开状态</th></tr></thead>
              <tbody>
                {group.features.map((feature) => (
                  <tr key={feature.featureId}>
                    <td><span className="muted" style={{ fontSize: 12 }}>{feature.featureId}</span><div>{feature.text}</div></td>
                    <td className="muted" style={{ fontSize: 12.5 }}>
                      {feature.applicationEvidence.length === 0 ? "—" : feature.applicationEvidence.map((item) => `${refWhere(item)}${item.quote ? `「${item.quote.slice(0, 40)}」` : ""}`).join("；")}
                    </td>
                    <td style={{ fontSize: 12.5 }}>
                      {Object.entries(feature.priorArtEvidence).length === 0 ? <span className="muted">—</span> : Object.entries(feature.priorArtEvidence).map(([label, entry]) => (
                        <div key={label}><strong>{label}</strong>：{disclosureLabel[entry.status] ?? entry.status}</div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </section>

      <section className="card" style={{ marginBottom: 12 }}>
        <div className="section-head"><h3>三、答复策略推演</h3>{strategy && <span className="badge good">已选 {strategy.selectedId}</span>}</div>
        {!strategy ? <div className="empty">本次生成没有留下策略候选。</div> : (
          <>
            {strategy.candidates.map((candidate) => {
              const selected = candidate.id === strategy.selectedId;
              return (
                <div key={candidate.id} className="check" style={selected ? { background: "var(--accent-soft)", borderRadius: 8, padding: "10px 10px" } : undefined}>
                  <span className="check-icon" style={selected ? undefined : { background: "var(--line-strong)" }}>{candidate.id}</span>
                  <div style={{ minWidth: 0 }}>
                    <strong>{strategyTypeLabel[candidate.type] ?? candidate.type} {selected && <span className="badge good" style={{ marginLeft: 6 }}>采用</span>}</strong>
                    <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.7 }}>{candidate.summary}</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      保护范围损失 {levelLabel[candidate.scopeLoss]} · 支持风险 {levelLabel[candidate.supportRisk]} · 证据强度 {levelLabel[candidate.evidenceStrength]}
                    </div>
                    {candidate.counterattack && <div className="muted" style={{ fontSize: 12 }}>可预见的复驳：{candidate.counterattack}</div>}
                  </div>
                </div>
              );
            })}
            <div className="notice" style={{ marginTop: 10, fontSize: 12.5 }}>选择理由：{strategy.selectionRationale}</div>
          </>
        )}
      </section>

      <section className="card">
        <div className="section-head"><h3>四、权利要求修改方案</h3><span className="muted" style={{ fontSize: 12 }}>{amendment?.claims.length ?? 0} 项</span></div>
        {!amendment ? <div className="empty">本次生成没有留下修改方案。</div> : (
          <>
            {amendment.claims.map((claim) => (
              <div key={claim.claimNo} style={{ padding: "10px 0", borderTop: "1px solid var(--line)" }}>
                <div className="section-head" style={{ marginBottom: 4 }}>
                  <strong style={{ fontSize: 13 }}>权利要求 {claim.claimNo}</strong>
                  <span className={`badge ${claim.action === "KEEP" ? "neutral" : "warn"}`}>{claimActionLabel[claim.action] ?? claim.action}</span>
                </div>
                {claim.action !== "KEEP" && <div className="muted" style={{ fontSize: 12.5 }}>原文：{claim.originalText || "—"}</div>}
                <div style={{ fontSize: 13, lineHeight: 1.75 }}>建议：{claim.proposedText || "—"}</div>
                {claim.changes.length > 0 && (
                  <div style={{ marginTop: 6 }}>
                    {claim.changes.map((change) => (
                      <div key={change.changeId} className="muted" style={{ fontSize: 12.5 }}>
                        · 增加「{change.addedText}」— 依据 {change.support.map((item) => refWhere(item)).join("、") || "待核"}；技术贡献：{change.technicalContribution}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {amendment.renumbering.length > 0 && <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>权项重排：{amendment.renumbering.map((item) => `${item.from}→${item.to}`).join("、")}</div>}
            {amendment.consistencyUpdates.length > 0 && <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>一致性调整：{amendment.consistencyUpdates.join("；")}</div>}
          </>
        )}
      </section>
    </div>
  );
}
