import Link from "next/link";
const cards=[["运行调试","/admin/runs","查看步骤、产物和 QA"],["Skill 管理","/admin/skills","导入、验证、发布和回滚"],["模型配置","/admin/models","管理用途、模型与密钥引用"],["评测","/admin/evals","运行 Golden Case 与发布门禁"]];
export default function Page(){return <><span className="eyebrow">Admin</span><h1>系统管理</h1><div className="case-list">{cards.map(([name,href,desc])=><Link className="card case-card" href={href!} key={name}><div><h3>{name}</h3><p className="muted">{desc}</p></div><span>→</span></Link>)}</div></>}
