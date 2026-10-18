"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

type Row = Record<string, unknown>;

const statusLabel: Record<string, string> = {
  QUEUED: "排队中", ANALYZING: "分析中", DRAFTING: "起草中", QUALITY_CHECK: "质检中",
  GENERATING_DOCUMENT: "生成文件中", COMPLETED: "已生成", QA_FAILED: "已生成（附提示）",
  FAILED: "未完成", CANCELLED: "已取消"
};

export default function Page() {
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/runs")
      .then((response) => response.json())
      .then((value) => setItems(value.runs ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <div className="page-head" style={{ alignItems: "flex-start" }}>
        <div>
          <span className="eyebrow">Admin</span>
          <h1 className="page-title" style={{ marginTop: 2 }}>运行调试</h1>
          <p className="page-sub">最近的全部生成记录，点开可看每一步的实际状态与产物。</p>
        </div>
        <Link className="button ghost sm" href="/admin">返回管理</Link>
      </div>
      <section className="card" style={{ padding: 0 }}>
        {loading ? <div className="empty">正在读取…</div> : items.length === 0 ? <div className="empty">还没有生成记录</div> : (
          <table className="table">
            <thead><tr><th>Run</th><th>状态</th><th>案件</th><th>创建时间</th></tr></thead>
            <tbody>
              {items.map((item) => (
                <tr key={String(item.id)}>
                  <td><Link className="link" href={`/admin/runs/${String(item.id)}`}>{String(item.id).slice(0, 8)}</Link></td>
                  <td>{statusLabel[String(item.status)] ?? String(item.status)}</td>
                  <td className="muted">{String(item.caseId).slice(0, 8)}</td>
                  <td className="muted">{new Date(String(item.createdAt)).toLocaleString("zh-CN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
