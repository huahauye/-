"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Download, Loader2, RefreshCw } from "lucide-react";

type Run = { id: string; caseId: string; status: string; createdAt: string; finishedAt: string | null; userMessage: string | null; errorCode: string | null; skillVersion?: string };
type Step = { stepKey: string; status: string };
type Artifact = { id: string; type: string; downloadable: boolean; sizeBytes: number | null };
type Finding = { id: string; severity: string; code: string; location: string | null; message: string; repairStatus: string };

const stages = [
  { name: "准备材料", keys: ["SNAPSHOT_CASE", "BUILD_TIMELINE", "RESOLVE_CURRENT_OA", "RESOLVE_CURRENT_CLAIMS"] },
  { name: "分析审查意见", keys: ["EXTRACT_OA_ISSUES", "BUILD_EVIDENCE_MATRIX", "GENERATE_STRATEGIES", "BUILD_AMENDMENT_PLAN"] },
  { name: "起草意见陈述书", keys: ["DRAFT_STATEMENT"] },
  { name: "文稿质检", keys: ["SEMANTIC_QA", "REPAIR_DRAFT", "VISUAL_QA", "FINAL_METADATA_QA"] },
  { name: "生成 Word", keys: ["BUILD_DOCX", "RENDER_DOCX", "COMPLETE"] }
];
const severityLabels: Record<string, string> = { BLOCKER: "必须处理", ERROR: "问题", WARNING: "提示", INFO: "说明" };

