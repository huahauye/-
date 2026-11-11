"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Download, RefreshCw } from "lucide-react";

type Run = { id: string; caseId: string; status: string; createdAt: string; finishedAt: string | null; userMessage: string | null; errorCode: string | null; skillVersion?: string };
type Step = { stepKey: string; status: string; startedAt?: string | null; finishedAt?: string | null };
type Artifact = { id: string; type: string; downloadable: boolean; sizeBytes: number | null };

const stages = [
  { name: "准备材料", keys: ["SNAPSHOT_CASE", "BUILD_TIMELINE", "RESOLVE_CURRENT_OA", "RESOLVE_CURRENT_CLAIMS"] },
  { name: "分析审查意见", keys: ["EXTRACT_OA_ISSUES", "BUILD_EVIDENCE_MATRIX", "GENERATE_STRATEGIES", "BUILD_AMENDMENT_PLAN"] },
  { name: "起草意见陈述书", keys: ["DRAFT_STATEMENT"] },
  { name: "生成 Word", keys: ["BUILD_DOCX", "RENDER_DOCX", "COMPLETE"] }
];
/** Plain-language name for the step that is running right now. */
const stepLabels: Record<string, string> = {
  SNAPSHOT_CASE: "读取案件材料",
  BUILD_TIMELINE: "整理答复时间线",
  RESOLVE_CURRENT_OA: "确定本次审查意见",
  RESOLVE_CURRENT_CLAIMS: "确定当前权利要求",
  EXTRACT_OA_ISSUES: "提取审查意见的争点",
  BUILD_EVIDENCE_MATRIX: "逐项特征核对对比文件",
  GENERATE_STRATEGIES: "拟定答复策略",
  BUILD_AMENDMENT_PLAN: "拟定权利要求修改方案",
  DRAFT_STATEMENT: "起草意见陈述书正文",
  BUILD_DOCX: "生成 Word 文档",
  RENDER_DOCX: "生成 PDF 预览",
  COMPLETE: "收尾"
};

/** 2 分 41 秒 */
function duration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  if (total < 60) return `${total} 秒`;
  return `${Math.floor(total / 60)} 分 ${total % 60} 秒`;
}

function secondsBetween(from: string, to: Date): number {
  return (to.getTime() - new Date(from).getTime()) / 1000;
}

export function RunView({ runId }: { runId: string }) {
  const [run, setRun] = useState<Run | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(() => fetch(`/api/runs/${runId}`)
    .then(async (response) => {
      const value = await response.json();
      if (!response.ok) throw new Error(value.error?.message ?? "读取生成进度失败");
      setRun(value.run);
      setSteps(value.steps ?? []);
      setArtifacts(value.artifacts ?? []);
    })
    .catch((cause) => setError(cause.message)), [runId]);

  const terminalStatuses = ["COMPLETED", "FAILED", "QA_FAILED", "CANCELLED"];

  useEffect(() => {
    load();
    const timer = setInterval(() => {
      if (!run || !terminalStatuses.includes(run.status)) load();
    }, 2000);
    return () => clearInterval(timer);
    // terminalStatuses is a literal list; re-subscribing on run is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, run]);

  // A ticking clock is what tells the user the page is alive: a long model call
  // can take minutes and the stage list alone looks frozen.
  useEffect(() => {
    if (run && terminalStatuses.includes(run.status)) return;
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.status]);

  if (error) return <div className="notice error">{error}</div>;
  if (!run) return <div className="card empty">正在读取生成进度…</div>;

  const terminal = ["COMPLETED", "FAILED", "QA_FAILED", "CANCELLED"].includes(run.status);
  const docx = artifacts.find((artifact) => artifact.type === "STATEMENT_DOCX" && artifact.downloadable);
  const pdf = artifacts.find((artifact) => artifact.type === "RENDERED_PDF" && artifact.downloadable);
  const title = docx ? "意见陈述书已生成" : terminal ? "本次生成未完成" : "正在生成意见陈述书";
  const kb = (value: number | null) => (value ? `${Math.round(value / 1024)} KB` : "");
  const runningStep = steps.find((step) => step.status === "RUNNING") ?? undefined;

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

      {!docx && terminal && (
        <div className="notice error" style={{ marginTop: 12 }}>
          本次生成未完成，请返回案件重新生成或联系管理员。错误编号：{run.userMessage ?? `RUN-${run.id.slice(0, 4).toUpperCase()}`}{run.errorCode ? ` · 原因：${run.errorCode}` : ""}
        </div>
      )}

      {!terminal && (
        <div className="notice" style={{ marginTop: 12 }}>
          <RefreshCw size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
          页面会自动更新，可以离开再回来。一次完整生成通常需要 3–8 分钟。
        </div>
      )}

      <section className="card" style={{ marginTop: 12 }}>
        <div className="section-head">
          <h3>生成进度</h3>
          <span className="muted" style={{ fontSize: 12 }}>
            {terminal
              ? `用时 ${duration(secondsBetween(run.createdAt, run.finishedAt ? new Date(run.finishedAt) : now))}`
              : `已用 ${duration(secondsBetween(run.createdAt, now))}`}
          </span>
        </div>
        {!terminal && runningStep && (
          <div className="notice" style={{ marginBottom: 10, fontSize: 12.5 }}>
            正在{stepLabels[runningStep.stepKey] ?? runningStep.stepKey}
            {runningStep.startedAt ? ` · 本步已用 ${duration(secondsBetween(runningStep.startedAt, now))}` : ""}
          </div>
        )}
        <div className="timeline">
          {stages.map((stage, index) => {
            const rows = stage.keys.map((key) => steps.find((step) => step.stepKey === key));
            const states = rows.map((row) => row?.status);
            const done = states.length > 0 && states.every((value) => value === "SUCCEEDED");
            const active = (!done && states.some((value) => value === "RUNNING"))
              || (!terminal && !states.some(Boolean) && stages.slice(0, index).every((previous) => previous.keys.every((key) => steps.find((step) => step.stepKey === key)?.status === "SUCCEEDED")));
            const failed = states.some((value) => value === "FAILED");
            const startedAt = rows.map((row) => row?.startedAt).filter((value): value is string => Boolean(value)).sort()[0];
            const allFinished = rows.map((row) => row?.finishedAt).filter((value): value is string => Boolean(value));
            const endedAt = done && allFinished.length === rows.length ? allFinished.sort().slice(-1)[0] : undefined;
            const inner = rows.find((row) => row?.status === "RUNNING");
            return (
              <div className={`step ${done ? "done" : active ? "active" : ""}`} key={stage.name}>
                <span className="dot" style={failed ? { background: "var(--red)" } : undefined} />
                <div>
                  {stage.name}
                  {endedAt && startedAt && <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>{duration(secondsBetween(startedAt, new Date(endedAt)))}</span>}
                  {active && !terminal && (
                    <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>
                      {inner ? `${stepLabels[inner.stepKey] ?? inner.stepKey}…` : "进行中…"}
                    </span>
                  )}
                  {failed && <span className="muted" style={{ marginLeft: 6, fontSize: 12 }}>未完成</span>}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
