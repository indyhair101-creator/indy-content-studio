"use client";
import { useEffect, useState } from "react";
import type { DashboardState } from "../../domain/types";
import { assertRange, presetRange } from "../report-dates";
import { REPORT_PLATFORM_LABELS, type ReportFilters, type ReportPlatform } from "../report-types";
export function ReportFilterBar({ filters, onChange, state, team=false }: {filters:ReportFilters;onChange:(filters:ReportFilters)=>void;state:DashboardState;team?:boolean}) {
 const [draft,setDraft]=useState(filters.range); const [error,setError]=useState("");
 useEffect(()=>{setDraft(filters.range);setError("");},[filters.range.start,filters.range.end]);
 const update=(patch:Partial<ReportFilters>)=>onChange({...filters,...patch});
 function dates(next:typeof draft){setDraft(next);try{assertRange(next);setError("");update({range:next});}catch{setError("ช่วงวันที่ยังไม่ถูกต้อง จะแสดงผลช่วงเดิมจนกว่าแก้ครบ");}}
 const owners=[...new Set([...state.ownerOptions,...state.contents.filter(c=>!c.deletedAt).map(c=>c.owner),...state.actionTasks.map(t=>t.owner??"")])].filter(Boolean).sort();
 const accounts=state.reporting?.connections??[];
 return <div className="report-filter-bar">
  <div className="report-toolbar" aria-label="ช่วงเวลารายงาน">
   <button type="button" onClick={()=>update({range:presetRange("7d")})}>7 วัน</button>
   <button type="button" onClick={()=>update({range:presetRange("30d")})}>30 วัน</button>
   <button type="button" onClick={()=>update({range:presetRange("month")})}>เดือนนี้</button>
   <label>วันเริ่มต้น<input type="date" value={draft.start} onChange={e=>dates({...draft,start:e.target.value})}/></label>
   <label>วันสิ้นสุด<input type="date" value={draft.end} onChange={e=>dates({...draft,end:e.target.value})}/></label>
  </div>
  {error&&<p role="alert">{error}</p>}
  <div className="report-filter-grid">
   {!team&&<><label>ช่องทาง<select value={filters.platform} onChange={e=>update({platform:e.target.value as ReportFilters["platform"],accountId:""})}><option value="all">ทุกช่องทาง</option>{Object.entries(REPORT_PLATFORM_LABELS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
   <label>เพจ / บัญชี<select value={filters.accountId} onChange={e=>update({accountId:e.target.value})}><option value="">ทุกบัญชี</option>{accounts.filter(a=>filters.platform==="all"||a.platform===filters.platform).map(a=><option key={a.id} value={a.accountId}>{a.label} · {REPORT_PLATFORM_LABELS[a.platform]}</option>)}</select></label>
   <label>ความหมายของช่วงเวลา<select value={filters.dateBasis} onChange={e=>update({dateBasis:e.target.value as ReportFilters["dateBasis"]})}><option value="published">โพสต์ที่เผยแพร่ในช่วงนี้ — ยอดสะสม</option><option value="activity">ผลลัพธ์ที่เกิดขึ้นในช่วงนี้</option></select></label>
   <label>แหล่งยอด<select value={filters.traffic} onChange={e=>update({traffic:e.target.value as ReportFilters["traffic"]})}><option value="any">ทุกประเภท — ตามข้อมูลที่มี</option><option value="organic">Organic ที่ยืนยันได้</option><option value="paid">โฆษณา</option><option value="all">ยอดรวม Organic + โฆษณา</option><option value="unknown">ยังไม่ทราบแหล่งยอด</option></select></label></>}
   <label>ผู้รับผิดชอบ<select value={filters.owner} onChange={e=>update({owner:e.target.value})}><option value="">ทุกคน</option>{owners.map(o=><option key={o}>{o}</option>)}</select></label>
   <label>หมวดคอนเทนต์<select value={filters.categoryId} onChange={e=>update({categoryId:e.target.value})}><option value="">ทุกหมวด</option>{state.categories.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></label>
   <label>รูปแบบ<select value={filters.formatId} onChange={e=>update({formatId:e.target.value})}><option value="">ทุกรูปแบบ</option>{state.formats.map(f=><option value={f.id} key={f.id}>{f.name}</option>)}</select></label>
   <label>เป้าหมาย<select value={filters.objective} onChange={e=>update({objective:e.target.value})}><option value="">ทุกเป้าหมาย</option>{Object.entries({branding:"สร้างแบรนด์",awareness:"การรับรู้",lead:"ผู้สนใจ",engagement:"การมีส่วนร่วม",sales:"ยอดขาย"}).map(([k,v])=><option value={k} key={k}>{v}</option>)}</select></label>
  </div>
  <small>ช่วงเวลาที่เลือก: {filters.range.start} ถึง {filters.range.end} · งานใช้เวลาไทย ตัวเลขโซเชียลใช้เขตเวลาตามแหล่งข้อมูล</small>
 </div>;
}
