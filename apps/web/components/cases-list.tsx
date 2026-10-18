"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { FilePlus2, Search } from "lucide-react";

type PatentCase = { id: string; title: string | null; applicationNo: string | null; internalCaseNo: string | null; status: string; updatedAt: string };

const statusLabel: Record<string, string> = {
  INCOMPLETE: "材料未齐",
  NEEDS_CONFIRMATION: "待确认",
  READY: "可生成",
  PROCESSING: "处理中",
  COMPLETED: "已完成",
  FAILED: "需处理"
};

function badgeTone(status: string): string {
  if (status === "READY" || status === "COMPLETED") return "good";
  if (status === "FAILED") return "bad";
  return "warn";
}

export function CasesList() {
  const [items, setItems] = useState<PatentCase[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetch(`/api/cases${q ? `?q=${encodeURIComponent(q)}` : ""}`)
        .then((response) => {
          if (response.status === 401) location.href = "/login";
          return response.json();
        })
        .then((value) => setItems(value.cases ?? []))
        .finally(() => setLoading(false));
    }, 180);
    return () => clearTimeout(timer);
  }, [q]);

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">案件中心</span>
          <h1 className="page-title" style={{ marginTop: 2 }}>审通案件</h1>
          <p className="page-sub">按申请组织全部材料版本、审查意见与答复记录。</p>
        </div>
        <Link className="button" href="/cases/new"><FilePlus2 size={16} />新建案件</Link>
      </div>

      <div className="search-bar">
        <div className="input" style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 11 }}>
          <Search size={16} color="#9ca3af" />
          <input
            style={{ border: 0, outline: "none", background: "transparent", flex: 1, height: "100%", fontSize: 13 }}
            placeholder="按申请号、案件名称或内部编号搜索"
            value={q}
            onChange={(event) => setQ(event.target.value)}
          />
        </div>
        <span className="muted" style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>{items.length} 个案件</span>
      </div>

      {loading ? (
        <div className="card empty">正在读取案件…</div>
      ) : items.length ? (
        <div className="case-list">
          {items.map((item) => (
            <Link className="case-card" href={`/cases/${item.id}`} key={item.id}>
              <div>
                <span className={`badge ${badgeTone(item.status)}`}>{statusLabel[item.status] ?? item.status}</span>
                <div className="list-title" style={{ marginTop: 8, fontSize: 14.5 }}>{item.title || "未命名案件"}</div>
                <div className="list-meta">{item.applicationNo || item.internalCaseNo || "尚未填写申请号"}</div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
                <span className="muted">更新于 {new Date(item.updatedAt).toLocaleDateString("zh-CN")}</span>
                <span className="muted">打开 →</span>
              </div>
            </Link>
          ))}
        </div>
      ) : q ? (
        <div className="card empty">
          <h3>没有匹配的案件</h3>
          <p style={{ margin: "4px 0 0" }}>换一个申请号或案件名称再试一次。</p>
        </div>
      ) : (
        <div className="card empty">
          <h3>还没有案件</h3>
          <p style={{ margin: "4px 0 14px" }}>创建案件后即可上传本申请、审查意见和对比文件。</p>
          <Link className="button" href="/cases/new">创建第一个案件</Link>
        </div>
      )}
    </>
  );
}
