import { describe, expect, it } from "vitest";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import type { ContentItem, DashboardState } from "../features/domain/types";
import { captureWorkStatusHistory, importWorkStatusHistory, validateWorkStatusHistory } from "../features/reports/work-status-history";
import { defaultReportFilters } from "../features/reports/report-dates";
import { selectTeamReport } from "../features/reports/team-report-selectors";
import { copyContentAsNew } from "../features/content/content-commands";
import { setCalendarContentStatus } from "../features/calendar/calendar-commands";
import { exportDashboardState, validateDashboardBackup } from "../features/backup/export-dashboard";
import { applyDashboardImport } from "../features/backup/import-dashboard";
import { NeonDashboardRepository } from "../features/data/server/neon-dashboard-repository";

const at = "2026-10-08T17:00:00.000Z"; // October 9 in Bangkok
const filters = { ...defaultReportFilters(at), range: { start: "2026-10-09", end: "2026-10-09" } };
function content(id = "one", patch: Partial<ContentItem> = {}): ContentItem {
  return { id, title: id, categoryId: "category-knowledge", formatId: "format-video", owner: "ทีม", objective: "awareness", priority: "normal", plannedWorkAt: null, lastWorkedAt: null, readyDate: "2026-10-09", productionStatus: "editing", assetIds: [], processSteps: [{ id: "step", name: "ตัดต่อ", scheduledDate: "2026-10-09", status: "doing", order: 1 }], caption: "", captionSource: null, schedules: ["facebook", "instagram", "tiktok"].map((platform) => ({ platform: platform as "facebook", enabled: true, publishAt: null, latestAttemptId: null, manualEvidence: null })), referenceIds: [], notes: "", localApproval: "pending", lineReview: { status: "not-sent", activeCycleId: null, reviewCode: null, providerReceipts: [], lastEventAt: null, history: [] }, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: at, deletedAt: null, ...patch };
}
function fixture(): DashboardState { return { ...createEmptyDashboardState(), contents: [content()] }; }

describe("authoritative status evidence", () => {
  it("preserves known completion and step history when restoring the same item from trash", () => {
    const state = fixture();
    const completed = captureWorkStatusHistory(state, setCalendarContentStatus(state, ["one"], "published", at), at);
    const trashed = captureWorkStatusHistory(completed, { ...completed, contents: [{ ...completed.contents[0], deletedAt: at }] }, at);
    const restored = captureWorkStatusHistory(trashed, { ...trashed, contents: [{ ...trashed.contents[0], deletedAt: null }] }, "2026-10-09T03:00:00Z");
    expect(restored.statusHistory).toEqual(completed.statusHistory);
    expect(selectTeamReport(restored, filters, at).completed[0].completion?.occurredAt).toBe(at);
  });
  it("orders imported offset timestamps by instant, preserving the latest completion and lateness", () => {
    const state = fixture(); state.contents[0].productionStatus = "published";
    const base = { entity: "content" as const, contentId: "one", entityId: "one", owner: "ทีม", scheduledDate: "2026-10-08", source: "observed" as const };
    state.statusHistory = [
      { ...base, id: "a", from: "editing", to: "published", occurredAt: "2026-10-08T23:00:00+07:00" },
      { ...base, id: "b", from: "published", to: "editing", occurredAt: "2026-10-08T16:30:00Z" },
      { ...base, id: "c", from: "editing", to: "published", occurredAt: "2026-10-08T17:00:00Z" },
    ];
    const report = selectTeamReport(state, filters, at);
    expect(report.completed[0].completion?.id).toBe("c");
    expect(report.late).toBe(1);
  });
  it("captures manual publication and automatic step closure once, preserving server evidence against stale clients", () => {
    const state = fixture();
    const next = captureWorkStatusHistory(state, setCalendarContentStatus(state, ["one"], "published", at), at);
    expect(next.statusHistory).toHaveLength(2);
    expect(next.statusHistory?.map((event) => event.source)).toEqual(["manual-publication", "manual-publication"]);
    const stale = { ...next, statusHistory: [{ ...next.statusHistory![0], owner: "rewrite", occurredAt: "2020-01-01T00:00:00Z" }] };
    expect(captureWorkStatusHistory(next, stale, at).statusHistory).toEqual(next.statusHistory);
    expect(selectTeamReport(next, filters, at).steps[0].autoClosed).toBe(true);
  });
  it("records server publication sync separately", () => {
    const state = fixture();
    const next = setCalendarContentStatus(state, ["one"], "published", at);
    next.publicationAttempts = [{ id: "p", contentId: "one", platform: "facebook", status: "published", publishAt: at, createdAt: at, updatedAt: at, idempotencyKey: "p", queueId: null, providerPublicationId: "external", receiptUrl: null, errorCode: null }];
    expect(captureWorkStatusHistory(state, next, at).statusHistory?.every((event) => event.source === "publication-sync")).toBe(true);
  });
  it("does not infer legacy completion from updatedAt or a newly inserted completed baseline", () => {
    const state = fixture(); state.contents[0].productionStatus = "published";
    const imported = captureWorkStatusHistory(createEmptyDashboardState(), state, at);
    expect(selectTeamReport(imported, filters, at)).toMatchObject({ unknownCompletion: 1, onTime: 0, late: 0 });
    expect(selectTeamReport(state, filters, at).completed).toEqual([]);
  });
  it("invalidates a completion on reopening; copying and owner renaming do not inherit or rewrite evidence", () => {
    const state = fixture();
    const completed = captureWorkStatusHistory(state, setCalendarContentStatus(state, ["one"], "published", at), at);
    const renamed = { ...completed, contents: [{ ...completed.contents[0], owner: "ชื่อใหม่" }] };
    expect(selectTeamReport(renamed, { ...filters, owner: "ชื่อใหม่" }, at).completed[0].completion?.owner).toBe("ทีม");
    const reopened = captureWorkStatusHistory(completed, setCalendarContentStatus(completed, ["one"], "editing", at), "2026-10-09T01:00:00Z");
    expect(selectTeamReport(reopened, filters, at).completed).toEqual([]);
    const copied = captureWorkStatusHistory(completed, { ...completed, contents: [...completed.contents, copyContentAsNew(completed.contents[0], "copy", at)] }, at);
    expect(selectTeamReport(copied, filters, at).undated[0].completion).toBeNull();
    const recompleted = captureWorkStatusHistory(reopened, setCalendarContentStatus(reopened, ["one"], "published", at), "2026-10-09T02:00:00Z");
    expect(selectTeamReport(recompleted, filters, at).completed[0].completion?.occurredAt).toBe("2026-10-09T02:00:00Z");
  });
  it("imports preserve valid evidence and baseline status-only restores without inventing completion", () => {
    const state = fixture();
    const completed = captureWorkStatusHistory(state, setCalendarContentStatus(state, ["one"], "published", at), at);
    const imported = applyDashboardImport(createEmptyDashboardState(), exportDashboardState(completed), { mode: "merge" });
    expect(selectTeamReport(imported, filters, at).onTime).toBe(1);
    expect(importWorkStatusHistory(imported, imported, completed.statusHistory, at).statusHistory).toHaveLength(2);
    const legacy = { ...completed, statusHistory: undefined };
    const restored = applyDashboardImport(state, exportDashboardState(legacy), { mode: "replace", preRestoreBackup: exportDashboardState(state) });
    const saved = captureWorkStatusHistory(state, restored, at);
    expect(selectTeamReport(saved, filters, at).unknownCompletion).toBe(1);
    expect(saved.statusHistory?.every((event) => event.source === "import")).toBe(true);
  });
  it("validates history and stores captured transitions through Neon rather than trusting incoming history", async () => {
    let stored = fixture();
    let version = 1;
    const repository = new NeonDashboardRepository({ execute: async (query, params) => {
      if (query.includes("FROM approved_publication_jobs")) return [];
      if (query.startsWith("SELECT")) return [{ version, state: stored }];
      if (query.startsWith("UPDATE")) { stored = params[1] as DashboardState; return [{ version: ++version }]; }
      throw new Error(query);
    } });
    const saved = await repository.saveDashboardState(setCalendarContentStatus(stored, ["one"], "published", at), version, { includeState: true });
    expect(stored.statusHistory).toHaveLength(2);
    expect(saved.state).toEqual(stored);
    expect(saved.state?.statusHistory).toHaveLength(2);
    const backup = exportDashboardState(stored);
    backup.data.statusHistory![0].scheduledDate = "2026-02-30";
    expect(() => validateDashboardBackup(backup)).toThrow("ประวัติสถานะ");
    expect(() => validateWorkStatusHistory([{ ...stored.statusHistory![0], occurredAt: "unknown" }])).toThrow();
  });
});

