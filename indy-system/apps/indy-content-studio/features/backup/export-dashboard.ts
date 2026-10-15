import type { DashboardState } from "../domain/types";
import { validateWorkStatusHistory } from "../reports/work-status-history";
import { validateReportingState } from "../reports/report-schema";
import { DEFAULT_OWNER_OPTIONS } from "../domain/create-empty-state";
import { DashboardBackupValidationError, type DashboardBackupV1, type DashboardImportMode, type DashboardImportPreview } from "./backup-schema";

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }

export function exportDashboardState(state: DashboardState, clock: (() => string | Date) | string | Date = () => new Date()): DashboardBackupV1 {
  const exportedAt = typeof clock === "function" ? clock() : clock;
  const data = clone({ ...state, integrations: state.integrations.map(({ provider, status, checkedAt }) => ({ provider, status, checkedAt })) });
  return {
    product: "INDY Content Studio",
    schemaVersion: 1,
    exportedAt: exportedAt instanceof Date ? exportedAt.toISOString() : exportedAt,
    data,
    omittedMediaFiles: state.media.map((media) => ({ mediaId: media.id, name: media.name, size: media.size })),
  };
}

function ids(values: Array<{ id: string }>, collection: string): Set<string> {
  const output = new Set<string>();
  for (const value of values) {
    if (!value.id || typeof value.id !== "string") throw new DashboardBackupValidationError(`${collection} มีรายการไม่มี ID`);
    if (output.has(value.id)) throw new DashboardBackupValidationError(`${collection} มี ID ซ้ำ: ${value.id}`);
    output.add(value.id);
  }
  return output;
}

export function validateDashboardBackup(input: unknown): DashboardBackupV1 {
  if (!input || typeof input !== "object") throw new DashboardBackupValidationError("ไฟล์สำรองไม่ใช่ object");
  const backup = input as Partial<DashboardBackupV1>;
  if (backup.product !== "INDY Content Studio" || backup.schemaVersion !== 1 || typeof backup.exportedAt !== "string" || !backup.data) throw new DashboardBackupValidationError("ไม่รองรับไฟล์สำรองนี้");
  const rawData = backup.data as DashboardBackupV1["data"];
  try { validateWorkStatusHistory(rawData.statusHistory); } catch { throw new DashboardBackupValidationError("ประวัติสถานะไม่ถูกต้อง"); }
  try { if (rawData.reporting !== undefined) validateReportingState(rawData.reporting); } catch (error) { throw new DashboardBackupValidationError(error instanceof Error ? error.message : "ข้อมูลรายงานไม่ถูกต้อง"); }
  const collections = ["contents", "media", "categories", "formats", "references", "captionTemplates", "corrections", "monthlyGoals", "publicationAttempts", "integrations"] as const;
  for (const collection of collections) {
    if (!Array.isArray(rawData[collection])) throw new DashboardBackupValidationError(`ข้อมูล ${collection} ไม่ถูกต้อง`);
  }
  if (rawData.actionTasks !== undefined && !Array.isArray(rawData.actionTasks)) throw new DashboardBackupValidationError("ข้อมูล actionTasks ไม่ถูกต้อง");
  if (rawData.referenceAlbums !== undefined && !Array.isArray(rawData.referenceAlbums)) throw new DashboardBackupValidationError("ข้อมูลอัลบั้ม Reference ไม่ถูกต้อง");
  if (rawData.categoryMonthlyGoals !== undefined && !Array.isArray(rawData.categoryMonthlyGoals)) throw new DashboardBackupValidationError("ข้อมูล categoryMonthlyGoals ไม่ถูกต้อง");
  const rawOwnerOptions = rawData.ownerOptions as unknown;
  if (rawOwnerOptions !== undefined && (!Array.isArray(rawOwnerOptions) || rawOwnerOptions.some((name) => typeof name !== "string" || !name.trim()))) throw new DashboardBackupValidationError("รายชื่อผู้รับผิดชอบไม่ถูกต้อง");
  const ownerOptions = (rawOwnerOptions === undefined ? [...DEFAULT_OWNER_OPTIONS] : rawOwnerOptions as string[])
    .map((name) => name.trim())
    .filter((name, index, names) => names.findIndex((candidate) => candidate.localeCompare(name, undefined, { sensitivity: "accent" }) === 0) === index);
  const data = { ...rawData, ownerOptions, actionTasks: rawData.actionTasks ?? [], categoryMonthlyGoals: rawData.categoryMonthlyGoals ?? [] };
  const mediaIds = ids(data.media, "media");
  const categoryIds = ids(data.categories, "categories");
  const formatIds = ids(data.formats, "formats");
  const referenceIds = ids(data.references, "references");
  const albumIds = ids(data.referenceAlbums ?? [], "referenceAlbums");
  const albumNames = new Set<string>();
  for (const album of data.referenceAlbums ?? []) {
    if (typeof album.name !== "string" || !album.name.trim() || typeof album.createdAt !== "string" || typeof album.updatedAt !== "string") throw new DashboardBackupValidationError("ข้อมูลอัลบั้ม Reference ไม่ถูกต้อง");
    const name = album.name.trim().toLocaleLowerCase();
    if (albumNames.has(name)) throw new DashboardBackupValidationError("ชื่ออัลบั้ม Reference ซ้ำ");
    albumNames.add(name);
  }
  for (const reference of data.references) {
    if (reference.albumId != null && !albumIds.has(reference.albumId)) throw new DashboardBackupValidationError("Reference อ้างอิงอัลบั้มที่ไม่มี");
    if (reference.assetIds !== undefined && (!Array.isArray(reference.assetIds) || new Set(reference.assetIds).size !== reference.assetIds.length || reference.assetIds.some((id) => !mediaIds.has(id)))) throw new DashboardBackupValidationError("Reference อ้างอิงสื่อที่ไม่มี");
  }
  const contentIds = ids(data.contents, "contents");
  ids(data.actionTasks, "actionTasks");
  const goalKeys = new Set<string>();
  for (const goal of data.categoryMonthlyGoals) {
    const key = `${goal.month}:${goal.categoryId}`;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(goal.month) || !categoryIds.has(goal.categoryId) || !Number.isInteger(goal.target) || goal.target < 1) {
      throw new DashboardBackupValidationError("เป้าหมายรายหมวดมีข้อมูลไม่ถูกต้อง");
    }
    if (goalKeys.has(key)) throw new DashboardBackupValidationError(`เป้าหมายรายหมวดซ้ำ: ${key}`);
    goalKeys.add(key);
  }
  for (const task of data.actionTasks) {
    if (!task.title?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(task.scheduledDate) || !["todo", "doing", "done"].includes(task.status)) {
      throw new DashboardBackupValidationError(`งาน Action Plan ${task.id} มีข้อมูลไม่ถูกต้อง`);
    }
  }
  ids(data.captionTemplates, "captionTemplates"); ids(data.corrections, "corrections"); ids(data.publicationAttempts, "publicationAttempts");
  for (const content of data.contents) {
    if (!categoryIds.has(content.categoryId) || !formatIds.has(content.formatId)) throw new DashboardBackupValidationError(`คอนเทนต์ ${content.id} อ้างอิงหมวดหมู่หรือรูปแบบที่ไม่มี`);
    if (content.assetIds.some((id) => !mediaIds.has(id))) throw new DashboardBackupValidationError(`คอนเทนต์ ${content.id} อ้างอิงสื่อที่ไม่มี`);
    if (content.referenceIds.some((id) => !referenceIds.has(id))) throw new DashboardBackupValidationError(`คอนเทนต์ ${content.id} อ้างอิง Reference ที่ไม่มี`);
  }
  for (const correction of data.corrections) {
    if (correction.source === "line-unmatched" && correction.contentId === "" && correction.cycleId === "") continue;
    if (!contentIds.has(correction.contentId)) throw new DashboardBackupValidationError(`งานแก้ ${correction.id} อ้างอิงคอนเทนต์ที่ไม่มี`);
  }
  for (const attempt of data.publicationAttempts) if (!contentIds.has(attempt.contentId)) throw new DashboardBackupValidationError(`คิวเผยแพร่ ${attempt.id} อ้างอิงคอนเทนต์ที่ไม่มี`);
  return clone({ ...backup, data }) as DashboardBackupV1;
}

