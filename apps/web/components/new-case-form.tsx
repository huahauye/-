"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function NewCaseForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const response = await fetch("/api/cases", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: data.get("title") || null,
        applicationNo: data.get("applicationNo") || null,
        internalCaseNo: data.get("internalCaseNo") || null
      })
    });
    const value = await response.json();
    if (response.ok) router.push(`/cases/${value.case.id}`);
    else {
      setError(value.error?.message ?? "创建失败");
      setBusy(false);
    }
  }

  return (
    <form className="card form" onSubmit={submit}>
      <div>
        <h2>新建案件</h2>
        <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>先建一个案件占位，材料上传后系统会自动识别申请号与名称。</p>
      </div>
      <div className="field">
        <label htmlFor="title">案件名称</label>
        <input className="input" id="title" name="title" placeholder="例如：多模态目标检测方法" />
        <span className="hint">选填，便于在案件列表中辨认。</span>
      </div>
      <div className="form-row">
        <div className="field">
          <label htmlFor="applicationNo">申请号</label>
          <input className="input" id="applicationNo" name="applicationNo" placeholder="可稍后由材料自动识别" />
        </div>
        <div className="field">
          <label htmlFor="internalCaseNo">内部案件编号</label>
          <input className="input" id="internalCaseNo" name="internalCaseNo" placeholder="选填" />
        </div>
      </div>
      {error && <div className="notice error">{error}</div>}
      <div style={{ display: "flex", gap: 10 }}>
        <button className="button" disabled={busy}>{busy ? "正在创建…" : "创建并上传材料"}</button>
      </div>
    </form>
  );
}
