import { z } from "zod";
import { assertRange, validDate } from "./report-dates";
import { emptyReportingState, type ReportingState, type ReportPublication, type MetricObservation } from "./report-types";

const text = z.string().max(2000);
const id = z.string().min(1).max(300);
const stamp = z.string().datetime({ offset: true });
const nonnegative = z.number().finite().nonnegative();
const platform = z.enum(["facebook", "instagram", "tiktok", "youtube"]);
const traffic = z.enum(["organic", "paid", "all", "unknown"]);
const date = z.string().refine(validDate, "วันที่ไม่ถูกต้อง");
const range = z.object({start:date,end:date}).strict().refine(r=>r.start<=r.end,"วันเริ่มต้นต้องไม่เกินวันสิ้นสุด");
const safeUrl = z.string().max(4096).url().refine(s=> /^https?:\/\//i.test(s), "รองรับลิงก์ http/https เท่านั้น");
const metrics = z.object({
 views:nonnegative.nullable().optional(),reach:nonnegative.nullable().optional(),uniqueViewers:nonnegative.nullable().optional(),
 likes:nonnegative.nullable().optional(),comments:nonnegative.nullable().optional(),shares:nonnegative.nullable().optional(),saves:nonnegative.nullable().optional(),
 followers:nonnegative.nullable().optional(),clicks:nonnegative.nullable().optional(),conversions:nonnegative.nullable().optional(),watchSeconds:nonnegative.nullable().optional(),
 averageWatchSeconds:nonnegative.nullable().optional(),averageWatchPercent:nonnegative.nullable().optional(),completionRate:nonnegative.max(100).nullable().optional(),
}).strict();
const metricKey = metrics.keyof();
export const reportFiltersSchema = z.object({
 range,dateBasis:z.enum(["activity","published"]),platform:z.union([platform,z.literal("all")]),
 accountId:text,owner:text,categoryId:text,formatId:text,objective:text,
 traffic:z.union([traffic,z.literal("any")]),videoOnly:z.boolean(),
 minDuration:nonnegative.nullable(),maxDuration:nonnegative.nullable(),
}).strict();
export const publicationSchema = z.object({
 id,contentId:id.nullable(),platform,accountId:id,providerPostId:id,url:safeUrl,title:text,
 publishedAt:stamp,mediaKind:z.enum(["video","image","other"]),durationSeconds:nonnegative.nullable(),thumbnailUrl:safeUrl.nullable(),
}).strict();
export const observationSchema = z.object({
 timeZone:z.string().max(100).optional(),
 id,publicationId:id,fetchedAt:stamp,source:z.enum(["api","import"]),sourceLabel:text,
 scope:z.enum(["activity","lifetime"]),period:range.nullable(),traffic,metrics,
 averageWatchWeight:nonnegative.nullable(),
 retention:z.array(z.object({positionSeconds:nonnegative,ratio:nonnegative}).strict()).max(10000).nullable(),
}).strict().superRefine((o,ctx)=>{
 if(o.scope==="activity"&&!o.period) ctx.addIssue({code:"custom",message:"ข้อมูลช่วงเวลาต้องมีวันเริ่มต้นและสิ้นสุด"});
 if(o.scope==="lifetime"&&o.period) ctx.addIssue({code:"custom",message:"ยอดสะสมต้องไม่ระบุเป็นยอดช่วงเวลา"});
});
const connectionSchema = z.object({
 id,platform,accountId:text,label:text,status:z.enum(["connected","disconnected","expired","missing-permission","error"]),
 checkedAt:stamp.nullable(),message:text,availableMetrics:z.array(metricKey),
}).strict();
const savedSchema=z.object({id,title:text,kind:z.enum(["team","content"]),createdAt:stamp,filters:reportFiltersSchema,snapshot:z.json()}).strict();
const reportingSchema=z.object({
 connections:z.array(connectionSchema).max(1000),
 publications:z.array(publicationSchema).max(50000),
 observations:z.array(observationSchema).max(500000),
 savedReports:z.array(savedSchema).max(1000),
}).strict();
function unique(rows:Array<{id:string}>,label:string) {
 const ids=new Set<string>();
 for(const row of rows) {if(ids.has(row.id))throw new Error(label+" มี ID ซ้ำ"); ids.add(row.id);}
 return ids;
}
export function validateReportingState(value:unknown):ReportingState {
 if(value===undefined) return emptyReportingState();
 const result=reportingSchema.safeParse(value);
 if(!result.success)throw new Error("ข้อมูลรายงานไม่ถูกต้อง: "+result.error.issues[0]?.message);
 const data=result.data as ReportingState;
 const publications=unique(data.publications,"โพสต์");
 const physicalPosts=new Set<string>();
 for(const publication of data.publications) {
  const identity=JSON.stringify([publication.platform,publication.accountId,publication.providerPostId]);
  if(physicalPosts.has(identity))throw new Error("โพสต์จริงเดียวกันมีหลาย ID กรุณาใช้ ID เดิมของช่องทางและบัญชีนี้");
  physicalPosts.add(identity);
 }
 unique(data.connections,"บัญชี"); unique(data.observations,"ตัวเลข"); unique(data.savedReports,"รายงาน");
 for(const o of data.observations) if(!publications.has(o.publicationId)) throw new Error("ตัวเลขอ้างถึงโพสต์ที่ไม่มี");
 return data;
}
export interface ReportImport {schemaVersion:1; publications:ReportPublication[]; observations:MetricObservation[]}
export function parseReportImport(value:unknown):ReportImport {
 let raw:unknown=value;
 if(typeof value==="string") {
  if(value.length>15_000_000)throw new Error("ไฟล์รายงานต้องไม่เกิน 15 MB");
  try{raw=JSON.parse(value);}catch{throw new Error("ไฟล์รายงานต้องเป็น JSON ที่ถูกต้อง");}
 }
 const result=z.object({schemaVersion:z.literal(1),publications:z.array(publicationSchema).max(10000),observations:z.array(observationSchema).max(50000)}).strict().safeParse(raw);
 if(!result.success)throw new Error("รูปแบบไฟล์รายงานไม่ถูกต้อง: "+result.error.issues[0]?.message);
 const normalized=validateReportingState({...emptyReportingState(),publications:result.data.publications,observations:result.data.observations});
 return {schemaVersion:1,publications:normalized.publications,observations:normalized.observations.map(o=>({...o,source:"import"}))};
}
export function mergeReportImport(current:ReportingState,incoming:ReportImport):ReportingState {
 const next=structuredClone(validateReportingState(current));
 // Validate at the merge boundary too: callers cannot bypass import provenance by skipping the parser.
 const normalized=parseReportImport(incoming);
 const publications=new Map(next.publications.map(p=>[p.id,p]));
 for(const p of normalized.publications) {
  const old=publications.get(p.id);
  if(old && (old.platform!==p.platform || old.accountId!==p.accountId || old.providerPostId!==p.providerPostId))throw new Error("ID โพสต์ซ้ำแต่เป็นคนละโพสต์ กรุณาแก้ไฟล์ก่อนนำเข้า");
  if(!old){next.publications.push(p);publications.set(p.id,p);} else Object.assign(old,p,{contentId:old.contentId??p.contentId});
 }
 const observations=new Map(next.observations.map(o=>[o.id,o]));
 for(const observation of normalized.observations) {
  const old=observations.get(observation.id);
  if(old) {
   // An exported API snapshot re-imported unchanged is the same measurement. Keep its
   // existing trusted provenance; all other fields, including sourceLabel and basis, must match.
   if(JSON.stringify(canonical({...old,source:"import"}))!==JSON.stringify(canonical(observation)))
    throw new Error("ID ตัวเลขซ้ำแต่ค่าหรือแหล่งข้อมูลต่างกัน กรุณาใช้ ID ใหม่สำหรับ snapshot ใหม่");
  } else {next.observations.push(observation);observations.set(observation.id,observation);}
 }
 return validateReportingState(next);
}
function canonical(value:unknown):unknown {
 if(Array.isArray(value))return value.map(canonical);
 if(value!==null&&typeof value==="object")return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([key,v])=>[key,canonical(v)]));
 return value;
}
