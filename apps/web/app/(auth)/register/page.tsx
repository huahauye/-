import Link from "next/link"; import { AuthForm } from "@/components/auth-form";
export default function Page(){return <div className="auth-wrap"><section className="card auth-card"><span className="eyebrow">创建账户</span><h1>开始整理审通案件</h1><p className="muted">使用邮箱与密码注册，注册后即可登录。</p><AuthForm mode="register"/><p className="muted">已有账户？ <Link href="/login">返回登录</Link></p></section></div>}
