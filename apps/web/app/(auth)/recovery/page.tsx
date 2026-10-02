import Link from "next/link"; import { AuthForm } from "@/components/auth-form";
export default function Page(){return <div className="auth-wrap"><section className="card auth-card"><span className="eyebrow">账户安全</span><h1>修改密码</h1><p className="muted">输入当前密码与新密码。忘记密码时请联系管理员在服务器上重置。</p><AuthForm mode="password"/><p className="muted"><Link href="/cases">返回案件</Link></p></section></div>}
