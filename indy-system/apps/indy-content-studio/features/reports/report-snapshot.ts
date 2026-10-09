import type { DashboardState } from "../domain/types";
import { selectTeamReport, WORK_STATUS_LABELS } from "./team-report-selectors";
import { selectInsightPublications, aggregateInsightMetric } from "./insight-selectors";
import { METRIC_DEFINITIONS } from "./metric-definitions";
import { REPORT_PLATFORM_LABELS, type MetricKey, type ReportFilters } from "./report-types";
export interface ReportSnapshot {
 version:1; kind:"team"|"content"; summary:Array<{label:string;value:string}>;
 columns:string[]; rows:string[][]; notes:string[];
 evidence?:Record<string,unknown>;
}
export function buildReportSnapshot(state:DashboardState,kind:"team"|"content",filters:ReportFilters):ReportSnapshot {
 if(kind==="team"){
  const r=selectTeamReport(state,filters);
  const sourceRows=[...r.planned,...r.actions,...r.completed,...r.backlog,...r.undated,...r.upcoming];
  const contentIds=new Set([...sourceRows.filter(row=>row.kind==="content").map(row=>row.id),...r.steps.map(step=>step.contentId)]);
  const actionIds=new Set(sourceRows.filter(row=>row.kind==="action-task").map(row=>row.id));
  return {version:1,kind,summary:[{label:"คอนเทนต์ตามแผน",value:String(r.totals.planned)},{label:"เผยแพร่แล้วในกลุ่มงานตามแผน",value:String(r.totals.done)},{label:"งานเกินกำหนด",value:String(r.totals.overdue)},{label:"งานอิสระตามแผน",value:String(r.actionTotals.planned)},{label:"มีหลักฐานเสร็จในช่วงนี้",value:String(r.completed.length)},{label:"ไม่ทราบเวลาเสร็จย้อนหลัง",value:String(r.unknownCompletion)}],
   columns:["งาน","ประเภท","ผู้รับผิดชอบ","กำหนดส่ง","สถานะปัจจุบัน","เสร็จเมื่อ","วิธีปิด"],
   rows:[...r.planned,...r.actions].map(x=>[x.title,x.kind==="content"?"คอนเทนต์":"งานอิสระ",x.owner,x.dueDate??"ไม่ระบุ",WORK_STATUS_LABELS[x.status]??x.status,x.completion?.occurredAt??"ไม่ทราบ",x.manualPublication?"ลงเอง":"ตามหลักฐานสถานะ"]),
   evidence:structuredClone({filters,contents:state.contents.filter(content=>contentIds.has(content.id)),actionTasks:state.actionTasks.filter(task=>actionIds.has(task.id)),statusHistory:(state.statusHistory??[]).filter(event=>event.contentId?contentIds.has(event.contentId):actionIds.has(event.entityId))}),
   notes:["กลุ่มงานนับตามกำหนดส่งในช่วงที่เลือก สถานะเป็นสถานะปัจจุบัน ณ วันที่บันทึก","หนึ่งคอนเทนต์นับครั้งเดียว งานอิสระนับแยก","ไม่ใช้วันแก้ไขล่าสุดแทนวันเสร็จจริง"]};
 }
 const rows=selectInsightPublications(state,filters);
 const metrics=Object.keys(METRIC_DEFINITIONS) as MetricKey[];
 const format=(v:number|null|undefined)=>v===null||v===undefined?"ไม่มีข้อมูล":String(Math.round(v*100)/100);
 return {version:1,kind,summary:["views","shares","saves","watchSeconds","averageWatchSeconds"].map(k=>({label:METRIC_DEFINITIONS[k as MetricKey].label,value:format(aggregateInsightMetric(rows,k as MetricKey))})),
  columns:["คอนเทนต์","ช่องทาง","วันเผยแพร่","ลิงก์โพสต์",...metrics.map(k=>METRIC_DEFINITIONS[k].label+" ("+METRIC_DEFINITIONS[k].unit+")"),"แหล่งข้อมูล","อัปเดตล่าสุด","ช่วงที่เลือก","ฐานรายงาน","แหล่งยอดที่เลือก","หลักฐาน: ID / ขอบเขต / ช่วงข้อมูล / แหล่งยอด / เขตเวลา"],
  rows:rows.map(r=>[r.content.title,REPORT_PLATFORM_LABELS[r.publication.platform],r.publication.publishedAt,r.publication.url,...metrics.map(k=>format(r.metrics[k])),[...new Set(r.observations.map(o=>o.sourceLabel))].join(" / "),r.observations.map(o=>o.fetchedAt).sort((a,b)=>Date.parse(a)-Date.parse(b)).at(-1)??"ไม่มีข้อมูล",filters.range.start+" ถึง "+filters.range.end,filters.dateBasis,filters.traffic,r.observations.map(o=>[o.id,o.scope,o.period?o.period.start+" ถึง "+o.period.end:"ตลอดอายุโพสต์",o.traffic,o.timeZone??"ไม่ระบุ"].join(" / ")).join("; ")]),
  evidence:structuredClone({filters,contents:[...new Map(rows.map(r=>[r.content.id,r.content])).values()],publications:rows.map(r=>r.publication),observations:rows.flatMap(r=>r.observations)}),
  notes:[filters.dateBasis==="published"?"กลุ่มโพสต์ที่เผยแพร่ในช่วงที่เลือก ใช้ยอดสะสมล่าสุดที่มี":"ผลกิจกรรมในช่วงที่เลือกตามเขตเวลาของแหล่งข้อมูล","ไม่บวกผู้ชมไม่ซ้ำหรือ reach ข้ามโพสต์/ช่องทาง","ค่าเฉลี่ยรวมแสดงเฉพาะเมื่อมีฐานคำนวณที่เข้ากันได้","จำนวนแถวเป็นโพสต์รายช่องทาง ไม่ใช่จำนวนคอนเทนต์หลัก"]};
}
export function isReportSnapshot(value:unknown):value is ReportSnapshot {
 if(!value||typeof value!=="object")return false;
 const s=value as ReportSnapshot;
 return s.version===1&&(s.kind==="team"||s.kind==="content")&&Array.isArray(s.summary)&&s.summary.every(x=>typeof x?.label==="string"&&typeof x?.value==="string")&&Array.isArray(s.columns)&&s.columns.every(x=>typeof x==="string")&&Array.isArray(s.rows)&&s.rows.every(r=>Array.isArray(r)&&r.every(v=>typeof v==="string"))&&Array.isArray(s.notes)&&s.notes.every(x=>typeof x==="string");
}
