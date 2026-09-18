import { RunView } from "@/components/run-view";
export default async function Page({params}:{params:Promise<{runId:string}>}){return <RunView runId={(await params).runId}/>}