export function RunView({ runId }: { runId: string }) {
  const [run, setRun] = useState<Run | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(() => fetch(`/api/runs/${runId}`)
    .then(async (response) => {
      const value = await response.json();
      if (!response.ok) throw new Error(value.error?.message ?? "读取生成进度失败");
      setRun(value.run);
      setSteps(value.steps ?? []);
      setArtifacts(value.artifacts ?? []);
      setFindings(value.findings ?? []);
    })
    .catch((cause) => setError(cause.message)), [runId]);

  useEffect(() => {
    load();
    const timer = setInterval(() => {
      if (!run || !["COMPLETED", "FAILED", "QA_FAILED", "CANCELLED"].includes(run.status)) load();
    }, 3000);
    return () => clearInterval(timer);
  }, [load, run]);

  if (error) return <div className="notice error">{error}</div>;
  if (!run) return <div className="card empty">正在读取生成进度…</div>;

  const terminal = ["COMPLETED", "FAILED", "QA_FAILED", "CANCELLED"].includes(run.status);
  // The document is what the user came for: offer it whenever it exists, even
  // when the independent QA still reports something about the draft.
  const docx = artifacts.find((artifact) => artifact.type === "STATEMENT_DOCX" && artifact.downloadable);
  const pdf = artifacts.find((artifact) => artifact.type === "RENDERED_PDF" && artifact.downloadable);
  const openFindings = findings.filter((finding) => finding.severity === "ERROR" || finding.severity === "BLOCKER");
  const advisoryFindings = findings.filter((finding) => finding.severity === "WARNING");
  const title = docx ? "意见陈述书已生成" : terminal ? "本次生成未完成" : "正在生成意见陈述书";
  const kb = (value: number | null) => (value ? `${Math.round(value / 1024)} KB` : "");

  return (
    <div style={{ maxWidth: 820, margin: "0 auto" }}>
      <div className="page-head" style={{ marginBottom: 14 }}>
        <div>
          <span className="eyebrow">生成记录 {run.id.slice(0, 8)}</span>
          <h1 className="page-title" style={{ marginTop: 2 }}>{title}</h1>
          <p className="page-sub">{new Date(run.createdAt).toLocaleString("zh-CN")}{run.skillVersion ? ` · 规则版本 ${run.skillVersion}` : ""}</p>
        </div>
        <Link className="button ghost sm" href={`/cases/${run.caseId}`}>返回案件</Link>
      </div>

      <section className="run-hero">
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className={`badge ${docx ? "good" : terminal ? "bad" : ""}`}>
              {docx ? "可下载" : terminal ? "未完成" : "进行中"}
            </span>
            <strong style={{ fontSize: 15 }}>{title}</strong>
          </div>
          <p className="muted" style={{ fontSize: 12.5, margin: "6px 0 0", lineHeight: 1.7 }}>
            {docx
              ? "工作稿为可编辑 DOCX，供专利代理师复核后使用；系统不会自动提交，也不承诺授权结果。"
              : terminal
                ? "本次没有产出可下载文稿，可以返回案件重新生成。"
                : "生成完成后本页会自动出现下载按钮，可以离开页面稍后再回来。"}
          </p>
        </div>
        {docx && (
          <div className="run-actions">
            <a className="button" href={`/api/artifacts/${docx.id}/download`}><Download size={16} />下载 DOCX {kb(docx.sizeBytes)}</a>
            {pdf && <a className="button ghost" href={`/api/artifacts/${pdf.id}/download`}><Download size={16} />下载 PDF {kb(pdf.sizeBytes)}</a>}
          </div>
        )}
      </section>

      {docx && openFindings.length > 0 && (
        <div className="notice warn" style={{ marginTop: 12 }}>
          文稿已生成并可下载。独立质检仍提出 {openFindings.length} 项需要人工确认的问题，见下方质检记录，请代理师复核后再使用。
        </div>
      )}

      {!docx && terminal && (
        <div className="notice error" style={{ marginTop: 12 }}>
          本次生成未完成，请返回案件重新生成或联系管理员。错误编号：{run.userMessage ?? `RUN-${run.id.slice(0, 4).toUpperCase()}`}{run.errorCode ? ` · 原因：${run.errorCode}` : ""}
        </div>
      )}

      {!terminal && (
        <div className="notice" style={{ marginTop: 12 }}>
          <RefreshCw size={14} style={{ verticalAlign: -2, marginRight: 6 }} />页面会自动更新，无需保持窗口前台。
        </div>
      )}

      <section className="card" style={{ marginTop: 12 }}>
        <div className="section-head"><h3>生成进度</h3><span className="muted" style={{ fontSize: 12 }}>{terminal ? "已结束" : "进行中"}</span></div>
        <div className="timeline">
          {stages.map((stage, index) => {
            const states = stage.keys.map((key) => steps.find((step) => step.stepKey === key)?.status);
            const done = states.length > 0 && states.every((value) => value === "SUCCEEDED");
            const active = (!done && states.some((value) => value === "RUNNING"))
              || (!terminal && !states.some(Boolean) && stages.slice(0, index).every((previous) => previous.keys.every((key) => steps.find((step) => step.stepKey === key)?.status === "SUCCEEDED")));
            const failed = states.some((value) => value === "FAILED");
            return (
              <div className={`step ${done ? "done" : active ? "active" : ""}`} key={stage.name}>
                <span className="dot" style={failed ? { background: "var(--red)" } : undefined} />
                <div>
                  {stage.name}
                  {active && !terminal && <Loader2 size={12} style={{ marginLeft: 6, verticalAlign: -1 }} />}
                  {failed && <span className="muted" style={{ marginLeft: 6, fontSize: 12 }}>未完成</span>}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {findings.length > 0 && (
        <section className="card" style={{ marginTop: 12 }}>
          <div className="section-head">
            <div>
              <h3>质检记录</h3>
              <div className="muted" style={{ fontSize: 12 }}>独立语义质检与渲染检查的结论，按严重程度排列</div>
            </div>
          </div>
          {[...openFindings, ...advisoryFindings, ...findings.filter((finding) => finding.severity === "INFO")].slice(0, 12).map((finding) => (
            <div className="finding" key={finding.id}>
              <span className={`finding-sev ${finding.severity}`}>{finding.severity === "INFO" ? "i" : finding.severity === "WARNING" ? "!" : "×"}</span>
              <div style={{ minWidth: 0 }}>
                <div className="finding-code">{severityLabels[finding.severity] ?? finding.severity} · {finding.code}</div>
                <div className="finding-text">{finding.message}</div>
                {finding.location && <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>{finding.location}</div>}
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
