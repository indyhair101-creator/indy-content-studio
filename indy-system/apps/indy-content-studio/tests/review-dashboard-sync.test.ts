// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import type { ContentItem, DashboardState } from "../features/domain/types";
import { beginReviewCycle, resolveCorrection } from "../features/line-oa/review-model";
import type { StoredLineReview } from "../features/line-oa/server/line-review-store";
import { mergeLineReviewEvents, loadSyncedDashboardState } from "../features/data/server/review-dashboard-sync";
import { StaleDashboardStateError } from "../features/data/server/neon-dashboard-repository";

const sentAt = "2026-10-01T01:00:00.000Z";
const decisionAt = "2026-10-01T02:00:00.000Z";

function contentFixture(): ContentItem {
  return beginReviewCycle({
    id: "content", title: "ตรวจแคปชัน", categoryId: "category-knowledge", formatId: "format-image",
    owner: "ทีม", objective: "awareness", priority: "normal", plannedWorkAt: null, lastWorkedAt: null,
    readyDate: null, productionStatus: "ready", assetIds: [], processSteps: [], caption: "ราคา 900 บาท",
    captionSource: null, schedules: [{ platform: "facebook", enabled: true, publishAt: "2026-10-02T01:00:00.000Z", latestAttemptId: null, manualEvidence: null }],
    referenceIds: [], notes: "", localApproval: "pending",
    lineReview: { status: "not-sent", activeCycleId: null, reviewCode: null, providerReceipts: [], lastEventAt: null, history: [] },
    createdAt: sentAt, updatedAt: sentAt, deletedAt: null,
  }, "cycle", sentAt);
}

function fixture(event: "approved" | "correction-requested" = "correction-requested") {
  const content = contentFixture();
  const state = { ...createEmptyDashboardState(), contents: [content] };
  const review: StoredLineReview = {
    contentId: content.id, cycleId: "cycle", reviewCode: content.lineReview.reviewCode!, recipientUserId: "private-user",
    handledWebhookEventIds: [], snapshot: { content: structuredClone(content), media: [] },
    events: [
      { id: "sent-event", event: "sent", comment: null, occurredAt: sentAt, providerReceipt: "receipt" },
      { id: "decision", event, comment: event === "correction-requested" ? "เพิ่มราคา\n  เปลี่ยนภาพ" : null, occurredAt: decisionAt },
    ],
  };
  return { state, review };
}

