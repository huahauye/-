"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Login, registration and password change against the self-hosted auth routes.
 * All three POST to `/api/auth/*` and rely on the same-origin guard there.
 */
export function AuthForm({ mode }: { mode: "login" | "register" | "password" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const path = mode === "login" ? "/api/auth/login" : mode === "register" ? "/api/auth/register" : "/api/auth/password";
      const payload = mode === "password" ? { currentPassword: password, newPassword } : { email, password };
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!response.ok) throw new Error(data.error?.message ?? "操作未完成，请重试。");
      if (mode === "register") {
        setMessage("账户已创建。");
        router.push("/cases");
        router.refresh();
        return;
      }
      if (mode === "password") {
        setMessage("密码已更新。");
        setPassword("");
        setNewPassword("");
        return;
      }
      router.push("/cases");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作未完成，请重试。");
    } finally {
      setBusy(false);
    }
  }

  return <form className="form" onSubmit={submit}>
    {mode !== "password" && <div className="field"><label>邮箱</label><input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>}
    <div className="field">
      <label>{mode === "password" ? "当前密码" : "密码"}</label>
      <input className="input" type="password" minLength={8} autoComplete={mode === "login" ? "current-password" : "new-password"} required value={password} onChange={(e) => setPassword(e.target.value)} />
    </div>
    {mode === "password" && <div className="field"><label>新密码</label><input className="input" type="password" minLength={8} autoComplete="new-password" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></div>}
    {message && <div className={message.includes("已") ? "notice" : "notice error"}>{message}</div>}
    <button className="button" disabled={busy}>{busy ? "处理中…" : mode === "login" ? "登录" : mode === "register" ? "创建账户" : "更新密码"}</button>
  </form>;
}
