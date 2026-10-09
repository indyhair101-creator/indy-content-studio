import { describe, expect, it } from "vitest";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import type { ContentItem } from "../features/domain/types";
import { applyLineReviewEvent, beginReviewCycle, buildReviewCode, correctionFromEvent, resolveCorrection } from "../features/line-oa/review-model";
import { parseLineReviewCommand } from "../features/line-oa/server/line-review-command";

function content(): ContentItem {
  const now = "2026-09-18T10:00:00.000Z";
  return { id: "content-line", title: "งานตรวจ", categoryId: "cat", formatId: "format", owner: "ทีม", objective: "awareness", priority: "normal", plannedWorkAt: null, lastWorkedAt: null, readyDate: null, productionStatus: "ready", assetIds: [], processSteps: [], caption: "แคปชัน", captionSource: null, schedules: [], referenceIds: [], notes: "", localApproval: "pending", lineReview: { status: "not-sent", activeCycleId: null, reviewCode: null, providerReceipts: [], lastEventAt: null, history: [] }, createdAt: now, updatedAt: now, deletedAt: null };
}

describe("LINE review model", () => {
  it("generates a stable code and applies approval/correction transitions", () => {
    expect(buildReviewCode("cycle-1")).toBe(buildReviewCode("cycle-1"));
    const queued = beginReviewCycle(content(), "cycle-1", "2026-09-18T10:00:00.000Z");
    expect(queued.lineReview.reviewCode).toMatch(/^R-[A-Z0-9]{6}$/);
    const approved = applyLineReviewEvent(queued, "approved", "2026-09-18T10:05:00.000Z");
    expect(approved.localApproval).toBe("approved");
    const correction = correctionFromEvent(queued, "เพิ่มราคา", "2026-09-18T10:06:00.000Z");
    expect(correction.status).toBe("open");
    const state = { ...createEmptyDashboardState(), contents: [queued], corrections: [correction] };
    expect(resolveCorrection(state, correction.id, "2026-09-18T10:10:00.000Z").corrections[0].status).toBe("resolved");
  });

  it("parses only the explicit Thai review commands", () => {
    expect(parseLineReviewCommand(" ผ่าน ")).toEqual({ kind: "approve" });
    expect(parseLineReviewCommand("ไม่ผ่าน เพิ่มราคา\nและวันสมัคร")).toEqual({ kind: "correction", comment: "เพิ่มราคา\nและวันสมัคร" });
    expect(parseLineReviewCommand("ไม่ผ่าน\nเพิ่มราคา")).toEqual({ kind: "correction", comment: "เพิ่มราคา" });
    expect(parseLineReviewCommand("ไม่ผ่าน")).toEqual({ kind: "correction", comment: "ไม่ผ่าน" });
    expect(parseLineReviewCommand("  ไม่ผ่าน \n ")).toEqual({ kind: "correction", comment: "ไม่ผ่าน" });
    expect(parseLineReviewCommand("ผ่าน เพิ่มเติม")).toBeNull();
    expect(parseLineReviewCommand("ไม่ผ่านเพิ่มราคา")).toBeNull();
    expect(parseLineReviewCommand("อนุมัติ R-ABC234")).toEqual({ kind: "approve", reviewCode: "R-ABC234" });
    expect(parseLineReviewCommand("แก้ไข R-ABC234: เพิ่มราคาและวันสมัคร")).toEqual({ kind: "correction", reviewCode: "R-ABC234", comment: "เพิ่มราคาและวันสมัคร" });
    expect(parseLineReviewCommand("อนุมัติ R-ABC234 เพิ่มเติม")).toBeNull();
  });
  it("resolves the active correction into a fresh review cycle only once", () => {
    const queued = beginReviewCycle(content(), "old-cycle", "2026-09-18T10:00:00.000Z");
    const correction = correctionFromEvent(queued, "เพิ่มราคา", "2026-09-18T10:06:00.000Z");
    const state = { ...createEmptyDashboardState(), contents: [queued], corrections: [correction] };
    const resolved = resolveCorrection(state, correction.id, "2026-09-18T10:10:00.000Z");
    expect(resolved.contents[0].lineReview.activeCycleId).not.toBe("old-cycle");
    expect(resolveCorrection(resolved, correction.id, "2026-09-18T10:11:00.000Z")).toBe(resolved);
    const newerState = { ...state, contents: [beginReviewCycle(queued, "newer-cycle", "2026-09-18T10:09:00.000Z")] };
    expect(resolveCorrection(newerState, correction.id, "2026-09-18T10:10:00.000Z").contents[0].lineReview.activeCycleId).toBe("newer-cycle");
  });
});
