import type { Metadata } from "next";
import Link from "next/link";
import { Scale } from "lucide-react";
import { AuthNav } from "@/components/auth-nav";
import "./globals.css";

export const metadata: Metadata = { title: "审通答复工作台", description: "中国发明专利 OA 答复工作流" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body><header className="shell topbar"><Link href="/cases" className="brand"><span className="brand-mark"><Scale size={20}/></span><span>审通答复工作台</span></Link><AuthNav /></header><main className="shell">{children}</main></body></html>;
}
