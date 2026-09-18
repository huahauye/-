import { NewCaseForm } from "@/components/new-case-form";
export default function Page(){return <div style={{maxWidth:620,margin:"0 auto"}}><span className="eyebrow">新案件</span><h1>建立案件档案</h1><p className="muted">这些字段都可以留空，系统会从上传材料中提取候选信息。</p><NewCaseForm/></div>}
