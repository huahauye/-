"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function AuthNav() {
  const router = useRouter();
  return <nav className="nav">
    <Link href="/cases">案件</Link>
    <Link href="/admin">管理</Link>
    <Link href="/account">账户</Link>
    <button onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); router.push("/login"); router.refresh(); }}>退出</button>
  </nav>;
}
