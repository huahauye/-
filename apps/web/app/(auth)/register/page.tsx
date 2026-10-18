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
            <div className="brand-sub">创建新账户</div>
          </div>
        </div>
        <h2 style={{ marginBottom: 2 }}>开始整理审通案件</h2>
        <p className="muted" style={{ margin: "0 0 16px", fontSize: 12.5 }}>使用邮箱与密码注册，注册后即可登录上传材料。</p>
        <AuthForm mode="register" />
        <p className="auth-foot">已有账户？ <Link href="/login">返回登录</Link></p>
      </section>
    </div>
  );
}
