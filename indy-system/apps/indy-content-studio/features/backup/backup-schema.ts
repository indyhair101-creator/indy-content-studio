import type { DashboardState, IntegrationStatus } from "../domain/types";

export interface DashboardBackupV1 {
  product: "INDY Content Studio";
  schemaVersion: 1;
  exportedAt: string;
  data: Omit<DashboardState, "integrations"> & {
    integrations: Array<Pick<IntegrationStatus, "provider" | "status" | "checkedAt">>;
  };
  omittedMediaFiles: Array<{ mediaId: string; name: string; size: number }>;
}

export type DashboardImportMode = "merge" | "replace";

export interface DashboardImportPreview {
  mode: DashboardImportMode;
  counts: { contents: number; actionTasks: number; media: number; references: number; captionTemplates: number; corrections: number; publicationAttempts: number; categoryMonthlyGoals: number };
  skipped: Array<{ collection: string; id: string; reason: string }>;
  warnings: string[];
  omittedMediaFiles: DashboardBackupV1["omittedMediaFiles"];
}

export class DashboardBackupValidationError extends Error {
  constructor(message: string) { super(message); this.name = "DashboardBackupValidationError"; }
}
