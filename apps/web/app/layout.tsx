import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "集智 · 审通答复工作台",
  description: "中国发明专利审查意见（OA）分析与意见陈述书生成"
};

/**
 * The root layout only provides the document shell.
 *
 * Chrome lives in the route groups: the marketing site brings its own header,
 * the (app) and admin areas bring the workbench top bar. Rendering the app bar
 * here would stack two headers on the public page.
 */
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
