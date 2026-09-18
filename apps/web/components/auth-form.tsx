"use client";
import { FormEvent, useEffect, useState } from "react";
import { handleAuthCallback, login, requestPasswordRecovery, signup, updateUser } from "@netlify/identity";
import { useRouter } from "next/navigation";

export function AuthForm({ mode }: { mode: "login" | "register" | "recovery" }) {
  const router = useRouter(); const [email,setEmail]=useState(""); const [password,setPassword]=useState(""); const [recovery,setRecovery]=useState(false); const [message,setMessage]=useState(""); const [busy,setBusy]=useState(false);
  useEffect(()=>{handleAuthCallback().then(result=>setRecovery(result?.type==="recovery")).catch(()=>undefined)},[]);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      if (mode === "login") { await login(email,password); router.push("/cases"); router.refresh(); }
      if (mode === "register") { await signup(email,password); setMessage("注册成功，请检查邮箱并完成确认。"); }
      if (mode === "recovery" && !recovery) { await requestPasswordRecovery(email); setMessage("重置邮件已发送，请检查邮箱。"); }
      if (mode === "recovery" && recovery) { await updateUser({ password }); setMessage("密码已更新。"); router.push("/cases"); }
    } catch (error) { setMessage(error instanceof Error ? error.message : "操作未完成，请重试。"); } finally { setBusy(false); }
  }
  return <form className="form" onSubmit={submit}>
    {!recovery && <div className="field"><label>邮箱</label><input className="input" type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)}/></div>}
    {(mode!=="recovery"||recovery)&&<div className="field"><label>{recovery?"新密码":"密码"}</label><input className="input" type="password" minLength={8} autoComplete={mode==="login"?"current-password":"new-password"} required value={password} onChange={e=>setPassword(e.target.value)}/></div>}
    {message&&<div className={message.includes("成功")||message.includes("发送")||message.includes("更新")?"notice":"notice error"}>{message}</div>}
    <button className="button" disabled={busy}>{busy?"处理中…":mode==="login"?"登录":mode==="register"?"创建账户":recovery?"设置新密码":"发送重置邮件"}</button>
  </form>;
}
