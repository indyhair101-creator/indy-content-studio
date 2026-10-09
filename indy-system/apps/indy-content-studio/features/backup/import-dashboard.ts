import type { DashboardState } from "../domain/types";
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
  if (options.mode === "replace") return clone(backup.data) as DashboardState;

  const next = clone(current);
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
  return next;
}

export { parseDashboardBackup, validateDashboardBackup } from "./export-dashboard";
export { previewDashboardImport };
export type { DashboardBackupV1 } from "./backup-schema";
