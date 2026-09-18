import { CaseWorkbench } from "@/components/case-workbench";
export default async function Page({params}:{params:Promise<{caseId:string}>}){return <CaseWorkbench caseId={(await params).caseId}/>}
