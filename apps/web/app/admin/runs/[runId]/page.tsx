"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function Page({ params }: { params: Promise<{ runId: string }> }) {
  const [id, setId] = useState("");
  const [data, setData] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    params.then((value) => {
      setId(value.runId);
      fetch(`/api/admin/runs/${value.runId}`).then((response) => response.json()).then(setData);
    });
  }, [params]);

  return (
    <>
      <div className="page-head" style={{ alignItems: "flex-start" }}>
        <div>
          <span className="eyebrow">Admin · 运行调试</span>
          <h1 className="page-title" style={{ marginTop: 2 }}>Run {id.slice(0, 8)}</h1>
          <p className="page-sub">原始调试数据，仅用于排查问题。</p>
        </div>
        <Link className="button ghost sm" href="/admin/runs">返回列表</Link>
      </div>
      <section className="card" style={{ padding: 0 }}>
        <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, overflow: "auto", margin: 0, padding: 16, color: "var(--text-2)" }}>
          {data ? JSON.stringify(data, null, 2) : "正在读取…"}
        </pre>
      </section>
    </>
  );
}
