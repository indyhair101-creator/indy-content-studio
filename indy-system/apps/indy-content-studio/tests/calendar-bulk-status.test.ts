import { describe, expect, it } from "vitest";
import { setCalendarContentStatus } from "../features/calendar/calendar-commands";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import type { ContentItem } from "../features/domain/types";

const item: ContentItem = {
  id: "one", title: "งาน", categoryId: "category-knowledge", formatId: "format-video", owner: "colofill",
  objective: "awareness", priority: "normal", plannedWorkAt: null, lastWorkedAt: null, readyDate: null,
  productionStatus: "review", assetIds: [], processSteps: [], caption: "", captionSource: null, schedules: [],
  referenceIds: [], notes: "", localApproval: "pending",
  lineReview: { status: "sent", activeCycleId: "cycle-one", reviewCode: "code", providerReceipts: [], lastEventAt: null, history: [] },
  createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", deletedAt: null,
};
const now = "2026-10-07T12:00:00.000Z";

describe("calendar bulk status", () => {
  it("finishes manual work without allowing a late LINE decision to reopen it", () => {
    const state = createEmptyDashboardState();
    state.contents = [item];
    const saved = setCalendarContentStatus(state, ["one", "one"], "published", now);
    expect(saved.contents[0].productionStatus).toBe("published");
    expect(saved.contents[0].lineReview.activeCycleId).toBeNull();
    expect(saved.contents[0].lineReview.status).toBe("sent");
    expect(saved.contents[0].updatedAt).toBe(now);
    expect(state.contents[0].productionStatus).toBe("review");
    expect(saved.publicationAttempts).toEqual([]);
  });

  it("rejects a stale selection instead of partially updating a batch", () => {
    const state = createEmptyDashboardState();
    state.contents = [item];
    expect(() => setCalendarContentStatus(state, ["one", "missing"], "editing", now)).toThrow();
    expect(state.contents[0].productionStatus).toBe("review");
  });

  it.each(["submitting", "queued", "publishing"] as const)("protects %s publication jobs", (status) => {
    const state = createEmptyDashboardState();
    state.contents = [item];
    state.publicationAttempts = [{ id: "attempt", contentId: "one", idempotencyKey: "key", platform: "facebook", publishAt: now, status, queueId: "queue", providerPublicationId: null, receiptUrl: null, errorCode: null, createdAt: now, updatedAt: now }];
    expect(() => setCalendarContentStatus(state, ["one"], "published", now)).toThrow(/Make/);
    expect(state.contents[0].productionStatus).toBe("review");
  });
});
