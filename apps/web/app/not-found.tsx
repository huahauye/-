import Link from "next/link";

export default function NotFound() {
  return (
    <div className="auth-wrap">
      <section className="card auth-card">
        <span className="eyebrow">404</span>
        <h1>找不到这个页面</h1>
        <p className="muted">案件可能已被删除，或者它不属于当前登录的账户。</p>
        <p className="muted"><Link href="/cases">返回案件列表</Link></p>
      </section>
    </div>
  );
}
