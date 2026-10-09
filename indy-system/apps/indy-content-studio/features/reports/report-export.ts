import type { ReportingState, SavedReport } from "./report-types";
export function reportCsv(headers:string[], rows:unknown[][]):string {
 const cell=(v:unknown)=>{
  let s=v===null||v===undefined?"":String(v);
  if(/^[\s]*[=+\-@]/.test(s)||/^[\t\r]/.test(s))s="'"+s;
  return '"'+s.replaceAll('"','""')+'"';
 };
 return "\uFEFF"+[headers,...rows].map(row=>row.map(cell).join(",")).join("\r\n");
}
export function saveReportSnapshot(current:ReportingState,report:Omit<SavedReport,"id"|"createdAt">,id:string,createdAt:string):ReportingState {
 if(!report.title.trim())throw new Error("กรุณาตั้งชื่อรายงาน");
 if(current.savedReports.some(r=>r.id===id))throw new Error("รายงานนี้บันทึกแล้ว");
 return {...current,savedReports:[...current.savedReports,JSON.parse(JSON.stringify({...report,id,createdAt})) as SavedReport]};
}
export function downloadReport(name:string,content:string,type="text/csv;charset=utf-8"):void {
 const url=URL.createObjectURL(new Blob([content],{type}));
 const anchor=document.createElement("a");anchor.href=url;anchor.download=name;
 document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

