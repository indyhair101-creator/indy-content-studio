import { describe, expect, it } from "vitest";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import type { ContentItem } from "../features/domain/types";
import { createRecurringCopies, createRecurringCopiesInRange, getRecurringCopyDates, getRecurringCopyDatesInRange } from "../features/content/content-recurrence";

const source: ContentItem = {
  id: "repeat-source", title: "คลิปความรู้", categoryId: "category-knowledge", formatId: "format-video", owner: "ทีม", objective: "awareness", priority: "normal",
  plannedWorkAt: "2026-09-21T10:00", lastWorkedAt: "2026-09-20T10:00", readyDate: "2026-09-22", productionStatus: "ready", assetIds: ["asset-1"],
  processSteps: [{ id: "step-1", name: "ตรวจเสียง", scheduledDate: "2026-09-20", status: "done", order: 0 }], caption: "แคปชัน", captionSource: null,
  schedules: [
    { platform: "facebook", enabled: true, publishAt: "2026-09-21T09:00:00+07:00", latestAttemptId: "attempt-1", manualEvidence: { receiptUrl: "https://post.example/1", note: "โพสต์แล้ว", confirmedAt: "2026-09-21T09:01:00+07:00" } },
    { platform: "instagram", enabled: true, publishAt: "2026-09-22T12:00:00+07:00", latestAttemptId: null, manualEvidence: null },
    { platform: "tiktok", enabled: false, publishAt: null, latestAttemptId: null, manualEvidence: null },
  ], referenceIds: [], notes: "โน้ต", localApproval: "approved",
  lineReview: { status: "approved", activeCycleId: "cycle-1", reviewCode: "code", providerReceipts: ["receipt"], lastEventAt: "2026-09-20T10:00:00Z", history: [{ id: "line-1", cycleId: "cycle-1", event: "approved", comment: null, occurredAt: "2026-09-20T10:00:00Z" }] },
  createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-21T00:00:00Z", deletedAt: null,
};

describe("content recurrence", () => {
  it("generates daily, alternate-day, and weekday dates", () => {
    expect(getRecurringCopyDates("2026-09-21", 3, "daily")).toEqual(["2026-09-22", "2026-09-23", "2026-09-24"]);
    expect(getRecurringCopyDates("2026-09-21", 3, "every-other-day")).toEqual(["2026-09-23", "2026-09-25", "2026-09-27"]);
    expect(getRecurringCopyDates("2026-09-25", 3, "weekdays")).toEqual(["2026-09-28", "2026-09-29", "2026-09-30"]);
  });

  it("rejects copy counts outside the supported range", () => {
    expect(() => getRecurringCopyDates("2026-09-21", 0, "daily")).toThrow();
    expect(() => getRecurringCopyDates("2026-09-21", 366, "daily")).toThrow();
  });

  it("generates copies inside an inclusive start/end date range", () => {
    expect(getRecurringCopyDatesInRange("2026-09-24", "2026-09-26", "daily")).toEqual(["2026-09-24", "2026-09-25", "2026-09-26"]);
    expect(getRecurringCopyDatesInRange("2026-09-24", "2026-09-28", "every-other-day")).toEqual(["2026-09-24", "2026-09-26", "2026-09-28"]);
    expect(getRecurringCopyDatesInRange("2026-09-25", "2026-09-30", "weekdays")).toEqual(["2026-09-25", "2026-09-28", "2026-09-29", "2026-09-30"]);
  });

  it("rejects invalid ranges and ranges that create no copies", () => {
    expect(() => getRecurringCopyDatesInRange("2026-09-26", "2026-09-24", "daily")).toThrow(/สิ้นสุด/);
    expect(() => getRecurringCopyDatesInRange("2026-09-26", "2026-09-27", "weekdays")).toThrow(/ไม่มีวันที่/);
  });

  it("creates all selected-date copies without changing the source", () => {
    const state = createEmptyDashboardState();
    state.contents.push(source);
    const next = createRecurringCopiesInRange(state, source.id, { startDate: "2026-09-24", endDate: "2026-09-25", cadence: "daily" }, "2026-09-21T12:00:00Z", (index) => `range-copy-${index}`);
    expect(next.contents).toHaveLength(3);
    expect(next.contents[0]).toEqual(source);
    expect(next.contents.slice(1).map((content) => content.plannedWorkAt)).toEqual(["2026-09-24T10:00", "2026-09-25T10:00"]);
    expect(next.contents[1].schedules.map((schedule) => schedule.publishAt)).toEqual(["2026-09-24T09:00:00+07:00", "2026-09-25T12:00:00+07:00", null]);
  });

  it("creates independent copies with shifted schedules and reset workflow history", () => {
    const state = createEmptyDashboardState();
    state.contents.push(source);
    state.publicationAttempts.push({ id: "attempt-1", idempotencyKey: "key", contentId: source.id, platform: "facebook", publishAt: "2026-09-21T09:00:00+07:00", status: "published", queueId: "queue", providerPublicationId: "post", receiptUrl: "https://post.example/1", errorCode: null, createdAt: "now", updatedAt: "now" });
    const next = createRecurringCopies(state, source.id, { count: 2, cadence: "daily" }, "2026-09-21T12:00:00Z", (index) => `copy-${index}`);
    expect(next.contents).toHaveLength(3);
    expect(next.contents.slice(1).map((content) => content.plannedWorkAt)).toEqual(["2026-09-22T10:00", "2026-09-23T10:00"]);
    expect(next.contents[1].schedules.map((schedule) => schedule.publishAt)).toEqual(["2026-09-22T09:00:00+07:00", "2026-09-23T12:00:00+07:00", null]);
    expect(next.contents[1]).toMatchObject({ productionStatus: "waiting-shoot", localApproval: "pending", assetIds: ["asset-1"], caption: "แคปชัน" });
    expect(next.contents[1].processSteps[0]).toMatchObject({ status: "todo" });
    expect(next.contents[1].lineReview).toMatchObject({ status: "not-sent", history: [], providerReceipts: [] });
    expect(next.contents[1].schedules[0]).toMatchObject({ latestAttemptId: null, manualEvidence: null, enabled: true });
    expect(next.publicationAttempts).toHaveLength(1);
  });
});
