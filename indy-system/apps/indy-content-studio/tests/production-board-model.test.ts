import { describe, expect, it } from "vitest";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import type { ContentItem } from "../features/domain/types";
import { canMoveContentToStatus, moveContentToStatus, selectProductionBoard } from "../features/production/production-board-model";

function content(overrides: Partial<ContentItem> = {}): ContentItem {
  const now = "2026-09-18T10:00:00.000Z";
  return {
    id: "content-1", title: "คลิปเปิดคอร์ส", categoryId: "cat", formatId: "format", owner: "ทีมคอนเทนต์", objective: "awareness", priority: "high", plannedWorkAt: null, lastWorkedAt: null, readyDate: null, productionStatus: "editing", assetIds: [], processSteps: [], caption: "", captionSource: null, schedules: [{ platform: "facebook", enabled: true, publishAt: null, latestAttemptId: null, manualEvidence: null }], referenceIds: [], notes: "", localApproval: "pending", lineReview: { status: "not-sent", activeCycleId: null, reviewCode: null, providerReceipts: [], lastEventAt: null, history: [] }, createdAt: now, updatedAt: now, deletedAt: null,
    ...overrides,
  };
}

describe("production board model", () => {
  it("groups live content into the seven production columns and filters it", () => {
    const state = { ...createEmptyDashboardState(), contents: [content(), content({ id: "content-2", title: "โพสต์เก่า", productionStatus: "ready", owner: "แพรว" })] };
    const columns = selectProductionBoard(state, { owner: "แพรว" });
    expect(columns.find((column) => column.status === "ready")?.items.map((item) => item.title)).toEqual(["โพสต์เก่า"]);
    expect(columns).toHaveLength(7);
  });

  it("blocks Published until every enabled schedule has evidence", () => {
    const item = content();
    expect(canMoveContentToStatus(item, "published")).toEqual({ allowed: false, reason: "ยังไม่มีหลักฐานเผยแพร่ครบทุกช่องทาง" });
    const withEvidence = { ...item, schedules: [{ ...item.schedules[0], latestAttemptId: "attempt-1" }] };
    expect(canMoveContentToStatus(withEvidence, "published")).toEqual({ allowed: true });
    expect(moveContentToStatus({ ...createEmptyDashboardState(), contents: [withEvidence] }, withEvidence.id, "published", "2026-09-18T12:00:00.000Z").contents[0].productionStatus).toBe("published");
  });
});
