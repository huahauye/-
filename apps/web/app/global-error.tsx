"use client";

/**
 * Last-resort error boundary. Next renders this in place of the root layout, so
 * it must provide its own <html>/<body> and must not depend on app-wide chrome
 * (the top bar reads router state that does not exist at this level).
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="zh-CN">
      <body style={{ margin: 0, background: "#f6f7f9", color: "#111827", fontFamily: '"PingFang SC","Noto Sans SC","Microsoft YaHei",system-ui,sans-serif' }}>
        <main style={{ maxWidth: 560, margin: "0 auto", padding: "72px 20px" }}>
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 26 }}>
            <div style={{ color: "#6d28d9", fontSize: 12, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" }}>出错</div>
            <h1 style={{ fontSize: 20, fontWeight: 750, margin: "6px 0 8px" }}>页面出现异常</h1>
            <p style={{ color: "#6b7280", fontSize: 13, lineHeight: 1.7, margin: 0 }}>
              请重试一次；如果问题持续存在，请把下方的错误编号告知管理员。
            </p>
            <p style={{ color: "#6b7280", fontSize: 12, margin: "12px 0 18px" }}>错误编号：{error.digest ?? "—"}</p>
            <button
              onClick={() => reset()}
              style={{ minHeight: 36, padding: "0 14px", border: "1px solid transparent", borderRadius: 8, background: "#6d28d9", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
            >
              重试
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
