import Link from "next/link";
import { Activity, Cpu, FlaskConical, Package } from "lucide-react";

const cards = [
  { name: "运行调试", href: "/admin/runs", desc: "查看每次生成的步骤、产物与质检结论", icon: Activity },
  { name: "Skill 管理", href: "/admin/skills", desc: "导入、验证、发布和回滚专业规则版本", icon: Package },
  { name: "模型配置", href: "/admin/models", desc: "管理用途、模型与密钥引用", icon: Cpu },
  { name: "评测", href: "/admin/evals", desc: "运行 Golden Case 与发布门禁", icon: FlaskConical }
];

export default function Page() {
  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">Admin</span>
          <h1 className="page-title" style={{ marginTop: 2 }}>系统管理</h1>
          <p className="page-sub">仅管理员可见。这里的改动会影响全部用户的下一次生成。</p>
        </div>
      </div>
      <div className="feature-grid">
        {cards.map((card) => (
          <Link className="feature" href={card.href} key={card.name}>
            <span className="feature-icon"><card.icon size={19} /></span>
            <div className="feature-body">
              <div className="feature-title">{card.name}</div>
              <div className="feature-desc">{card.desc}</div>
              <span className="muted" style={{ fontSize: 12 }}>进入 →</span>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
