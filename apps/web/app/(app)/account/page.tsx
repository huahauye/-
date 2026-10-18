import Link from "next/link";
import { currentUser } from "@/lib/auth";

export default async function Page() {
  const user = await currentUser();
  return (
    <div style={{ maxWidth: 720 }}>
      <div className="page-head" style={{ alignItems: "flex-start" }}>
        <div>
          <span className="eyebrow">账户</span>
          <h1 className="page-title" style={{ marginTop: 2 }}>账户与数据</h1>
          <p className="page-sub">查看当前登录状态与数据安全边界。</p>
        </div>
        <Link className="button ghost sm" href="/cases">返回案件</Link>
      </div>

      <section className="card" style={{ marginBottom: 12 }}>
        <div className="section-head"><h3>登录信息</h3></div>
        <dl className="kv">
          <dt>邮箱</dt><dd>{user?.email ?? "—"}</dd>
          <dt>角色</dt><dd>{user?.role === "ADMIN" ? "管理员" : "普通用户"}</dd>
          <dt>会话</dt><dd>服务器端会话，退出登录后立即失效</dd>
        </dl>
        <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link className="button ghost sm" href="/recovery">修改密码</Link>
          {user?.role === "ADMIN" && <Link className="button ghost sm" href="/admin">系统管理</Link>}
        </div>
      </section>

      <section className="card">
        <div className="section-head"><h3>安全边界</h3></div>
        <div className="check"><span className="check-icon">✓</span><div><strong>密码不落明文</strong><div className="muted" style={{ fontSize: 12.5 }}>账户密码在本服务数据库中保存为 scrypt 哈希。</div></div></div>
        <div className="check"><span className="check-icon">✓</span><div><strong>材料私有存放</strong><div className="muted" style={{ fontSize: 12.5 }}>案件文件保存在私有对象存储中，仅通过服务端短时链接按需读取。</div></div></div>
        <div className="check"><span className="check-icon">✓</span><div><strong>案件按账户隔离</strong><div className="muted" style={{ fontSize: 12.5 }}>每个案件只对所属账户可见，删除后立即禁止访问并进入清理队列。</div></div></div>
        <div className="check"><span className="check-icon">✓</span><div><strong>答复需人工复核</strong><div className="muted" style={{ fontSize: 12.5 }}>生成的 DOCX 为工作稿，系统不会自动提交至官方系统，也不承诺授权结果。</div></div></div>
      </section>
    </div>
  );
}
