import { describe, expect, it } from "vitest";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import type { ContentItem } from "../features/domain/types";
import { createPublicationAttempt, markPublicationEvidence, updatePublicationAttempt } from "../features/publication/publication-commands";
import { buildPublicationIdempotencyKey, getPublicationEligibility } from "../features/publication/publication-eligibility";

function content(): ContentItem {
  const now = "2026-09-18T10:00:00.000Z";
  return { id: "publish-content", title: "โพสต์พร้อมส่ง", categoryId: "cat", formatId: "format", owner: "ทีม", objective: "sales", priority: "normal", plannedWorkAt: null, lastWorkedAt: null, readyDate: "2026-09-18", productionStatus: "ready", assetIds: [], processSteps: [], caption: "พร้อม", captionSource: null, schedules: [{ platform: "facebook", enabled: true, publishAt: "2026-09-20T10:00", latestAttemptId: null, manualEvidence: null }], referenceIds: [], notes: "", localApproval: "approved", lineReview: { status: "approved", activeCycleId: "cycle", reviewCode: "R-ABC234", providerReceipts: [], lastEventAt: now, history: [] }, createdAt: now, updatedAt: now, deletedAt: null };
}

describe("publication commands", () => {
  it("creates an idempotent local plan and updates delivery status", () => {
    const state = { ...createEmptyDashboardState(), contents: [content()] };
    const planned = createPublicationAttempt(state, { contentId: "publish-content", platform: "facebook", publishAt: "2026-09-20T10:00" }, "now");
    expect(planned.publicationAttempts).toHaveLength(1);
    expect(createPublicationAttempt(planned, { contentId: "publish-content", platform: "facebook", publishAt: "2026-09-20T10:00" }, "later").publicationAttempts).toHaveLength(1);
    const queued = updatePublicationAttempt(planned, planned.publicationAttempts[0].id, { status: "queued", queueId: "q1" }, "later");
    expect(queued.publicationAttempts[0].queueId).toBe("q1");
    expect(markPublicationEvidence(state, "publish-content", "facebook", { receiptUrl: "https://example.test/r", note: "โพสต์แล้ว" }, "later").contents[0].schedules[0].manualEvidence?.receiptUrl).toBe("https://example.test/r");
  });

  it("requires Final prerequisites and gives each platform a stable publication key", () => {
    const finalContent: ContentItem = { ...content(), formatId: "format-video", processSteps: [{ id: "step", name: "ตรวจ", scheduledDate: null, status: "done", order: 0 }] };
    const state = { ...createEmptyDashboardState(), contents: [finalContent] };
    state.media.push({ id: "media-1", name: "clip.mp4", mimeType: "video/mp4", size: 10, source: "upload", externalUrl: null, externalPreviewUrl: null, blobKey: "blob", remoteStatus: "ready", providerFileId: "provider-1", previewProviderFileId: "preview-1", tags: [], createdAt: "now", updatedAt: "now", deletedAt: null });
    state.contents[0].assetIds = ["media-1"];
    expect(getPublicationEligibility(state, "publish-content", "facebook", "2026-09-18T00:00:00+07:00")).toEqual({ eligible: true, reasons: [] });
    const key = buildPublicationIdempotencyKey(state.contents[0], "facebook", state.contents[0].schedules[0]);
    expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(key).toBe("8a8a9f84d2d03d011c8cd19f07923c06ad8b5c460cb7fd8014281ce07e864585");
    expect(buildPublicationIdempotencyKey(state.contents[0], "facebook", { ...state.contents[0].schedules[0], publishAt: "2026-09-21T10:00:00+07:00" })).not.toBe(key);
  });

  it("rejects incomplete work, past schedules, and missing remote media", () => {
    const incompleteContent: ContentItem = { ...content(), formatId: "format-video", processSteps: [{ id: "step", name: "ตรวจ", scheduledDate: null, status: "doing", order: 0 }], assetIds: ["missing"] };
    const state = { ...createEmptyDashboardState(), contents: [incompleteContent] };
    expect(getPublicationEligibility(state, "publish-content", "facebook", "2026-09-18T00:00:00+07:00")).toMatchObject({ eligible: false, reasons: expect.arrayContaining(["ยังมีขั้นตอน Action Plan ที่ไม่เสร็จ", "สื่อยังไม่พร้อมใช้งานจาก storage"]) });
  });

  it("does not convert a queued attempt into publication evidence", () => {
    const state = { ...createEmptyDashboardState(), contents: [content()] };
    const planned = createPublicationAttempt(state, { contentId: "publish-content", platform: "facebook", publishAt: "2026-09-20T10:00" }, "now");
    const queued = updatePublicationAttempt(planned, planned.publicationAttempts[0].id, { status: "queued", queueId: "q1" }, "later");
    expect(queued.contents[0].schedules[0].manualEvidence).toBeNull();
    expect(queued.contents[0].schedules[0].latestAttemptId).toBe(planned.publicationAttempts[0].id);
  });
});
