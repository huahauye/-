import Link from "next/link";

export default function Page() {
  return (
    <>
      <div className="page-head" style={{ alignItems: "flex-start" }}>
        <div>
          <span className="eyebrow">Admin</span>
          <h1 className="page-title" style={{ marginTop: 2 }}>Golden Case 评测</h1>
          <p className="page-sub">发布前的质量门禁，用于确认改动没有破坏既有答复质量。</p>
        </div>
        <Link className="button ghost sm" href="/admin">返回管理</Link>
      </div>
      <section className="card" style={{ maxWidth: 720 }}>
        <h3>发布门禁</h3>
        <p className="muted" style={{ fontSize: 13 }}>
          默认要求 BLOCKER=0、元数据错误=0、Issue Coverage=100%、DOCX 构建与渲染成功。
        </p>
        <p className="muted" style={{ fontSize: 13 }}>
          真实评测材料仅上传到私有对象存储，不进入 Git；仓库中只保留脱敏样例。
        </p>
      </section>
    </>
  );
}
