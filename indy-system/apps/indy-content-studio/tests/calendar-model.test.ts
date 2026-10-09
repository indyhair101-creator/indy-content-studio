import { describe, expect, it } from "vitest";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import { buildCalendarMonth, createBangkokScheduleTimestamp, formatBangkokSchedule, getPlatformScheduleState } from "../features/calendar/calendar-selectors";
import { moveContentSchedules, movePlatformSchedule } from "../features/calendar/calendar-commands";

describe("calendar model", () => {
  it("builds days and schedule state", () => {
    const state = createEmptyDashboardState();
    expect(buildCalendarMonth(state, { month: "2026-09" }).cells).toHaveLength(42);
    expect(getPlatformScheduleState({ enabled: true, publishAt: "2026-09-01T09:00", latestAttemptId: null }, "2026-09-02T00:00")).toBe("overdue");
  });

  it("places a content item on its planned date without requiring platform schedules", () => {
    const state = createEmptyDashboardState();
    state.contents.push({
      id: "planned-only",
      title: "งานที่วางแผนไว้",
      categoryId: "category-knowledge",
      formatId: "format-video",
      owner: "ทีม",
      objective: "awareness",
      priority: "normal",
      plannedWorkAt: "2026-09-18T14:30",
      lastWorkedAt: null,
      readyDate: null,
      productionStatus: "waiting-shoot",
      assetIds: [],
      processSteps: [],
      caption: "",
      captionSource: null,
      schedules: [],
      referenceIds: [],
      notes: "",
      localApproval: "pending",
      lineReview: { status: "not-sent", activeCycleId: null, reviewCode: null, providerReceipts: [], lastEventAt: null, history: [] },
      createdAt: "2026-09-18T00:00:00.000Z",
      updatedAt: "2026-09-18T00:00:00.000Z",
      deletedAt: null,
    });

    const view = buildCalendarMonth(state, { month: "2026-09" });
    const plannedDay = view.cells.find((cell) => cell.date === "2026-09-18");

    expect(plannedDay?.items.map((item) => item.id)).toEqual(["planned-only"]);
    expect(view.unscheduled.map((item) => item.id)).not.toContain("planned-only");
  });

  it("keeps independent Action Plan tasks out of the content calendar", () => {
    const state = createEmptyDashboardState();
    state.actionTasks.push({ id: "personal-task", title: "ถ่ายรูปส่วนตัว", scheduledDate: "2026-09-18", status: "todo", createdAt: "now", updatedAt: "now" });
    const view = buildCalendarMonth(state, { month: "2026-09" });
    expect(view.cells.flatMap((cell) => cell.items)).toEqual([]);
    expect(view.unscheduled).toEqual([]);
  });

  it("moves dates while retaining time", () => {
    const state = createEmptyDashboardState();
    state.contents.push({ id: "c", title: "งาน", categoryId: "category-knowledge", formatId: "format-video", owner: "ทีม", objective: "awareness", priority: "normal", plannedWorkAt: "2026-09-02", lastWorkedAt: null, readyDate: null, productionStatus: "waiting-shoot", assetIds: [], processSteps: [], caption: "", captionSource: null, schedules: [{ platform: "facebook", enabled: true, publishAt: "2026-09-02T09:00", latestAttemptId: null, manualEvidence: null }], referenceIds: [], notes: "", localApproval: "pending", lineReview: { status: "not-sent", activeCycleId: null, reviewCode: null, providerReceipts: [], lastEventAt: null, history: [] }, createdAt: "now", updatedAt: "now", deletedAt: null });
    const moved = moveContentSchedules(state, "c", "2026-09-05", ["facebook"], "later").contents[0];
    expect(moved.schedules[0].publishAt).toBe("2026-09-05T09:00");
    expect(moved.plannedWorkAt).toBe("2026-09-05");
  });

  it("combines same-day platform schedules into one event while retaining each channel time", () => {
    const state = createEmptyDashboardState();
    state.contents.push({
      id: "multi", title: "หลายช่องทาง", categoryId: "category-knowledge", formatId: "format-video", owner: "ทีม", objective: "awareness", priority: "normal",
      plannedWorkAt: null, lastWorkedAt: null, readyDate: null, productionStatus: "ready", assetIds: [], processSteps: [], caption: "พร้อม", captionSource: null,
      schedules: [
        { platform: "instagram", enabled: true, publishAt: createBangkokScheduleTimestamp("2026-09-18", "12:00"), latestAttemptId: null, manualEvidence: null },
        { platform: "facebook", enabled: true, publishAt: createBangkokScheduleTimestamp("2026-09-18", "09:00"), latestAttemptId: null, manualEvidence: null },
        { platform: "tiktok", enabled: true, publishAt: createBangkokScheduleTimestamp("2026-09-19", "08:00"), latestAttemptId: null, manualEvidence: null },
      ], referenceIds: [], notes: "", localApproval: "approved",
      lineReview: { status: "not-sent", activeCycleId: null, reviewCode: null, providerReceipts: [], lastEventAt: null, history: [] }, createdAt: "now", updatedAt: "now", deletedAt: null,
    });

    const all = buildCalendarMonth(state, { month: "2026-09", platform: "all" });
    const day = all.cells.find((cell) => cell.date === "2026-09-18");
    expect(day?.events).toHaveLength(1);
    expect(day?.events[0]).toMatchObject({ platform: null, date: "2026-09-18", channelTimes: [{ platform: "facebook", time: "09:00" }, { platform: "instagram", time: "12:00" }] });
    expect(day?.items.map((item) => item.id)).toEqual(["multi"]);
    expect(buildCalendarMonth(state, { month: "2026-09", platform: "instagram" }).cells.find((cell) => cell.date === "2026-09-18")?.events.map((event) => event.platform)).toEqual(["instagram"]);
    expect(buildCalendarMonth(state, { month: "2026-09", platform: "facebook" }).cells.find((cell) => cell.date === "2026-09-19")?.events).toEqual([]);
  });

  it("keeps legacy Bangkok wall times and moves only the selected platform", () => {
    expect(formatBangkokSchedule("2026-09-18T09:30")).toEqual({ date: "2026-09-18", time: "09:30" });
    expect(formatBangkokSchedule("2026-09-18T02:30:00.000Z")).toEqual({ date: "2026-09-18", time: "09:30" });
    const state = createEmptyDashboardState();
    state.contents.push({
      id: "move-one", title: "ย้ายช่องทางเดียว", categoryId: "category-knowledge", formatId: "format-video", owner: "ทีม", objective: "awareness", priority: "normal",
      plannedWorkAt: "2026-09-17T10:00", lastWorkedAt: null, readyDate: null, productionStatus: "waiting-shoot", assetIds: [], processSteps: [], caption: "", captionSource: null,
      schedules: [
        { platform: "facebook", enabled: true, publishAt: "2026-09-18T09:00", latestAttemptId: null, manualEvidence: null },
        { platform: "instagram", enabled: true, publishAt: "2026-09-18T12:00", latestAttemptId: null, manualEvidence: null },
      ], referenceIds: [], notes: "", localApproval: "pending",
      lineReview: { status: "not-sent", activeCycleId: null, reviewCode: null, providerReceipts: [], lastEventAt: null, history: [] }, createdAt: "now", updatedAt: "now", deletedAt: null,
    });
    const moved = movePlatformSchedule(state, "move-one", "facebook", "2026-09-20", "later").contents[0];
    expect(moved.schedules.map((schedule) => schedule.publishAt)).toEqual(["2026-09-20T09:00:00+07:00", "2026-09-18T12:00"]);
    expect(moved.plannedWorkAt).toBe("2026-09-17T10:00");
  });

  it("does not treat a queued attempt as publication success", () => {
    expect(getPlatformScheduleState({ enabled: true, publishAt: "2026-09-30T09:00+07:00", latestAttemptId: "attempt-1", manualEvidence: null }, "2026-09-27T00:00+07:00", [{ id: "attempt-1", status: "queued" }])).toBe("scheduled");
    expect(getPlatformScheduleState({ enabled: true, publishAt: "2026-09-30T09:00+07:00", latestAttemptId: "attempt-1", manualEvidence: null }, "2026-09-27T00:00+07:00", [{ id: "attempt-1", status: "published" }])).toBe("published");
  });
});
