import { createEmptyDashboardState } from "../domain/create-empty-state";
import type { ContentItem, DashboardState, ProductionStatus } from "../domain/types";

export interface LegacyImportReport { mapped: number; skipped: number; warnings: string[]; errors: Array<{ row: number; message: string }> }
export interface LegacyImportResult { previewState: DashboardState; report: LegacyImportReport }

const statuses: Record<string, ProductionStatus> = { "รอถ่าย": "waiting-shoot", "ถ่ายแล้ว": "shot", "กำลังตัดต่อ": "editing", "ตัดต่อ": "editing", "รอตรวจ": "review", "รออนุมัติ": "review", "ต้องแก้": "needs-changes", "พร้อมเผยแพร่": "ready", "เผยแพร่แล้ว": "published" };

function parseInput(input: string | unknown): unknown {
  if (typeof input !== "string") return input;
  if (new TextEncoder().encode(input).byteLength > 10 * 1024 * 1024) throw new Error("ไฟล์เกิน 10 MB");
  try { return JSON.parse(input); } catch { throw new Error("ไฟล์ระบบเดิมไม่ใช่ JSON"); }
}

function depth(value: unknown, current = 0): number { if (!value || typeof value !== "object") return current; if (current > 20) return current; return Math.max(current, ...Object.values(value as Record<string, unknown>).map((item) => depth(item, current + 1))); }

export function parseLegacyIndyExport(input: string | unknown): LegacyImportResult {
  const parsed = parseInput(input);
  if (depth(parsed) > 20) throw new Error("โครงสร้างข้อมูลลึกเกิน 20 ชั้น");
  const source = (parsed && typeof parsed === "object" ? parsed : {}) as Record<string, unknown>;
  const state = createEmptyDashboardState();
  const report: LegacyImportReport = { mapped: 0, skipped: 0, warnings: [], errors: [] };
  const legacyContents = Array.isArray(source.contents) ? source.contents : Array.isArray(source.contentItems) ? source.contentItems : [];
  const legacyMedia = Array.isArray(source.media) ? source.media : Array.isArray(source.assets) ? source.assets : [];
  const legacyReferences = Array.isArray(source.references) ? source.references : Array.isArray(source.ideas) ? source.ideas : [];
  const legacyTemplates = Array.isArray(source.captionTemplates) ? source.captionTemplates : Array.isArray(source.templates) ? source.templates : [];

  for (const [index, raw] of legacyMedia.entries()) {
    const item = raw as Record<string, unknown>; const id = String(item.id ?? `legacy-media-${index}`); const name = String(item.name ?? item.filename ?? "ไฟล์เดิม");
    state.media.push({ id, name, mimeType: String(item.mimeType ?? "application/octet-stream"), size: Number(item.size ?? 0), source: "external", externalUrl: typeof item.url === "string" ? item.url : null, externalPreviewUrl: null, blobKey: null, remoteStatus: "local-only", providerFileId: null, previewProviderFileId: null, tags: Array.isArray(item.tags) ? item.tags.map(String) : [], createdAt: String(item.createdAt ?? new Date(0).toISOString()), updatedAt: String(item.updatedAt ?? new Date(0).toISOString()), deletedAt: null }); report.mapped += 1;
  }
  for (const [index, raw] of legacyReferences.entries()) {
    const item = raw as Record<string, unknown>; const title = String(item.title ?? item.name ?? "").trim(); const url = String(item.url ?? item.link ?? "").trim(); if (!title || !/^https:\/\//u.test(url)) { report.skipped += 1; report.errors.push({ row: index + 1, message: "Reference ต้องมีชื่อและลิงก์ HTTPS" }); continue; }
    state.references.push({ id: String(item.id ?? `legacy-reference-${index}`), title, url, platform: String(item.platform ?? "ไม่ระบุ"), tags: Array.isArray(item.tags) ? [...new Set(item.tags.map(String))] : [], notes: String(item.notes ?? ""), createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(), deletedAt: null }); report.mapped += 1;
  }
  for (const [index, raw] of legacyTemplates.entries()) {
    const item = raw as Record<string, unknown>; const body = String(item.body ?? item.content ?? ""); const name = String(item.name ?? item.title ?? `แม่แบบเดิม ${index + 1}`); const versionId = `legacy-template-version-${index}`; state.captionTemplates.push({ id: String(item.id ?? `legacy-template-${index}`), name, versions: [{ id: versionId, version: 1, body, variables: [...body.matchAll(/\{([^}]+)\}/gu)].map((match) => match[1]), createdAt: new Date(0).toISOString() }], activeVersionId: versionId, createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(), deletedAt: null }); report.mapped += 1;
  }
  for (const [index, raw] of legacyContents.entries()) {
    const item = raw as Record<string, unknown>; const title = String(item.title ?? item.name ?? "").trim(); if (!title) { report.skipped += 1; report.errors.push({ row: index + 1, message: "คอนเทนต์ต้องมีชื่อ" }); continue; }
    const legacyStatus = String(item.productionStatus ?? item.status ?? ""); const productionStatus = statuses[legacyStatus] ?? "waiting-shoot"; const notes = statuses[legacyStatus] ? String(item.notes ?? "") : `${String(item.notes ?? "")}\nข้อมูลจากระบบเดิม: สถานะ ${legacyStatus}`.trim(); if (legacyStatus && !statuses[legacyStatus]) report.warnings.push(`แถว ${index + 1}: สถานะ ${legacyStatus} ถูกแมปเป็นรอถ่าย`);
    const content: ContentItem = { id: String(item.id ?? `legacy-content-${index}`), title, categoryId: state.categories[0].id, formatId: state.formats[0].id, owner: String(item.owner ?? "ทีมคอนเทนต์"), objective: "awareness", priority: "normal", plannedWorkAt: typeof item.plannedWorkAt === "string" ? item.plannedWorkAt : null, lastWorkedAt: null, readyDate: null, productionStatus, assetIds: [], processSteps: [], caption: String(item.caption ?? ""), captionSource: null, schedules: [], referenceIds: [], notes, localApproval: "pending", lineReview: { status: "not-sent", activeCycleId: null, reviewCode: null, providerReceipts: [], lastEventAt: null, history: [] }, createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(), deletedAt: null };
    state.contents.push(content); report.mapped += 1;
  }
  return { previewState: state, report };
}
