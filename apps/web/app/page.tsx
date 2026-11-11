import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight, CheckCircle2, Eye, FileText, Flag, History, Layers, Route, ScanSearch, ShieldCheck, UserRound
} from "lucide-react";
import { Pricing } from "@/components/landing/pricing";
import { Reveal } from "@/components/landing/reveal";
import { Showcase } from "@/components/landing/showcase";
import { SiteHeader } from "@/components/landing/site-header";
import { WorkflowFlow } from "@/components/landing/workflow-flow";
import { ADVANTAGES, AUDIENCE, FAQ, FOOTER, HERO, KEY_VALUES } from "@/lib/landing-content";
import "./landing.css";

const valueIcons: Record<string, typeof Eye> = { scan: ScanSearch, route: Route, file: FileText };
const advantageIcons: Record<string, typeof Eye> = { flag: Flag, layers: Layers, route: Route, user: UserRound, file: FileText, history: History };

export const metadata: Metadata = {
  title: "集智 · AI 审查意见答复工作台",
  description: "面向专利代理师、专利代理机构及企业 IPR 团队的 AI 审查意见答复工作台：案件材料分析、答复策略推演与意见陈述书生成。"
};

/**
 * Marketing site (public). The workbench lives at /dashboard, so this page is
 * purely product introduction — it never reads user data.
 */
