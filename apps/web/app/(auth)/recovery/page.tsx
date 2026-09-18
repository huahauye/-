import Link from "next/link"; import { AuthForm } from "@/components/auth-form";
export default function Page(){return <div className="auth-wrap"><section className="card auth-card"><span className="eyebrow">账户恢复</span><h1>重置密码</h1><p className="muted">输入注册邮箱，我们会发送安全重置链接。</p><AuthForm mode="recovery"/><p className="muted"><Link href="/login">返回登录</Link></p></section></div>}