export function parseDashboardBackup(input: string | unknown): DashboardBackupV1 {
  let parsed: unknown = input;
  if (typeof input === "string") {
    try { parsed = JSON.parse(input); } catch { throw new DashboardBackupValidationError("ไฟล์สำรองไม่ใช่ JSON ที่ถูกต้อง"); }
  }
  return validateDashboardBackup(parsed);
}

type CollectionEntry = { id?: string; month?: string; categoryId?: string; provider?: string };

function collectionEntries(backup: DashboardBackupV1, collection: keyof DashboardBackupV1["data"]): CollectionEntry[] {
  const value = backup.data[collection];
  return Array.isArray(value) ? value as CollectionEntry[] : [];
}

function collectionKey(collection: keyof DashboardBackupV1["data"], item: CollectionEntry): string | undefined {
  if (collection === "monthlyGoals") return item.month;
  if (collection === "categoryMonthlyGoals") return item.month && item.categoryId ? `${item.month}:${item.categoryId}` : undefined;
  if (collection === "integrations") return item.provider;
  return item.id;
}

export function previewDashboardImport(current: DashboardState, backup: DashboardBackupV1, mode: DashboardImportMode = "merge"): DashboardImportPreview {
  const validated = validateDashboardBackup(backup);
  const collections = ["contents", "actionTasks", "media", "references", "captionTemplates", "corrections", "publicationAttempts", "categoryMonthlyGoals"] as const;
  const skipped: DashboardImportPreview["skipped"] = [];
  const counts = { contents: 0, actionTasks: 0, media: 0, references: 0, captionTemplates: 0, corrections: 0, publicationAttempts: 0, categoryMonthlyGoals: 0 };
  for (const collection of collections) {
    const currentIds = new Set(collectionEntries({ ...validated, data: current as DashboardBackupV1["data"] }, collection).map((item) => collectionKey(collection, item)).filter((key): key is string => Boolean(key)));
    for (const item of collectionEntries(validated, collection)) {
      const key = collectionKey(collection, item);
      if (mode === "merge" && key && currentIds.has(key)) skipped.push({ collection, id: key, reason: "มีข้อมูลอยู่แล้ว" });
      else counts[collection] += 1;
    }
  }
  return { mode, counts, skipped, warnings: [], omittedMediaFiles: validated.omittedMediaFiles };
}