export default function Page() {
  return (
    <div className="lp">
      <SiteHeader />

      {/* 第一屏：品牌首屏 */}
      <section className="lp-hero">
        <div className="lp-shell lp-hero__grid">
          <div>
            <span className="lp-eyebrow lp-rise">{HERO.eyebrow}</span>
            <h1 className="lp-hero__title">
              {HERO.title.map((line, index) => (
                <span className={`lp-rise lp-rise--${index + 1}`} key={line}>{line}</span>
              ))}
            </h1>
            <p className="lp-hero__sub lp-rise lp-rise--3">{HERO.sub}</p>
            <p className="lp-hero__text lp-rise lp-rise--3">{HERO.text}</p>
            <div className="lp-hero__actions lp-rise lp-rise--4">
              <Link className="lp-btn lp-btn--lg" href="/register">{HERO.primary}<ArrowRight size={16} /></Link>
              <a className="lp-btn lp-btn--lg lp-btn--ghost" href="#showcase"><Eye size={16} />{HERO.secondary}</a>
            </div>
            <p className="lp-hero__note lp-rise lp-rise--4">{HERO.note}</p>
          </div>

          <div className="lp-hero__visual lp-slide-in">
            <div className="lp-shot lp-float">
              <div className="lp-shot__bar">
                <span className="lp-shot__dot" /><span className="lp-shot__dot" /><span className="lp-shot__dot" />
                <span className="lp-shot__url">集智 · 案件工作区</span>
              </div>
              <img src="/landing/case.png" alt="集智案件工作区界面：上传材料、关键材料与材料检查" />
            </div>
          </div>
        </div>
      </section>

      {/* 第二屏：核心价值 */}
      <section className="lp-section lp-section--tint" id="product">
        <div className="lp-shell">
          <div className="lp-center">
            <span className="lp-eyebrow">核心价值</span>
            <h2 className="lp-h2 lp-h2--wide">不只是生成一份答复文件，更是辅助完成审查意见分析与答复推演。</h2>
            <p className="lp-lead">三个环节对应答复工作的三个难点：看懂审查意见、想清怎么答、写成可提交的文稿。</p>
          </div>
          <div className="lp-values">
            {KEY_VALUES.map((value, index) => {
              const Icon = valueIcons[value.icon] ?? FileText;
              return (
                <Reveal key={value.no} delay={index * 90}>
                  <div className="lp-value">
                    <span className="lp-value__icon"><Icon size={20} /></span>
                    <div className="lp-value__no">{value.no}</div>
                    <h3 className="lp-value__title">{value.title}</h3>
                    <p className="lp-value__text">{value.text}</p>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* 第三屏：工作流程 */}
      <section className="lp-section" id="flow">
        <div className="lp-shell">
          <div className="lp-center">
            <span className="lp-eyebrow">功能流程</span>
            <h2 className="lp-h2 lp-h2--wide">从案件材料上传到答复文件，一套流程完成。</h2>
            <p className="lp-lead">每一步的结果都会留存，可在「分析结果」中与最终正文逐条对照。</p>
          </div>
          <WorkflowFlow />
        </div>
      </section>

      {/* 第四屏：核心功能（滚动展示） */}
      <section className="lp-section lp-section--blue" id="showcase">
        <div className="lp-shell">
          <div className="lp-center" style={{ marginBottom: 40 }}>
            <span className="lp-eyebrow">核心功能</span>
            <h2 className="lp-h2 lp-h2--wide">四个环节，对应答复工作的四件事。</h2>
            <p className="lp-lead">下方为工作台真实界面，滚动查看每一个环节。</p>
          </div>
          <Showcase />
        </div>
      </section>

      {/* 第五屏：适用对象 */}
      <section className="lp-section">
        <div className="lp-shell">
          <div className="lp-center">
            <span className="lp-eyebrow">适用对象</span>
            <h2 className="lp-h2 lp-h2--wide">为每天处理审查意见的人而做。</h2>
          </div>
          <div className="lp-audience">
            {AUDIENCE.map((item, index) => (
              <Reveal key={item.title} delay={index * 90}>
                <div className="lp-card">
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 第六屏：产品优势 */}
      <section className="lp-section lp-section--tint">
        <div className="lp-shell">
          <div className="lp-center">
            <span className="lp-eyebrow">产品优势</span>
            <h2 className="lp-h2 lp-h2--wide">为专业专利答复工作而设计。</h2>
            <p className="lp-lead">不承诺授权结果，只把分析依据、推演过程与文稿交到你手上，由代理师判断。</p>
          </div>
          <div className="lp-advantages">
            {ADVANTAGES.map((item) => {
              const Icon = advantageIcons[item.icon] ?? CheckCircle2;
              return (
                <div className="lp-advantage" key={item.title}>
                  <span className="lp-advantage__icon"><Icon size={17} /></span>
                  <div>
                    <div className="lp-advantage__title">{item.title}</div>
                    <div className="lp-advantage__text">{item.text}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 第七屏：价格方案 */}
      <section className="lp-section lp-section--blue" id="pricing">
        <div className="lp-shell">
          <div className="lp-center">
            <span className="lp-eyebrow">价格方案</span>
            <h2 className="lp-h2 lp-h2--wide">按使用次数选择，功能不做区分。</h2>
            <p className="lp-lead">四个套餐的核心答复功能保持一致，区别只在次数与有效期。</p>
          </div>
          <Pricing />
        </div>
      </section>

      {/* 第八屏：FAQ */}
      <section className="lp-section" id="faq">
        <div className="lp-shell">
          <div className="lp-center">
            <span className="lp-eyebrow">常见问题</span>
            <h2 className="lp-h2">关于集智，你可能想了解。</h2>
          </div>
          <div className="lp-faq">
            {FAQ.map((item) => (
              <details className="lp-faq__item" key={item.q}>
                <summary className="lp-faq__q">{item.q}</summary>
                <p className="lp-faq__a">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* 关于我们 */}
      <section className="lp-section lp-section--tint" id="about">
        <div className="lp-shell" style={{ maxWidth: 860 }}>
          <div className="lp-center">
            <span className="lp-eyebrow">关于我们</span>
            <h2 className="lp-h2">聚焦中国发明专利审查意见答复这一件事。</h2>
            <p className="lp-lead">
              集智是一个自建的审查意见答复工作台：材料按案件组织、答复按步骤生成、结论由代理师复核。
              我们不做专利检索、挖掘、交底书撰写，也不承诺授权概率——只把答复过程中重复的分析与整理工作交给系统。
            </p>
          </div>
          <div className="lp-advantages" style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))", marginTop: 28 }}>
            <div className="lp-advantage"><span className="lp-advantage__icon"><ShieldCheck size={17} /></span><div><div className="lp-advantage__title">材料私有</div><div className="lp-advantage__text">案件按账户隔离，文件存于私有对象存储。</div></div></div>
            <div className="lp-advantage"><span className="lp-advantage__icon"><UserRound size={17} /></span><div><div className="lp-advantage__title">人工定稿</div><div className="lp-advantage__text">系统产出工作稿，不自动提交官方系统。</div></div></div>
            <div className="lp-advantage"><span className="lp-advantage__icon"><FileText size={17} /></span><div><div className="lp-advantage__title">过程可查</div><div className="lp-advantage__text">分析结果与生成记录都可回溯复核。</div></div></div>
          </div>
        </div>
      </section>

      {/* 第九屏：底部转化 */}
      <section className="lp-cta" id="contact">
        <div className="lp-shell">
          <h2>把重复的审查意见分析工作交给 AI，<br />把专业判断留给专利代理师。</h2>
          <Link className="lp-btn lp-btn--lg" href="/register">立即体验集智<ArrowRight size={16} /></Link>
          <p className="lp-cta__note">已有账户？<Link href="/login" style={{ color: "#fff", textDecoration: "underline" }}>直接登录</Link></p>
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-shell">
          <div className="lp-footer__grid">
            <div className="lp-footer__brand">
              <div className="lp-brand">
                <span className="lp-brand__mark">集</span>
                <span className="lp-brand__text">
                  <span className="lp-brand__name">集智</span>
                  <span className="lp-brand__sub">审查意见答复工作台</span>
                </span>
              </div>
              <p>{FOOTER.tagline}</p>
            </div>
            {FOOTER.columns.map((column) => (
              <div key={column.title}>
                <h4>{column.title}</h4>
                <ul>
                  {column.links.map((link) => (
                    <li key={link.label}>
                      {link.href.startsWith("#")
                        ? <a href={link.href}>{link.label}</a>
                        : <Link href={link.href}>{link.label}</Link>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="lp-footer__bottom">
            <span>© {new Date().getFullYear()} 集智 · 审查意见答复工作台</span>
            <span>本站为产品介绍页，生成结果需由专利代理师复核后使用。</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
