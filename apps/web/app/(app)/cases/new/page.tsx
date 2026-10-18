import Link from "next/link";
import { NewCaseForm } from "@/components/new-case-form";

export default function Page() {
  return (
    <div style={{ maxWidth: 560, margin: "0 auto" }}>
      <div className="page-head" style={{ alignItems: "flex-start" }}>
        <div>
          <span className="eyebrow">新案件</span>
          <h1 className="page-title" style={{ marginTop: 2 }}>建立案件档案</h1>
          <p className="page-sub">这些字段都可以留空，系统会从上传材料中提取候选信息。</p>
        </div>
        <Link className="button ghost sm" href="/cases">返回列表</Link>
      </div>
      <NewCaseForm />
    </div>
  );
}
