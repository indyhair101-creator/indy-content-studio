import { createEmptyDashboardState } from "../domain/create-empty-state";
import type { DashboardState } from "../domain/types";

export interface IdeasImportResult { previewState: DashboardState; report: { mapped: number; skipped: number; errors: Array<{ row: number; message: string }> } }

export function parseIdeasImport(input: string | unknown, current: DashboardState = createEmptyDashboardState()): IdeasImportResult {
  let parsed: unknown = input; if (typeof input === "string") { try { parsed = JSON.parse(input); } catch { throw new Error("ไฟล์ไอเดียไม่ใช่ JSON"); } }
  if (!Array.isArray(parsed)) throw new Error("ไฟล์ไอเดียต้องเป็น array");
  const state = JSON.parse(JSON.stringify(current)) as DashboardState; const report = { mapped: 0, skipped: 0, errors: [] as Array<{ row: number; message: string }> }; const known = new Set(state.references.map((item) => item.url));
  parsed.forEach((raw, index) => { const item = raw as Record<string, unknown>; const title = String(item.title ?? "").trim(); const url = String(item.url ?? "").trim(); if (!title || !/^https:\/\//u.test(url)) { report.skipped += 1; report.errors.push({ row: index + 1, message: "ต้องมี title และ HTTPS url" }); return; } if (known.has(url)) { report.skipped += 1; report.errors.push({ row: index + 1, message: "ลิงก์ซ้ำ" }); return; } known.add(url); state.references.push({ id: `idea-${Date.now()}-${index}`, title, url, platform: String(item.platform ?? "ไม่ระบุ"), tags: Array.isArray(item.tags) ? [...new Set(item.tags.map(String).map((tag) => tag.trim()).filter(Boolean))] : [], notes: "นำเข้าจากไอเดีย", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), deletedAt: null }); report.mapped += 1; });
  return { previewState: state, report };
}
