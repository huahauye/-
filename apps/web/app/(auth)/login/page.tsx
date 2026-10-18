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
            <div className="brand-sub">中国发明专利 OA 分析与答复</div>
          </div>
        </div>
        <h2 style={{ marginBottom: 2 }}>继续处理案件</h2>
        <p className="muted" style={{ margin: "0 0 16px", fontSize: 12.5 }}>登录后仅可访问属于您的专利案件与生成记录。</p>
        <AuthForm mode="login" />
        <p className="auth-foot">还没有账户？ <Link href="/register">注册</Link> · <Link href="/recovery">修改密码</Link></p>
      </section>
    </div>
  );
}
