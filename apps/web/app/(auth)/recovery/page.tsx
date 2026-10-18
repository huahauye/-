import Link from "next/link";
import { AuthForm } from "@/components/auth-form";

export default function Page() {
  return (
    <div className="auth-wrap">
      <section className="auth-card">
        <div className="auth-brand">
          <div className="brand-mark">集</div>
          <div style={{ textAlign: "center" }}>
            <div className="brand-name">集智 · 审通答复工作台</div>
            <div className="brand-sub">账户安全</div>
          </div>
        </div>
        <h2 style={{ marginBottom: 2 }}>修改密码</h2>
        <p className="muted" style={{ margin: "0 0 16px", fontSize: 12.5 }}>输入当前密码与新密码。忘记密码时请联系管理员在服务器上重置。</p>
        <AuthForm mode="password" />
        <p className="auth-foot"><Link href="/cases">返回案件</Link></p>
      </section>
    </div>
  );
}
