"use client";
import { useEffect,useState } from "react";
export default function Page({params}:{params:Promise<{runId:string}>}){const[id,setId]=useState("");const[data,setData]=useState<any>(null);useEffect(()=>{params.then(v=>{setId(v.runId);fetch(`/api/admin/runs/${v.runId}`).then(r=>r.json()).then(setData)})},[params]);return <><span className="eyebrow">Admin Debug</span><h1>Run {id.slice(0,8)}</h1><section className="card"><pre style={{whiteSpace:"pre-wrap",fontSize:12,overflow:"auto"}}>{JSON.stringify(data,null,2)}</pre></section></>}