describe("team counts and Bangkok cohorts", () => {
  it("counts one content with three channels once, keeps ready unfinished, and separates standalone tasks", () => {
    const state = fixture(); state.contents[0].productionStatus = "ready";
    state.actionTasks = [{ id: "task", title: "โทรหา supplier", scheduledDate: "2026-10-09", owner: "ทีม", status: "todo", createdAt: at, updatedAt: at }];
    const report = selectTeamReport(state, filters, at);
    expect(report.totals).toMatchObject({ planned: 1, done: 0, doing: 1 });
    expect(report.actionTotals.planned).toBe(1);
    expect(report.owners[0]).toMatchObject({ contents: 1, actions: 1 });
    expect(report.collisions[0].rows).toHaveLength(2);
    expect(report.planned[0].channels).toBe(3);
    expect(selectTeamReport(state, { ...filters, platform: "facebook" }, at).actions).toEqual([]);
  });
  it("uses completion Bangkok date and the captured deadline, not a later reschedule", () => {
    const state = fixture(); state.contents[0].readyDate = "2026-10-08";
    const completed = captureWorkStatusHistory(state, setCalendarContentStatus(state, ["one"], "published", at), at);
    completed.contents[0].readyDate = "2026-11-01";
    const report = selectTeamReport(completed, filters, at);
    expect(report.planned).toHaveLength(0);
    expect(report.completed).toHaveLength(1);
    expect(report.late).toBe(1);
    expect(selectTeamReport(completed, { ...filters, range: { start: "2026-10-08", end: "2026-10-08" } }, at).completed).toHaveLength(0);
  });
  it("separates older backlog and undated work, and only reports evidenced step dwell", () => {
    const state = fixture();
    state.contents = [content("past", { readyDate: "2026-10-01" }), content("none", { readyDate: null }), content("local", { readyDate: null, plannedWorkAt: "2026-10-09T23:30" })];
    const report = selectTeamReport(state, filters, at);
    expect(report.backlog.map((row) => row.id)).toEqual(["past"]);
    expect(report.undated.map((row) => row.id)).toEqual(["none"]);
    expect(report.planned.map((row) => row.id)).toEqual(["local"]);
    expect(report.steps.every((step) => step.ageDays === null)).toBe(true);
    const observed = captureWorkStatusHistory(createEmptyDashboardState(), state, "2026-10-06T17:00:00Z");
    expect(selectTeamReport(observed, filters, at).steps.every((step) => step.ageDays === 2)).toBe(true);
  });
});
