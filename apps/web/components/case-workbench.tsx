"use client";
import Link from "next/link";
import { ChangeEvent, DragEvent, useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, FileText, Loader2, Play, UploadCloud } from "lucide-react";
import { sha256HexOfBytes } from "@/lib/sha256";

type CaseData = { id: string; title: string | null; applicationNo: string | null; status: string; currentOaDocumentId: string | null; currentClaimVersionId: string | null; currentOaConfirmed: boolean; currentClaimsConfirmed: boolean };
type DocumentRow = { document: { id: string; role: string; displayName: string | null; oaRound: number | null; priorArtLabel: string | null; userConfirmed: boolean }; version: { id: string; originalFilename: string; parseStatus: string; uploadStatus: string } | null };
type Readiness = { status: string; checks: Array<{ code: string; status: string; message: string }> };
type Claim = { id: string; label: string | null; ordinal: number; confidence: string; isCurrent: boolean };
type Run = { id: string; status: string; createdAt: string };
type CaseSummary = { id: string; title: string | null; applicationNo: string | null; status: string; updatedAt: string };

const roles = ["UNKNOWN", "APPLICATION_ORIGINAL", "OFFICE_ACTION", "RESPONSE_STATEMENT", "CLAIMS_CURRENT", "CLAIMS_REPLACEMENT", "CLAIMS_COMPARISON", "PRIOR_ART", "OTHER"];
const roleLabels: Record<string, string> = {
  UNKNOWN: "待识别", APPLICATION_ORIGINAL: "本申请", OFFICE_ACTION: "审查意见", RESPONSE_STATEMENT: "历史答复",
  CLAIMS_CURRENT: "当前权利要求", CLAIMS_REPLACEMENT: "权利要求替换页", CLAIMS_COMPARISON: "权利要求对照",
  PRIOR_ART: "对比文件", OTHER: "其他"
};
const caseStatusLabel: Record<string, string> = {
  INCOMPLETE: "材料未齐", NEEDS_CONFIRMATION: "待确认", READY: "材料已就绪", PROCESSING: "处理中", COMPLETED: "已完成", FAILED: "需处理"
};
const runStatusLabel: Record<string, string> = {
  QUEUED: "排队中", ANALYZING: "分析中", DRAFTING: "起草中", QUALITY_CHECK: "质检中",
  GENERATING_DOCUMENT: "生成文件中", COMPLETED: "已生成", QA_FAILED: "已生成（附提示）", FAILED: "未完成", CANCELLED: "已取消"
};

function parseState(row: DocumentRow): string {
  if (!row.version) return "解析中";
  if (row.version.parseStatus === "PARSED") return "已解析";
  if (row.version.parseStatus === "FAILED") return "解析失败";
  return "解析中";
}

