"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

type Row = Record<string, unknown>;

export default function Page() {
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/model-profiles")
      .then((response) => response.json())
      .then((value) => setItems(value.profiles ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <div className="page-head" style={{ alignItems: "flex-start" }}>
        <div>
          <span className="eyebrow">Admin</span>
          <h1 className="page-title" style={{ marginTop: 2 }}>模型配置</h1>
          <p className="page-sub">按用途指定模型；密钥只以引用形式保存，不回显明文。</p>
        </div>
        <Link className="button ghost sm" href="/admin">返回管理</Link>
      </div>
      <section className="card" style={{ padding: 0 }}>
        {loading ? <div className="empty">正在读取…</div> : items.length === 0 ? <div className="empty">还没有配置</div> : (
          <table className="table">
            <thead><tr><th>名称</th><th>用途</th><th>供应商</th><th>模型</th><th>密钥</th></tr></thead>
            <tbody>
              {items.map((item) => (
                <tr key={String(item.id)}>
                  <td>{String(item.name)}</td>
                  <td className="muted">{String(item.purpose)}</td>
                  <td className="muted">{String(item.provider)}</td>
                  <td>{String(item.model)}</td>
                  <td className="muted">{String(item.secretAvailability)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
