"use client";
import Link from "next/link";
import { useCallback,useEffect,useState } from "react";
import { Download,RefreshCw } from "lucide-react";

type Run={id:string;caseId:string;status:string;createdAt:string;finishedAt:string|null;userMessage:string|null;errorCode:string|null;skillVersion?:string};
type Step={stepKey:string;status:string};
type Artifact={id:string;type:string;downloadable:boolean;sizeBytes:number|null};
type Finding={id:string;severity:string;code:string;location:string|null;message:string;repairStatus:string};
const stages=[{name:"材料准备",keys:["SNAPSHOT_CASE","BUILD_TIMELINE","RESOLVE_CURRENT_OA","RESOLVE_CURRENT_CLAIMS"]},{name:"审查意见分析",keys:["EXTRACT_OA_ISSUES","BUILD_EVIDENCE_MATRIX","GENERATE_STRATEGIES","BUILD_AMENDMENT_PLAN"]},{name:"生成答复",keys:["DRAFT_STATEMENT"]},{name:"文稿质检",keys:["SEMANTIC_QA","REPAIR_DRAFT","VISUAL_QA","FINAL_METADATA_QA"]},{name:"Word 生成",keys:["BUILD_DOCX","RENDER_DOCX","COMPLETE"]}];
const severityLabels:Record<string,string>={BLOCKER:"必须处理",ERROR:"问题",WARNING:"提示",INFO:"说明"};

export function RunView({runId}:{runId:string}){
  const[run,setRun]=useState<Run|null>(null);const[steps,setSteps]=useState<Step[]>([]);const[artifacts,setArtifacts]=useState<Artifact[]>([]);const[findings,setFindings]=useState<Finding[]>([]);const[error,setError]=useState("");
  const load=useCallback(()=>fetch(`/api/runs/${runId}`).then(async r=>{const v=await r.json();if(!r.ok)throw new Error(v.error?.message);setRun(v.run);setSteps(v.steps);setArtifacts(v.artifacts??[]);setFindings(v.findings??[])}).catch(e=>setError(e.message)),[runId]);
  useEffect(()=>{load();const timer=setInterval(()=>{if(!run||!["COMPLETED","FAILED","QA_FAILED","CANCELLED"].includes(run.status))load()},3000);return()=>clearInterval(timer)},[load,run]);
  if(error)return <div className="card notice error">{error}</div>;
  if(!run)return <div className="empty">正在读取生成进度…</div>;

  const terminal=["COMPLETED","FAILED","QA_FAILED","CANCELLED"].includes(run.status);
  // The document is what the user came for: offer it whenever it exists, even
  // when the independent QA still reports something about the draft.
  const docx=artifacts.find(a=>a.type==="STATEMENT_DOCX"&&a.downloadable);
  const pdf=artifacts.find(a=>a.type==="RENDERED_PDF"&&a.downloadable);
  const openFindings=findings.filter(f=>f.severity==="ERROR"||f.severity==="BLOCKER");
  const advisoryFindings=findings.filter(f=>f.severity==="WARNING");
  const title=docx?"意见陈述书已生成":terminal?"本次生成未完成":"正在生成答复";
  const kb=(value:number|null)=>value?`${Math.round(value/1024)} KB`:"";

  return <div style={{maxWidth:760,margin:"0 auto"}}>
    <div className="toolbar"><div><span className="eyebrow">RUN {run.id.slice(0,8)}</span><h1>{title}</h1><p className="muted">Skill {run.skillVersion??"—"} · {new Date(run.createdAt).toLocaleString("zh-CN")}</p></div><Link className="button ghost" href={`/cases/${run.caseId}`}>返回案件</Link></div>
    <section className="card">
      <div className="timeline">{stages.map((stage,index)=>{const states=stage.keys.map(key=>steps.find(s=>s.stepKey===key)?.status);const done=states.length>0&&states.every(v=>v==="SUCCEEDED");const active=!done&&states.some(v=>v==="RUNNING")||(!terminal&&!states.some(Boolean)&&stages.slice(0,index).every(prev=>prev.keys.every(key=>steps.find(s=>s.stepKey===key)?.status==="SUCCEEDED")));return <div className={`step ${done?"done":active?"active":""}`} key={stage.name}><span className="dot"/><div>{done?"✓ ":active?"● ":"○ "}{stage.name}</div></div>})}</div>

      {docx&&<div style={{marginTop:20,display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
        <a className="button teal" href={`/api/artifacts/${docx.id}/download`}><Download size={18}/>下载可编辑 DOCX {kb(docx.sizeBytes)}</a>
        {pdf&&<a className="button ghost" href={`/api/artifacts/${pdf.id}/download`}><Download size={18}/>下载 PDF 预览 {kb(pdf.sizeBytes)}</a>}
      </div>}

      {docx&&openFindings.length>0&&<div className="notice" style={{marginTop:16}}>
        文稿已生成并可下载。独立质检仍提出 {openFindings.length} 项需要人工确认的问题（已展示在下方），请代理师复核后再使用。
      </div>}

      {!docx&&terminal&&<div className="notice error" style={{marginTop:20}}>
        本次生成未完成，请重新生成或联系管理员。错误编号：{run.userMessage??`RUN-${run.id.slice(0,4).toUpperCase()}`}{run.errorCode?` · 原因：${run.errorCode}`:""}
      </div>}

      {!terminal&&<div className="notice" style={{marginTop:20}}><RefreshCw size={15} style={{verticalAlign:"-2px",marginRight:7}}/>页面会自动更新，无需保持窗口前台。</div>}
    </section>

      {findings.length>0&&<section className="card" style={{marginTop:16}}>
        <div className="section-head"><div><h2>质检记录</h2><div className="muted">独立语义质检与渲染检查的结论，按严重程度排列</div></div></div>
        {[...openFindings,...advisoryFindings,...findings.filter(f=>f.severity==="INFO")].slice(0,12).map(finding=><div className="check" key={finding.id} style={{alignItems:"flex-start"}}>
          <span className="check-icon">{finding.severity==="INFO"?"i":finding.severity==="WARNING"?"!":"×"}</span>
          <div><strong>{severityLabels[finding.severity]??finding.severity} · {finding.code}</strong>
            <div className="muted" style={{fontSize:12,marginTop:4,lineHeight:1.7}}>{finding.message}</div>
            {finding.location&&<div className="muted" style={{fontSize:11,marginTop:3}}>{finding.location}</div>}
          </div>
        </div>)}
      </section>}
  </div>;
}
