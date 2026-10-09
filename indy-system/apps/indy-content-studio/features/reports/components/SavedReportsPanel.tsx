"use client";
import { useState } from "react";
import { useDashboardData } from "../../data/DashboardDataProvider";
import { emptyReportingState, type ReportFilters, type SavedReport } from "../report-types";
import { buildReportSnapshot, isReportSnapshot, type ReportSnapshot } from "../report-snapshot";
import { downloadReport, reportCsv, saveReportSnapshot } from "../report-export";

function printReport(report:SavedReport,snapshot:ReportSnapshot){
 const root=document.createElement("section");root.className="report-print-area";
 const text=(tag:string,value:string)=>{const el=document.createElement(tag);el.textContent=value;return el;};
 root.append(text("h1",report.title),text("p",report.filters.range.start+" — "+report.filters.range.end+" · บันทึก "+report.createdAt));
 for(const s of snapshot.summary)root.append(text("p",s.label+": "+s.value));
 for(const note of snapshot.notes)root.append(text("p",note));
 if(snapshot.columns.length>10){
  for(const row of snapshot.rows){const article=document.createElement("article");article.append(text("h2",row[0]??"คอนเทนต์"));const dl=document.createElement("dl");snapshot.columns.forEach((column,i)=>{dl.append(text("dt",column),text("dd",row[i]??"ไม่มีข้อมูล"));});article.append(dl);root.append(article);}
 }else{
  const table=document.createElement("table");
  for(const [i,row] of [snapshot.columns,...snapshot.rows].entries()){const tr=document.createElement("tr");for(const v of row)tr.append(text(i===0?"th":"td",v));table.append(tr);}
  root.append(table);
 }
 document.body.append(root);document.body.classList.add("report-printing");
 const cleanup=()=>{root.remove();document.body.classList.remove("report-printing");};
 window.addEventListener("afterprint",cleanup,{once:true});
 try{window.print();}catch{cleanup();}
}
export function ReportActions({kind,filters}:{kind:"team"|"content";filters:ReportFilters}){
 const dashboard=useDashboardData();const [message,setMessage]=useState("");const [busy,setBusy]=useState(false);
 const title=(kind==="team"?"รายงานทีม ":"รายงานคอนเทนต์ ")+filters.range.start+" ถึง "+filters.range.end;
 function current():SavedReport|null{
  if(!dashboard.state)return null;
  return {id:crypto.randomUUID(),createdAt:new Date().toISOString(),title,kind,filters,snapshot:buildReportSnapshot(dashboard.state,kind,filters)};
 }
 async function save(){
  const report=current();if(!report)return;setBusy(true);
  try{await dashboard.mutate(state=>({...state,reporting:saveReportSnapshot(state.reporting??emptyReportingState(),report,report.id,report.createdAt)}));setMessage("บันทึกรายงานและตัวเลข ณ เวลานี้แล้ว");}
  catch(e){setMessage(e instanceof Error?e.message:"บันทึกไม่สำเร็จ");}finally{setBusy(false);}
 }
 return <div className="report-panel"><div className="report-toolbar">
  <button type="button" disabled={busy} onClick={()=>void dashboard.reload().then(()=>setMessage("โหลดข้อมูลที่บันทึกไว้ล่าสุดแล้ว")).catch(()=>setMessage("โหลดข้อมูลไม่สำเร็จ"))}>โหลดข้อมูลล่าสุด</button>
  <button type="button" disabled={busy} onClick={()=>void save()}>บันทึกรายงานช่วงนี้</button>
  <button type="button" onClick={()=>{const r=current();if(r&&isReportSnapshot(r.snapshot))downloadReport("indy-"+kind+"-"+filters.range.start+".csv",reportCsv(r.snapshot.columns,r.snapshot.rows));}}>ส่งออก CSV</button>
  <button type="button" onClick={()=>{const r=current();if(r&&isReportSnapshot(r.snapshot))printReport(r,r.snapshot);}}>พิมพ์ / บันทึก PDF</button>
 </div><p role="status">{message}</p><small>การโหลดนี้อ่านข้อมูลที่บันทึกไว้ หากต้องการดึงจากโซเชียลให้ใช้ปุ่มอัปเดตในส่วนเชื่อมต่อรายงาน</small></div>;
}
export function SavedReportsPanel({kind}:{kind:"team"|"content"}){
 const {state}=useDashboardData();const [selected,setSelected]=useState<string|null>(null);
 const reports=(state?.reporting?.savedReports??[]).filter(r=>r.kind===kind).slice().reverse();
 const report=reports.find(r=>r.id===selected);const snapshot=report&&isReportSnapshot(report.snapshot)?report.snapshot:null;
 return <section className="report-panel"><h2>รายงานที่บันทึก</h2><p>ตัวเลขและตัวกรองถูกเก็บไว้ ณ วันที่บันทึก การอัปเดตข้อมูลใหม่ไม่เปลี่ยนรายงานเดิม</p>
 {reports.length===0?<p>ยังไม่มีรายงานที่บันทึก</p>:<ul>{reports.map(r=><li key={r.id}><button type="button" onClick={()=>setSelected(r.id)}>{r.title}</button> <small>{new Date(r.createdAt).toLocaleString("th-TH",{timeZone:"Asia/Bangkok"})}</small></li>)}</ul>}
 {report&&snapshot&&<article><h3>{report.title}</h3><div className="report-summary">{snapshot.summary.map((s,i)=><div key={i}>{s.label}<strong>{s.value}</strong></div>)}</div>
 <div className="report-table-wrap"><table><thead><tr>{snapshot.columns.map((c,i)=><th key={i}>{c}</th>)}</tr></thead><tbody>{snapshot.rows.map((r,i)=><tr key={i}>{r.map((v,j)=><td key={j}>{v}</td>)}</tr>)}</tbody></table></div>
 {snapshot.notes.map((n,i)=><p key={i}>{n}</p>)}<button type="button" onClick={()=>downloadReport("indy-report.csv",reportCsv(snapshot.columns,snapshot.rows))}>ส่งออก CSV ของรายงานนี้</button><button type="button" onClick={()=>printReport(report,snapshot)}>พิมพ์ / บันทึก PDF</button></article>}
 {report&&!snapshot&&<p role="alert">รายงานนี้ใช้รูปแบบที่ยังเปิดไม่ได้ ข้อมูลเดิมยังถูกเก็บไว้</p>}
 </section>;
}
