"use client";
import { useRef, useState } from "react";
import { useDashboardData } from "../../data/DashboardDataProvider";
import { emptyReportingState, REPORT_PLATFORM_LABELS } from "../report-types";
import { parseReportImport, mergeReportImport, type ReportImport } from "../report-schema";
import { downloadReport } from "../report-export";

export function ReportImportPanel() {
 const dashboard=useDashboardData(); const [preview,setPreview]=useState<ReportImport|null>(null);
 const [message,setMessage]=useState(""); const [busy,setBusy]=useState(false); const input=useRef<HTMLInputElement>(null);
 const readGeneration=useRef(0);
 async function read(file:File|undefined) {
  const generation=++readGeneration.current;
  setPreview(null);setMessage("");if(!file)return;
  if(file.size>15_000_000){setMessage("ไฟล์ต้องไม่เกิน 15 MB");return;}
  try{
   const parsed=parseReportImport(await file.text());
   if(generation!==readGeneration.current)return;
   mergeReportImport(dashboard.state?.reporting??emptyReportingState(),parsed);
   setPreview(parsed);
  }catch(e){if(generation===readGeneration.current)setMessage(e instanceof Error?e.message:"อ่านไฟล์ไม่สำเร็จ");}
 }
 async function confirm(){
  if(!preview)return;setBusy(true);
  try{
   await dashboard.mutate(state=>({...state,reporting:mergeReportImport(state.reporting??emptyReportingState(),preview)}));
   setPreview(null);setMessage("นำเข้ารายงานแล้ว กรุณาจับคู่โพสต์กับคอนเทนต์");
   if(input.current)input.current.value="";
  }catch(e){setMessage(e instanceof Error?e.message:"นำเข้าไม่สำเร็จ");}finally{setBusy(false);}
 }
 const reporting=dashboard.state?.reporting??emptyReportingState();
 const unlinked=reporting.publications.filter(p=>!p.contentId||!dashboard.state?.contents.some(c=>c.id===p.contentId&&!c.deletedAt));
 async function link(publicationId:string,contentId:string){
  setBusy(true);
  try{await dashboard.mutate(state=>({...state,reporting:{...(state.reporting??emptyReportingState()),publications:(state.reporting?.publications??[]).map(p=>p.id===publicationId?{...p,contentId:contentId||null}:p)}}));setMessage("จับคู่โพสต์แล้ว");}
  catch{setMessage("จับคู่ไม่สำเร็จ กรุณาลองใหม่");}finally{setBusy(false);}
 }
 function template(){
  const example={schemaVersion:1,publications:[{id:"example-post",contentId:null,platform:"instagram",accountId:"your-account",providerPostId:"your-post-id",url:"https://www.instagram.com/p/your-post-id/",title:"เปลี่ยนเป็นชื่อโพสต์จริง",publishedAt:new Date().toISOString(),mediaKind:"video",durationSeconds:30,thumbnailUrl:null}],observations:[{id:"example-observation",publicationId:"example-post",fetchedAt:new Date().toISOString(),source:"import",sourceLabel:"ระบุชื่อไฟล์ต้นทาง",scope:"lifetime",period:null,traffic:"unknown",metrics:{views:null,averageWatchSeconds:null},averageWatchWeight:null,retention:null}]};
  downloadReport("report-import-template.json",JSON.stringify(example,null,2),"application/json");
 }
 return <details className="report-panel report-import-panel"><summary>นำเข้าไฟล์และจับคู่โพสต์กับคอนเทนต์ {unlinked.length>0&&"("+unlinked.length+" โพสต์ยังไม่จับคู่)"}</summary>
  <p>นำเข้าไฟล์ JSON ตามแม่แบบที่กำหนด ตัวเลขที่ไม่ทราบให้ใช้ null ข้อมูลจะเก็บป้ายว่าเป็นการนำเข้าไฟล์</p>
  <div className="report-toolbar"><button type="button" onClick={template}>ดาวน์โหลดแม่แบบ JSON</button><label>เลือกไฟล์รายงาน<input ref={input} type="file" accept=".json,application/json" disabled={busy} onChange={e=>void read(e.target.files?.[0])}/></label></div>
  {preview&&<div className="report-notice"><p>ตรวจแล้ว: {preview.publications.length} โพสต์ · {preview.observations.length} ชุดตัวเลข รายการเดิมที่เหมือนกันจะไม่เพิ่มซ้ำ</p><button type="button" disabled={busy} onClick={()=>void confirm()}>ยืนยันนำเข้ารายงาน</button><button type="button" onClick={()=>setPreview(null)}>ยกเลิก</button></div>}
  {message&&<p role="status">{message}</p>}
  {reporting.publications.length>0&&<details><summary>จัดการการจับคู่โพสต์ทั้งหมด ({reporting.publications.length})</summary>
   <p>หนึ่งคอนเทนต์จับคู่หลายช่องทางได้ การลงเองต้องใส่โพสต์จริงผ่านการเชื่อมหรือนำเข้า</p>
   <div className="report-table-wrap"><table><thead><tr><th>โพสต์</th><th>คอนเทนต์ในระบบ</th></tr></thead><tbody>{reporting.publications.map(p=><tr key={p.id}><td>{p.title}<small>{REPORT_PLATFORM_LABELS[p.platform]} · {p.providerPostId}</small></td><td><select aria-label={"จับคู่ "+p.title} value={p.contentId??""} disabled={busy} onChange={e=>void link(p.id,e.target.value)}><option value="">ยังไม่จับคู่</option>{dashboard.state?.contents.filter(c=>!c.deletedAt).map(c=><option key={c.id} value={c.id}>{c.title} · {c.owner}</option>)}</select></td></tr>)}</tbody></table></div>
  </details>}
 </details>;
}
