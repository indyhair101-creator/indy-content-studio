import { describe, expect, it } from "vitest";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import { DashboardBackupValidationError } from "../features/backup/backup-schema";
import { exportDashboardState } from "../features/backup/export-dashboard";
import { applyDashboardImport, parseDashboardBackup, previewDashboardImport } from "../features/backup/import-dashboard";

describe("dashboard backup", () => {
  it("round trips unassigned LINE feedback without weakening ordinary content reference validation", () => {
    const state = createEmptyDashboardState();
    state.corrections.push({id:"line-inbox-event-1",source:"line-unmatched",contentId:"",cycleId:"",comment:"ไม่ผ่าน",receivedAt:"now",status:"open",resolvedAt:null});
    const backup = exportDashboardState(state, "now");
    expect(parseDashboardBackup(backup).data.corrections).toEqual(state.corrections);
    backup.data.corrections[0].contentId = "nonexistent";
    expect(() => parseDashboardBackup(backup)).toThrow(/อ้างอิงคอนเทนต์ที่ไม่มี/);
  });
  it("exports a versioned metadata-only envelope and round trips it", () => {
    const state = createEmptyDashboardState();
    state.media.push({ id: "asset-1", name: "clip.mp4", mimeType: "video/mp4", size: 12, source: "upload", externalUrl: null, externalPreviewUrl: null, blobKey: "blob-1", remoteStatus: "local-only", providerFileId: null, previewProviderFileId: null, tags: [], createdAt: "now", updatedAt: "now", deletedAt: null });
    const backup = exportDashboardState(state, "2026-09-18T00:00:00.000Z");
    expect(backup).toMatchObject({ product: "INDY Content Studio", schemaVersion: 1, exportedAt: "2026-09-18T00:00:00.000Z" });
    expect(JSON.stringify(backup)).not.toContain("channel-secret");
    expect(JSON.stringify(backup)).not.toContain("data:video");
    expect(parseDashboardBackup(JSON.stringify(backup)).data.media[0].name).toBe("clip.mp4");
  });

  it("rejects future versions, duplicate IDs, and broken references", () => {
    const backup = exportDashboardState(createEmptyDashboardState(), "now");
    expect(() => parseDashboardBackup(JSON.stringify({ ...backup, schemaVersion: 2 }))).toThrow(DashboardBackupValidationError);
    const duplicate = { ...backup, data: { ...backup.data, references: [{ id: "x" }, { id: "x" }] } };
    expect(() => parseDashboardBackup(duplicate)).toThrow(/ID ซ้ำ/);
  });

  it("previews merge collisions and requires a pre-restore backup for replace", () => {
    const current = createEmptyDashboardState();
    const backup = exportDashboardState(current, "now");
    const preview = previewDashboardImport(current, backup, "merge");
    expect(preview.mode).toBe("merge");
    expect(() => applyDashboardImport(current, backup, { mode: "replace" })).toThrow(/สร้าง backup/);
    expect(applyDashboardImport(current, backup, { mode: "replace", preRestoreBackup: backup })).toMatchObject({ schemaVersion: 1 });
  });

  it("round trips independent Action Plan tasks and reads older backups without them", () => {
    const state = createEmptyDashboardState();
    state.actionTasks.push({ id: "task-1", title: "ถ่ายรูป", scheduledDate: "2026-09-24", status: "todo", createdAt: "now", updatedAt: "now" });
    state.categoryMonthlyGoals.push({ month: "2026-09", categoryId: "category-knowledge", target: 4 });
    const backup = exportDashboardState(state, "now");
    expect(parseDashboardBackup(backup).data.actionTasks).toEqual(state.actionTasks);
    expect(parseDashboardBackup(backup).data.categoryMonthlyGoals).toEqual(state.categoryMonthlyGoals);
    const legacy = structuredClone(backup) as typeof backup;
    delete (legacy.data as Partial<typeof legacy.data>).actionTasks;
    delete (legacy.data as Partial<typeof legacy.data>).categoryMonthlyGoals;
    expect(parseDashboardBackup(legacy).data.actionTasks).toEqual([]);
    expect(parseDashboardBackup(legacy).data.categoryMonthlyGoals).toEqual([]);
  });

  it("previews and merges category goals without duplicate month/category entries", () => {
    const current = createEmptyDashboardState();
    current.categoryMonthlyGoals.push({ month: "2026-09", categoryId: "category-knowledge", target: 4 });
    const backupState = createEmptyDashboardState();
    backupState.categoryMonthlyGoals.push(
      { month: "2026-09", categoryId: "category-knowledge", target: 8 },
      { month: "2026-09", categoryId: "category-review", target: 3 },
    );
    const backup = exportDashboardState(backupState, "now");
    const preview = previewDashboardImport(current, backup, "merge");
    expect(preview.counts.categoryMonthlyGoals).toBe(1);
    expect(applyDashboardImport(current, backup, { mode: "merge" }).categoryMonthlyGoals).toEqual([
      { month: "2026-09", categoryId: "category-knowledge", target: 4 },
      { month: "2026-09", categoryId: "category-review", target: 3 },
    ]);
  });

  it("rejects an invalid category target in a backup", () => {
    const state = createEmptyDashboardState();
    state.categoryMonthlyGoals.push({ month: "2026-09", categoryId: "category-knowledge", target: 2 });
    const backup = exportDashboardState(state, "now");
    const invalid = { ...backup, data: { ...backup.data, categoryMonthlyGoals: [{ month: "2026-09", categoryId: "category-knowledge", target: 0 }] } };
    expect(() => parseDashboardBackup(invalid)).toThrow("เป้าหมายรายหมวดมีข้อมูลไม่ถูกต้อง");
  });
});
