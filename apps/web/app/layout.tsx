import type { Metadata } from "next";
import { TopNav } from "@/components/top-nav";
import { currentUser } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "集智 · 审通答复工作台",
  description: "中国发明专利审查意见（OA）分析与意见陈述书生成"
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // 顶部导航需要用户身份来切换“登录/注册”与头像菜单，并决定是否显示管理入口。
  const user = await currentUser();
  return (
    <html lang="zh-CN">
      <body>
        <TopNav user={user ? { email: user.email, role: user.role } : null} />
        <main className="shell page">{children}</main>
      </body>
    </html>
  );
}
