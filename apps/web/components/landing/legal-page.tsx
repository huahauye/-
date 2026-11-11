import Link from "next/link";

const CONTACT = "#contact";

/** 用户协议 / 隐私政策 currently share one honest, minimal page structure. */
export function LegalPage({ title, intro, sections }: { title: string; intro: string; sections: Array<{ heading: string; body: string }> }) {
  return (
    <div className="lp">
      <main className="lp-shell" style={{ maxWidth: 820, padding: "72px 0 96px" }}>
        <span className="lp-eyebrow">集智 · 审查意见答复工作台</span>
        <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-.02em", margin: "16px 0 10px" }}>{title}</h1>
        <p style={{ color: "var(--muted)", marginBottom: 28 }}>{intro}</p>
        {sections.map((section) => (
          <section key={section.heading} style={{ marginBottom: 22 }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 6px" }}>{section.heading}</h2>
            <p style={{ margin: 0, color: "var(--ink-2)", lineHeight: 1.85, fontSize: 14 }}>{section.body}</p>
          </section>
        ))}
        <p style={{ marginTop: 30, fontSize: 13, color: "var(--muted)" }}>
          本页随产品一起更新；如需正式签署版本的条款文本，请<Link href={CONTACT} className="lp-link">联系我们</Link>。
        </p>
        <p style={{ marginTop: 24 }}>
          <Link href="/" className="lp-link">← 返回首页</Link>
        </p>
      </main>
    </div>
  );
}
