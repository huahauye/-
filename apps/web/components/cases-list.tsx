"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, FilePlus2, Search } from "lucide-react";

type PatentCase={id:string;title:string|null;applicationNo:string|null;internalCaseNo:string|null;status:string;updatedAt:string};
const statusLabel:Record<string,string>={INCOMPLETE:"材料未齐",NEEDS_CONFIRMATION:"待确认",READY:"可生成",PROCESSING:"处理中",COMPLETED:"已完成",FAILED:"需处理"};
export function CasesList(){const [items,setItems]=useState<PatentCase[]>([]);const [q,setQ]=useState("");const [loading,setLoading]=useState(true);
  useEffect(()=>{const timer=setTimeout(()=>{fetch(`/api/cases${q?`?q=${encodeURIComponent(q)}`:""}`).then(r=>{if(r.status===401)location.href="/login";return r.json()}).then(v=>setItems(v.cases??[])).finally(()=>setLoading(false))},180);return()=>clearTimeout(timer)},[q]);
  return <><div className="toolbar"><div><span className="eyebrow">案件中心</span><h1>审通案件</h1><p className="muted">按申请组织全部版本、审查意见和答复记录。</p></div><Link className="button" href="/cases/new"><FilePlus2 size={18}/>新建案件</Link></div>
  <div className="card" style={{padding:14,display:"flex",gap:10,alignItems:"center"}}><Search size={18} color="#777284"/><input className="input" style={{border:0,boxShadow:"none"}} placeholder="按申请号、名称或内部编号搜索" value={q} onChange={e=>setQ(e.target.value)}/></div>
  <div style={{height:20}}/>{loading?<div className="empty">正在读取案件…</div>:items.length?<div className="case-list">{items.map(item=><Link className="card case-card" href={`/cases/${item.id}`} key={item.id}><div><span className={`badge ${item.status==="READY"||item.status==="COMPLETED"?"good":item.status==="FAILED"?"bad":"warn"}`}>{statusLabel[item.status]??item.status}</span><h3>{item.title||"未命名案件"}</h3><div className="muted">{item.applicationNo||item.internalCaseNo||"尚未填写申请号"}</div></div><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:13}}><span className="muted">更新于 {new Date(item.updatedAt).toLocaleDateString("zh-CN")}</span><ArrowRight size={17}/></div></Link>)}</div>:<div className="card empty"><h3>还没有案件</h3><p>创建案件后即可上传本申请、OA 和对比文件。</p><Link className="button" href="/cases/new">创建第一个案件</Link></div>}</>}