export function CaseWorkbench({ caseId }: { caseId: string }) {
  const [patentCase, setCase] = useState<CaseData | null>(null);
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [caseList, setCaseList] = useState<CaseSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [unavailable, setUnavailable] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(() => {
    Promise.all([
      fetch(`/api/cases/${caseId}`),
      fetch(`/api/cases/${caseId}/documents`),
      fetch(`/api/cases/${caseId}/readiness`),
      fetch(`/api/cases/${caseId}/claim-versions`),
      fetch(`/api/cases/${caseId}/runs`),
      fetch("/api/cases")
    ]).then(async ([caseResponse, documentResponse, readinessResponse, claimResponse, runResponse, listResponse]) => {
      if (caseResponse.status === 401) { location.href = "/login"; return; }
      if (!caseResponse.ok) { setUnavailable(true); return; }
      const readinessValue = await readinessResponse.json();
      setUnavailable(false);
      setCase((await caseResponse.json()).case ?? null);
      setDocs((await documentResponse.json()).documents ?? []);
      setReadiness(readinessValue && Array.isArray(readinessValue.checks) ? readinessValue : null);
      setClaims((await claimResponse.json()).claimVersions ?? []);
      setRuns((await runResponse.json()).runs ?? []);
      if (listResponse.ok) setCaseList((await listResponse.json()).cases ?? []);
    }).catch(() => setUnavailable(true));
  }, [caseId]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 4000);
    return () => clearInterval(timer);
  }, [load]);

  async function uploadFiles(files: File[]) {
    if (!files.length) return;
    setBusy(true);
    setMessage("");
    try {
      for (const file of files) {
        const digest = await sha256HexOfBytes(new Uint8Array(await file.arrayBuffer()));
        const init = await fetch(`/api/cases/${caseId}/uploads/init`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ filename: file.name, mimeType: file.type || "application/octet-stream", size: file.size, sha256: digest })
        });
        const value = await init.json();
        if (!init.ok) throw new Error(value.error?.message ?? "上传初始化失败");
        const put = await fetch(value.uploadUrl, { method: "PUT", headers: value.requiredHeaders, body: file });
        if (!put.ok) throw new Error((await put.json().catch(() => ({}))).error?.message ?? "文件上传失败");
        const done = await fetch(`/api/cases/${caseId}/uploads/complete`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ documentVersionId: value.documentVersionId })
        });
        if (!done.ok) throw new Error((await done.json()).error?.message ?? "上传校验失败");
      }
      setMessage("文件已上传，正在解析和识别。");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "上传失败");
    } finally {
      setBusy(false);
    }
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    event.target.value = "";
    await uploadFiles(files);
  }

  async function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    await uploadFiles([...event.dataTransfer.files]);
  }

  async function classify(documentId: string, role: string, priorArtLabel?: string | null) {
    await fetch(`/api/cases/${caseId}/documents/${documentId}/classification`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ role, oaRound: role === "OFFICE_ACTION" ? 1 : null, priorArtLabel: role === "PRIOR_ART" ? (priorArtLabel ?? "D1") : null })
    });
    await load();
  }

  async function selectOa(documentId: string) {
    await fetch(`/api/cases/${caseId}/current-oa`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ documentId }) });
    await load();
  }

  async function selectClaims(claimVersionId: string) {
    await fetch(`/api/cases/${caseId}/current-claims`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ claimVersionId }) });
    await load();
  }

  async function generate() {
    setBusy(true);
    const response = await fetch(`/api/cases/${caseId}/runs`, { method: "POST" });
    const value = await response.json();
    if (response.ok) location.href = `/runs/${value.runId}`;
    else { setMessage(value.error?.message ?? "创建运行失败"); setBusy(false); }
  }

  if (unavailable) {
    return <section className="card" style={{ maxWidth: 560 }}>
      <h2>找不到该案件</h2>
      <p className="muted">案件可能已被删除，或者它不属于当前登录的账户。</p>
      <Link className="button ghost" href="/cases">返回案件列表</Link>
    </section>;
  }

  const oaDocs = docs.filter((row) => row.document.role === "OFFICE_ACTION");
  const currentOa = docs.find((row) => row.document.id === patentCase?.currentOaDocumentId) ?? (oaDocs.length === 1 ? oaDocs[0] : undefined);
  const applicationDoc = docs.find((row) => row.document.role === "APPLICATION_ORIGINAL");
  const priorArt = docs.filter((row) => row.document.role === "PRIOR_ART");
  const responseDocs = docs.filter((row) => row.document.role === "RESPONSE_STATEMENT");
  const isReady = readiness?.status === "READY";
  const hasRun = runs.some((run) => run.status === "COMPLETED" || run.status === "QA_FAILED");
  const steps = [
    { label: "上传材料", done: docs.length > 0 },
    { label: "审查意见分析", done: Boolean(currentOa && patentCase?.currentClaimVersionId && patentCase?.currentOaConfirmed && patentCase?.currentClaimsConfirmed) },
    { label: "生成答复", done: hasRun }
  ];
  const currentStep = steps.findIndex((step) => !step.done);

  return (
    <div className="case-layout">
      <aside className="card" style={{ padding: 12 }}>
        <div className="side-title">最近案件</div>
        <div>
          {caseList.slice(0, 8).map((item) => (
            <Link href={`/cases/${item.id}`} key={item.id} className={`case-item${item.id === caseId ? " active" : ""}`}>
              <div className="case-item-title">{item.title || "未命名案件"}</div>
              <div className="case-item-meta">{item.applicationNo || "无申请号"} · {caseStatusLabel[item.status] ?? item.status}</div>
            </Link>
          ))}
          {caseList.length === 0 && <div className="empty" style={{ padding: "18px 8px" }}>暂无其他案件</div>}
        </div>
        <div className="divider" />
        <div className="side-title">本案件生成记录</div>
        <div>
          {runs.slice(0, 6).map((run) => (
            <Link href={`/runs/${run.id}`} key={run.id} className="case-item">
              <div className="case-item-title">{runStatusLabel[run.status] ?? run.status}</div>
              <div className="case-item-meta">{new Date(run.createdAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</div>
            </Link>
          ))}
          {runs.length === 0 && <div className="empty" style={{ padding: "18px 8px" }}>还没有生成记录</div>}
        </div>
        <div className="divider" />
        <Link className="button ghost block sm" href="/cases">全部案件</Link>
      </aside>

      <div>
        <div className="page-head" style={{ marginBottom: 12 }}>
          <div>
            <span className="eyebrow">{patentCase?.applicationNo || "申请号待识别"}</span>
            <h1 className="page-title" style={{ marginTop: 2 }}>{patentCase?.title || "未命名案件"}</h1>
            <p className="page-sub">材料版本保持不可变；替换文件会创建新版本。</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className={`badge ${isReady ? "good" : "warn"}`}>{isReady ? "材料已就绪" : "需要补充或确认"}</span>
            <button className="button" disabled={!isReady || busy} onClick={generate}>
              {busy ? <Loader2 size={16} /> : <Play size={16} />}生成意见陈述书
            </button>
          </div>
        </div>

        <div className="wizard">
          {steps.map((step, index) => (
            <div key={step.label} style={{ display: "contents" }}>
              <div className={`wizard-step${step.done ? " done" : ""}${!step.done && index === currentStep ? " current" : ""}`}>
                <span className="wizard-dot">{step.done ? "✓" : index + 1}</span>
                {step.label}
              </div>
              {index < steps.length - 1 && <span className="wizard-line" />}
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 300px", gap: 14, alignItems: "start" }}>
          <div className="grid">
            <section className="card">
              <div className="section-head">
                <div><h3>上传材料</h3><div className="muted" style={{ fontSize: 12.5 }}>PDF、DOC 或 DOCX，支持批量上传与拖拽</div></div>
                <button className="button ghost sm" onClick={() => inputRef.current?.click()} disabled={busy}>选择文件</button>
              </div>
              <label
                className="dropzone"
                onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                style={dragging ? { borderColor: "#7c3aed", background: "#f5f3ff" } : undefined}
              >
                <UploadCloud size={22} color="#7c3aed" />
                <div style={{ fontWeight: 600, marginTop: 6 }}>{busy ? "正在上传…" : "拖拽文件到此处，或点击选择"}</div>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>上传后系统会自动识别文件类型，可随时纠正</div>
                <input ref={inputRef} hidden type="file" multiple accept=".pdf,.doc,.docx" onChange={upload} disabled={busy} />
              </label>
              {message && <div className={message.includes("失败") ? "notice error" : "notice ok"} style={{ marginTop: 10 }}>{message}</div>}
            </section>

            <section className="card">
              <div className="section-head"><h3>关键材料</h3><span className="muted" style={{ fontSize: 12 }}>已识别 {docs.length} 份</span></div>
              <div className="slot-list">
                <div className={`slot${currentOa ? " filled" : " empty-slot"}`}>
                  <span className="slot-icon"><FileText size={15} /></span>
                  <div className="slot-main">
                    <div className="slot-label">本次审查意见通知书</div>
                    <div className="slot-name">{currentOa?.version?.originalFilename ?? "尚未上传"}</div>
                  </div>
                  <div className="slot-actions">
                    {currentOa ? <span className="badge good">{currentOa.document.id === patentCase?.currentOaDocumentId ? "当前 OA" : parseState(currentOa)}</span> : <span className="badge neutral">待上传</span>}
                    {oaDocs.filter((row) => row.document.id !== patentCase?.currentOaDocumentId).map((row) => (
                      <button key={row.document.id} className="button ghost sm" onClick={() => selectOa(row.document.id)}>选为当前</button>
                    ))}
                  </div>
                </div>

                <div className={`slot${applicationDoc ? " filled" : " empty-slot"}`}>
                  <span className="slot-icon"><FileText size={15} /></span>
                  <div className="slot-main">
                    <div className="slot-label">本申请文件</div>
                    <div className="slot-name">{applicationDoc?.version?.originalFilename ?? "尚未上传"}</div>
                  </div>
                  <div className="slot-actions"><span className={applicationDoc ? "badge good" : "badge neutral"}>{applicationDoc ? parseState(applicationDoc) : "待上传"}</span></div>
                </div>

                {[1, 2, 3].map((index) => {
                  const label = `D${index}`;
                  const doc = priorArt.find((row) => row.document.priorArtLabel === label) ?? (priorArt.length === index - 1 ? priorArt[index - 1] : undefined);
                  return <div className={`slot${doc ? " filled" : " empty-slot"}`} key={label}>
                    <span className="slot-icon"><FileText size={15} /></span>
                    <div className="slot-main">
                      <div className="slot-label">对比文件 {label}</div>
                      <div className="slot-name">{doc?.version?.originalFilename ?? "尚未上传"}</div>
                    </div>
                    <div className="slot-actions"><span className={doc ? "badge good" : "badge neutral"}>{doc ? parseState(doc) : "待上传"}</span></div>
                  </div>;
                })}

                {responseDocs.length > 0 && <div className="slot filled">
                  <span className="slot-icon"><FileText size={15} /></span>
                  <div className="slot-main">
                    <div className="slot-label">历史答复</div>
                    <div className="slot-name">{responseDocs.map((row) => row.version?.originalFilename).filter(Boolean).join("、")}</div>
                  </div>
                  <div className="slot-actions"><span className="badge neutral">{responseDocs.length} 份</span></div>
                </div>}
              </div>
            </section>

            <section className="card" style={{ padding: 0 }}>
              <div className="section-head" style={{ padding: "14px 16px 0", marginBottom: 6 }}>
                <h3>材料清单与识别结果</h3>
                <span className="muted" style={{ fontSize: 12 }}>可纠正文件类型；替换文件请重新上传</span>
              </div>
              {docs.length === 0 ? <div className="empty">尚未上传材料</div> : <div style={{ padding: "4px 16px 12px" }}>
                {docs.map((row) => (
                  <div className="file-row" key={`${row.document.id}-${row.version?.id ?? "v"}`}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="file-name">{row.version?.originalFilename || row.document.displayName || "未命名文件"}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{parseState(row)}{row.document.userConfirmed ? " · 已人工确认" : ""}</div>
                    </div>
                    <select className="input" style={{ width: 124, flex: "0 0 auto" }} value={row.document.role} onChange={(event) => classify(row.document.id, event.target.value, row.document.priorArtLabel)}>
                      {roles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
                    </select>
                    {row.document.role === "PRIOR_ART" && (
                      <select className="input" style={{ width: 68, flex: "0 0 auto" }} value={row.document.priorArtLabel ?? "D1"} onChange={(event) => classify(row.document.id, "PRIOR_ART", event.target.value)}>
                        {["D1", "D2", "D3", "D4", "D5"].map((label) => <option key={label} value={label}>{label}</option>)}
                      </select>
                    )}
                    {row.document.role === "OFFICE_ACTION" && row.document.id !== patentCase?.currentOaDocumentId && (
                      <button className="button ghost sm" onClick={() => selectOa(row.document.id)}>选为当前</button>
                    )}
                    {row.document.role === "OFFICE_ACTION" && row.document.id === patentCase?.currentOaDocumentId && <span className="badge good">当前 OA</span>}
                  </div>
                ))}
              </div>}
              {claims.length > 0 && <>
                <div className="divider" style={{ margin: "0 16px" }} />
                <div className="section-head" style={{ padding: "12px 16px 4px", marginBottom: 0 }}><h3>权利要求版本</h3></div>
                <div style={{ padding: "0 16px 12px" }}>
                  {claims.map((claim) => (
                    <div className="file-row" key={claim.id}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="file-name">{claim.label || `版本 ${claim.ordinal}`}</div>
                        <div className="muted" style={{ fontSize: 12 }}>识别置信度 {Math.round(Number(claim.confidence) * 100)}%</div>
                      </div>
                      {patentCase?.currentClaimVersionId === claim.id
                        ? <span className="badge good">当前版本</span>
                        : <button className="button ghost sm" onClick={() => selectClaims(claim.id)}>确认使用</button>}
                    </div>
                  ))}
                </div>
              </>}
            </section>
          </div>

          <aside className="grid">
            <section className="card">
              <div className="section-head"><h3>材料检查</h3></div>
              {(readiness?.checks ?? []).map((check) => (
                <div className={`check${check.status === "BLOCKER" ? " blocker" : ""}`} key={check.code}>
                  <span className="check-icon">{check.status === "PASS" ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}</span>
                  <div>
                    <strong>{check.message}</strong>
                    {check.status !== "PASS" && <div className="muted" style={{ fontSize: 11.5, marginTop: 1 }}>需要补充或确认后才能生成</div>}
                  </div>
                </div>
              ))}
              {!readiness && <div className="empty" style={{ padding: "18px 0" }}>正在检查材料…</div>}
              <div style={{ marginTop: 14 }}>
                <button className="button block" disabled={!isReady || busy} onClick={generate}>
                  {busy ? <Loader2 size={16} /> : <Play size={16} />}生成意见陈述书
                </button>
                <p className="muted" style={{ fontSize: 12, marginTop: 8, lineHeight: 1.6 }}>
                  输出为供专利代理师复核的可编辑 DOCX 工作稿，不自动提交，也不承诺授权。
                </p>
              </div>
            </section>

            <section className="card">
              <div className="section-head"><h3>材料概况</h3><span className="muted" style={{ fontSize: 12 }}>{docs.length} 份</span></div>
              <dl className="kv" style={{ gridTemplateColumns: "84px minmax(0,1fr)", fontSize: 12.5 }}>
                <dt>审查意见</dt><dd>{oaDocs.length} 份</dd>
                <dt>本申请</dt><dd>{applicationDoc ? 1 : 0} 份</dd>
                <dt>对比文件</dt><dd>{priorArt.length} 份</dd>
                <dt>历史答复</dt><dd>{responseDocs.length} 份</dd>
                <dt>权利要求</dt><dd>{claims.length} 个版本</dd>
              </dl>
              <div className="divider" style={{ margin: "12px 0" }} />
              <div className="muted" style={{ fontSize: 12, lineHeight: 1.7 }}>
                材料版本不可变：替换文件会生成新版本，旧版本仍可追溯，历史生成不受影响。
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
