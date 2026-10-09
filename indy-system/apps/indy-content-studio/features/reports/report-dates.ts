import type { ReportFilters, ReportRange } from "./report-types";
const DAY = 86_400_000;
export function bangkokDate(value: string | Date = new Date()): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("วันที่ไม่ถูกต้อง");
  return new Date(date.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
}
export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
export function assertRange(range: ReportRange): void {
  if (!validDate(range.start) || !validDate(range.end) || range.start > range.end) throw new Error("กรุณาเลือกวันเริ่มต้นและวันสิ้นสุดให้ถูกต้อง");
}
export function shiftDate(value: string, days: number): string {
  if (!validDate(value) || !Number.isInteger(days)) throw new Error("วันที่ไม่ถูกต้อง");
  return new Date(new Date(value + "T00:00:00Z").getTime() + days * DAY).toISOString().slice(0, 10);
}
export function inReportRange(value: string | null, range: ReportRange): boolean {
  assertRange(range);
  if (!value) return false;
  let day: string;
  try { day = validDate(value) ? value : bangkokDate(value); } catch { return false; }
  return day >= range.start && day <= range.end;
}
export function previousRange(range: ReportRange): ReportRange {
  assertRange(range);
  const days = Math.round((Date.parse(range.end) - Date.parse(range.start)) / DAY) + 1;
  return { start: shiftDate(range.start, -days), end: shiftDate(range.start, -1) };
}
export function presetRange(preset: "7d" | "30d" | "month", now: string | Date = new Date()): ReportRange {
  const end = bangkokDate(now);
  return { start: preset === "month" ? end.slice(0, 7) + "-01" : shiftDate(end, preset === "7d" ? -6 : -29), end };
}
export function defaultReportFilters(now: string | Date = new Date()): ReportFilters {
  return { range: presetRange("30d", now), dateBasis: "published", platform: "all", accountId: "", owner: "", categoryId: "", formatId: "", objective: "", traffic: "any", videoOnly: false, minDuration: null, maxDuration: null };
}

