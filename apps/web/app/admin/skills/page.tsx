import Link from "next/link";

export default function Page() {
  return (
    <>
      <div className="page-head" style={{ alignItems: "flex-start" }}>
        <div>
          <span className="eyebrow">Admin</span>
          <h1 className="page-title" style={{ marginTop: 2 }}>Skill 管理</h1>
          <p className="page-sub">版本化的专业规则资产。发布后的版本不可修改，新生成会冻结当时启用的版本。</p>
        </div>
        <Link className="button ghost sm" href="/admin">返回管理</Link>
      </div>
      <section className="card" style={{ maxWidth: 720 }}>
        <h3>版本化专业规则</h3>
        <p className="muted" style={{ fontSize: 13 }}>通过 Admin API 导入 ZIP；脚本会被标记并隔离，运行时只装载允许的文本资产。</p>
        <p className="muted" style={{ fontSize: 13 }}>Published 版本不可修改，新 Run 会冻结当前 Active Published 版本，便于回溯与对比。</p>
        <code style={{ display: "inline-block", marginTop: 6, padding: "6px 10px", borderRadius: 8, background: "#f3f4f6", fontSize: 12.5 }}>
          POST /api/admin/skills/:skillId/versions/import
        </code>
      </section>
    </>
  );
}
