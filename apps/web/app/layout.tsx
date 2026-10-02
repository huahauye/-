import type { Metadata } from "next";
import Link from "next/link";
import { Scale } from "lucide-react";
import { AuthNav } from "@/components/auth-nav";
import { hasSession } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = { title: "审通答复工作台", description: "中国发明专利 OA 答复工作流" };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // The site chrome is rendered only for a signed-in session: showing 案件 / 管理 /
  // 账户 / 退出 on the login page was both confusing and wrong.
  const signedIn = await hasSession();
  return (
    <html lang="zh-CN">
      <body>
        <header className="shell topbar">
          <Link href={signedIn ? "/cases" : "/login"} className="brand"><span className="brand-mark"><Scale size={20} /></span><span>审通答复工作台</span></Link>
          {signedIn ? <AuthNav /> : <nav className="nav"><Link href="/login">登录</Link><Link href="/register">注册</Link></nav>}
        </header>
        <main className="shell">{children}</main>
      </body>
    </html>
  );
}