describe("durable LINE dashboard projection", () => {
  it("shows unassigned rejection exactly once without changing or approving any content", () => {
    const {state} = fixture();
    const feedback = [{id:"line-inbox-event-1",comment:"ไม่ผ่าน",receivedAt:decisionAt}];
    const projected = mergeLineReviewEvents(state, [], feedback);
    expect(projected.contents).toEqual(state.contents);
    expect(projected.corrections).toEqual([{id:"line-inbox-event-1",source:"line-unmatched",contentId:"",cycleId:"",comment:"ไม่ผ่าน",status:"open",receivedAt:decisionAt,resolvedAt:null}]);
    expect(mergeLineReviewEvents(projected, [], feedback)).toBe(projected);
    const resolved = resolveCorrection(projected, "line-inbox-event-1", decisionAt);
    expect(mergeLineReviewEvents(resolved, [], feedback)).toBe(resolved);
  });
  it.each(["sent", "failed", "approved", "correction-requested"] as const)("preserves the saved content revision when projecting %s so LINE retries keep their original key", (event) => {
    const { state, review } = fixture();
    review.events = [{ id: "late-review-event", event, comment: event === "correction-requested" ? "แก้ข้อความ" : null, occurredAt: decisionAt }];
    const next = mergeLineReviewEvents(state, [review]);
    expect(next.contents[0].lineReview.lastEventAt).toBe(decisionAt);
    expect(next.contents[0].updatedAt).toBe(state.contents[0].updatedAt);
  });

  it("adds feedback exactly once with exact newlines and marks the matching content for correction", () => {
    const { state, review } = fixture();
    const merged = mergeLineReviewEvents(state, [review]);
    expect(merged.contents[0]).toMatchObject({ productionStatus: "needs-changes", localApproval: "pending", lineReview: { status: "correction-requested", providerReceipts: ["receipt"] } });
    expect(merged.corrections).toEqual([{ id: "line-decision", contentId: "content", cycleId: "cycle", comment: "เพิ่มราคา\n  เปลี่ยนภาพ", status: "open", receivedAt: decisionAt, resolvedAt: null }]);
    expect(mergeLineReviewEvents(merged, [review])).toBe(merged);
    expect(state.corrections).toEqual([]);
  });

  it("keeps feedback for unmatched/deleted content and never reopens resolved history", () => {
    const { state, review } = fixture();
    const unmatched = mergeLineReviewEvents({ ...state, contents: [] }, [review]);
    expect(unmatched.corrections).toHaveLength(1);
    const resolved = resolveCorrection(unmatched, "line-decision", "2026-10-01T03:00:00.000Z");
    expect(mergeLineReviewEvents(resolved, [review])).toBe(resolved);
    const deleted = mergeLineReviewEvents({ ...state, contents: [{ ...state.contents[0], deletedAt: sentAt }] }, [review]);
    expect(deleted.corrections).toHaveLength(1);
    expect(deleted.contents[0].productionStatus).toBe("ready");
  });

  it("does not replay a resolved rejection onto a newer review cycle", () => {
    const { state, review } = fixture();
    const merged = mergeLineReviewEvents(state, [review]);
    const resolved = resolveCorrection(merged, "line-decision", "2026-10-01T03:00:00.000Z");
    const next = mergeLineReviewEvents(resolved, [review]);
    expect(next.corrections[0].status).toBe("resolved");
    expect(next.contents[0].lineReview.status).toBe("queued");
    expect(next.contents[0].lineReview.activeCycleId).not.toBe("cycle");
    expect(next.contents[0].lineReview.history.filter((event) => event.id === "line-decision")).toHaveLength(1);
  });

  it("applies approval only to the current review and unchanged snapshot", () => {
    const { state, review } = fixture("approved");
    expect(mergeLineReviewEvents(state, [review]).contents[0]).toMatchObject({ localApproval: "approved", lineReview: { status: "approved" } });
    const changed = { ...state, contents: [{ ...state.contents[0], caption: "เปลี่ยนแล้ว" }] };
    expect(mergeLineReviewEvents(changed, [review]).contents[0].localApproval).toBe("pending");
    const newer = { ...state, contents: [beginReviewCycle(state.contents[0], "new-cycle", decisionAt)] };
    expect(mergeLineReviewEvents(newer, [review]).contents[0].lineReview.activeCycleId).toBe("new-cycle");
    expect(mergeLineReviewEvents(newer, [review]).contents[0].localApproval).toBe("pending");
    expect(mergeLineReviewEvents(state, [{ ...review, snapshot: undefined }]).contents[0].localApproval).toBe("pending");
  });

  it("does not reapprove content after its already-projected approval is reset", () => {
    const { state, review } = fixture("approved");
    const approved = mergeLineReviewEvents(state, [review]);
    const reset: DashboardState = { ...approved, contents: [{ ...approved.contents[0], localApproval: "pending", lineReview: { ...approved.contents[0].lineReview, status: "not-sent" } }] };
    expect(mergeLineReviewEvents(reset, [review])).toBe(reset);
  });

  it("does not let a delayed delivery receipt replace an approval", () => {
    const { state, review } = fixture("approved");
    review.events.push({ id: "late-receipt", event: "sent", comment: null, occurredAt: "2026-10-01T03:00:00.000Z" });
    expect(mergeLineReviewEvents(state, [review]).contents[0].lineReview.status).toBe("approved");
  });

  it.each(["approved", "correction-requested"] as const)("keeps the first migrated %s decision when a later contradictory decision exists", (firstDecision) => {
    const { state, review } = fixture(firstDecision);
    const laterDecision = firstDecision === "approved" ? "correction-requested" : "approved";
    review.events.push({ id: "later-contradiction", event: laterDecision, comment: laterDecision === "correction-requested" ? "คำตอบที่สอง" : null, occurredAt: "2026-10-01T03:00:00.000Z" });
    const projected = mergeLineReviewEvents(state, [review]);
    expect(projected.contents[0].lineReview.status).toBe(firstDecision);
    expect(projected.contents[0].localApproval).toBe(firstDecision === "approved" ? "approved" : "pending");
    expect(projected.corrections).toHaveLength(firstDecision === "approved" ? 0 : 1);
    expect(projected.contents[0].lineReview.history.some((event) => event.id === "line-later-contradiction")).toBe(true);
    expect(mergeLineReviewEvents(projected, [review])).toBe(projected);
  });

  it("retries CAS against the latest edits and persists queue projection with review feedback", async () => {
    const { state, review } = fixture();
    const edited = { ...state, contents: [{ ...state.contents[0], title: "ชื่อแก้ใหม่" }] };
    let persisted = { state: edited, version: 2 };
    const repository = {
      loadDashboardState: vi.fn().mockResolvedValueOnce({ state, version: 1 }).mockImplementation(async () => persisted),
      saveDashboardState: vi.fn().mockRejectedValueOnce(new StaleDashboardStateError()).mockImplementation(async (next: DashboardState) => { persisted = { state: next, version: 3 }; return { version: 3 }; }),
    };
    const syncQueue = vi.fn(async (next: DashboardState) => ({ ...next, notificationReadIds: ["queue-synchronized"] }));
    const snapshot = await loadSyncedDashboardState(repository, { listReviews: async () => [review], listUnmatchedFeedback: async () => [], syncQueue });
    expect(snapshot.version).toBe(3);
    expect(snapshot.state.contents[0].title).toBe("ชื่อแก้ใหม่");
    expect(snapshot.state.corrections).toHaveLength(1);
    expect(snapshot.state.notificationReadIds).toEqual(["queue-synchronized"]);
    expect(repository.saveDashboardState.mock.calls[1][1]).toBe(2);
  });

  it("does not increment the dashboard version for an unchanged projection", async () => {
    const { state, review } = fixture();
    const merged = mergeLineReviewEvents(state, [review]);
    const repository = { loadDashboardState: vi.fn(async () => ({ state: merged, version: 9 })), saveDashboardState: vi.fn() };
    expect(await loadSyncedDashboardState(repository, { listReviews: async () => [review], listUnmatchedFeedback: async () => [], syncQueue: async (next) => structuredClone(next) })).toEqual({ state: merged, version: 9 });
    expect(repository.saveDashboardState).not.toHaveBeenCalled();
  });
});
