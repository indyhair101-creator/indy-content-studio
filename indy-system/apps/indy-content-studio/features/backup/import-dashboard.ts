import type { DashboardState } from "../domain/types";
import { importWorkStatusHistory } from "../reports/work-status-history";
import { mergeReportImport } from "../reports/report-schema";
import { emptyReportingState } from "../reports/report-types";
import type { DashboardBackupV1, DashboardImportMode } from "./backup-schema";
import { previewDashboardImport, validateDashboardBackup } from "./export-dashboard";

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }

type BackupCollection = "contents" | "actionTasks" | "media" | "categories" | "formats" | "references" | "captionTemplates" | "corrections" | "monthlyGoals" | "categoryMonthlyGoals" | "publicationAttempts" | "integrations";

type CollectionItem = { id?: string; month?: string; categoryId?: string; provider?: string };

function collectionKey(collection: BackupCollection, item: CollectionItem): string | undefined {
  if (collection === "monthlyGoals") return item.month;
  if (collection === "categoryMonthlyGoals") return item.month && item.categoryId ? `${item.month}:${item.categoryId}` : undefined;
  if (collection === "integrations") return item.provider;
  return item.id;
}

export interface ApplyDashboardImportOptions {
  mode: DashboardImportMode;
  preRestoreBackup?: DashboardBackupV1;
}

export function applyDashboardImport(current: DashboardState, input: DashboardBackupV1, options: ApplyDashboardImportOptions): DashboardState {
  const backup = validateDashboardBackup(input);
  if (options.mode === "replace" && !options.preRestoreBackup) throw new Error("ต้องสร้าง backup ก่อนแทนที่ข้อมูล");
  if (options.mode === "replace") return importWorkStatusHistory(current, clone(backup.data) as DashboardState, backup.data.statusHistory);

  const next = clone(current);
  const existingAlbumIds = new Set((next.referenceAlbums ?? []).map((album) => album.id));
  next.referenceAlbums = [...(next.referenceAlbums ?? []), ...clone((backup.data.referenceAlbums ?? []).filter((album) => !existingAlbumIds.has(album.id)))];
  const collections: BackupCollection[] = ["contents", "actionTasks", "media", "categories", "formats", "references", "captionTemplates", "corrections", "monthlyGoals", "categoryMonthlyGoals", "publicationAttempts", "integrations"];
  for (const collection of collections) {
    const existing = new Set((next[collection] as CollectionItem[]).map((item) => collectionKey(collection, item)).filter((key): key is string => Boolean(key)));
    const incoming = backup.data[collection] as CollectionItem[];
    const additions = incoming.filter((item) => {
      const key = collectionKey(collection, item);
      return key !== undefined && !existing.has(key);
    });
    (next[collection] as unknown as Array<unknown>).push(...clone(additions));
  }
  for (const owner of backup.data.ownerOptions) {
    if (!next.ownerOptions.some((current) => current.localeCompare(owner, undefined, { sensitivity: "accent" }) === 0)) next.ownerOptions.push(owner);
  }
  if (backup.data.reporting) {
    next.reporting = mergeReportImport(next.reporting ?? emptyReportingState(), { schemaVersion: 1, publications: backup.data.reporting.publications, observations: backup.data.reporting.observations });
    for (const collection of ["connections", "savedReports"] as const) {
      const ids = new Set(next.reporting[collection].map((item) => item.id));
      const additions = backup.data.reporting[collection].filter((item) => !ids.has(item.id));
      (next.reporting[collection] as unknown[]).push(...clone(additions));
    }
  }
  const addedContentIds = new Set(next.contents.filter((item) => !current.contents.some((existing) => existing.id === item.id)).map((item) => item.id));
  const addedTaskIds = new Set(next.actionTasks.filter((item) => !current.actionTasks.some((existing) => existing.id === item.id)).map((item) => item.id));
  return importWorkStatusHistory(current, next, backup.data.statusHistory?.filter((event) => event.contentId ? addedContentIds.has(event.contentId) : addedTaskIds.has(event.entityId)));
}

export { parseDashboardBackup, validateDashboardBackup } from "./export-dashboard";
export { previewDashboardImport };
export type { DashboardBackupV1 } from "./backup-schema";
