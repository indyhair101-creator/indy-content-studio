import { describe, expect, it } from "vitest";
import { acknowledgeMakePublication, applyPublicationResult, buildMakePublicationPayload } from "../features/publication/server/make-publication-handler";
import type { ContentItem, DashboardState } from "../features/domain/types";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import { POST as resultPOST } from "../app/api/make/publications/result/route";

const content: ContentItem = {
  id: "make-content", title: "ส่ง Make", categoryId: "category-knowledge", formatId: "format-video", owner: "ทีม", objective: "awareness", priority: "normal", plannedWorkAt: null, lastWorkedAt: null, readyDate: null, productionStatus: "ready", assetIds: ["media"], processSteps: [], caption: "แคปชันพร้อมส่ง", captionSource: null,
  schedules: [{ platform: "facebook", enabled: true, publishAt: "2026-10-01T09:00:00+07:00", latestAttemptId: "attempt", manualEvidence: null }], referenceIds: [], notes: "", localApproval: "approved", lineReview: { status: "approved", activeCycleId: "cycle", reviewCode: null, providerReceipts: [], lastEventAt: null, history: [] }, createdAt: "now", updatedAt: "now", deletedAt: null,
};

describe("Make publication contract", () => {
  it("rejects media the existing Reel scenario cannot publish without losing files", () => {
    const state = createEmptyDashboardState();
    const build = (assetIds: string[]) => buildMakePublicationPayload({ state, content: { ...content, assetIds }, platform: "facebook", schedule: content.schedules[0], attemptId: "attempt", callbackUrl: "https://indy.example/api/make/publications/result" });
    expect(() => build([])).toThrow("วิดีโอหนึ่งไฟล์");
    expect(() => build(["one", "two"])).toThrow("วิดีโอหนึ่งไฟล์");
    state.media.push({ id: "image", name: "image.jpg", mimeType: "image/jpeg", size: 10, source: "external", externalUrl: "https://example.test/image.jpg", externalPreviewUrl: null, blobKey: null, remoteStatus: "ready", providerFileId: null, previewProviderFileId: null, tags: [], createdAt: "now", updatedAt: "now", deletedAt: null });
    expect(() => build(["image"])).toThrow("วิดีโอหนึ่งไฟล์");
  });
  it("authenticates callbacks and requires evidence for published", async () => {
    const previous = process.env.MAKE_API_TOKEN;
    process.env.MAKE_API_TOKEN = "callback-secret";
    const unauthorized = await resultPOST(new Request("https://indy.example/api/make/publications/result", { method: "POST", headers: { Authorization: "Bearer wrong" }, body: JSON.stringify({ attemptId: "attempt", status: "published" }) }));
    expect(unauthorized.status).toBe(401);
    const missingEvidence = await resultPOST(new Request("https://indy.example/api/make/publications/result", { method: "POST", headers: { Authorization: "Bearer callback-secret" }, body: JSON.stringify({ attemptId: "attempt", status: "published" }) }));
    expect(missingEvidence.status).toBe(400);
    if (previous === undefined) delete process.env.MAKE_API_TOKEN; else process.env.MAKE_API_TOKEN = previous;
  });

  it("builds a server-authoritative payload with caption, idempotency, callback, and media URL", () => {
    const state: DashboardState = createEmptyDashboardState();
    state.contents.push(content);
    state.media.push({ id: "media", name: "clip.mp4", mimeType: "video/mp4", size: 10, source: "upload", externalUrl: null, externalPreviewUrl: null, blobKey: "blob", remoteStatus: "ready", providerFileId: "provider", previewProviderFileId: "preview", tags: [], createdAt: "now", updatedAt: "now", deletedAt: null });
    const payload = buildMakePublicationPayload({ state, content, platform: "facebook", schedule: content.schedules[0], attemptId: "attempt", callbackUrl: "https://indy.example/api/make/publications/result", environment: { APP_PUBLIC_BASE_URL: "https://indy.example", INDY_MEDIA_SIGNING_SECRET: "secret", MAKE_API_TOKEN: "callback-secret" }, now: () => 100 });
    expect(payload).toMatchObject({ attemptId: "attempt", contentId: "make-content", platform: "facebook", publishAt: "2026-10-01T09:00:00+07:00", caption: "แคปชันพร้อมส่ง", callbackUrl: "https://indy.example/api/make/publications/result" });
    expect(payload.media[0]).toMatchObject({ assetId: "media", name: "clip.mp4", originalContentUrl: expect.stringContaining("/api/media/provider/provider") });
    expect(payload).toMatchObject({ jobId: "attempt", platforms: ["facebook"], callbackToken: "callback-secret", mediaUrl: payload.media[0].originalContentUrl, scheduledAt: payload.publishAt });
  });

  it("turns only the callback platform green and keeps sibling outcomes independent", () => {
    const state: DashboardState = createEmptyDashboardState();
    state.contents.push({ ...content, schedules: [
      { platform: "facebook", enabled: true, publishAt: "2026-10-01T09:00:00+07:00", latestAttemptId: "attempt", manualEvidence: null },
      { platform: "instagram", enabled: true, publishAt: "2026-10-01T12:00:00+07:00", latestAttemptId: "sibling", manualEvidence: null },
    ] });
    state.publicationAttempts.push(
      { id: "attempt", idempotencyKey: "one", contentId: "make-content", platform: "facebook", publishAt: "2026-10-01T09:00:00+07:00", status: "queued", queueId: "q1", providerPublicationId: null, receiptUrl: null, errorCode: null, createdAt: "now", updatedAt: "now" },
      { id: "sibling", idempotencyKey: "two", contentId: "make-content", platform: "instagram", publishAt: "2026-10-01T12:00:00+07:00", status: "queued", queueId: "q2", providerPublicationId: null, receiptUrl: null, errorCode: null, createdAt: "now", updatedAt: "now" },
    );
    const published = applyPublicationResult(state, { id: "attempt", status: "published", providerPublicationId: "post-1", receiptUrl: null, errorCode: null }, "later");
    expect(published.publicationAttempts.find((item) => item.id === "attempt")?.status).toBe("published");
    expect(published.publicationAttempts.find((item) => item.id === "sibling")?.status).toBe("queued");
    expect(acknowledgeMakePublication(published, "attempt", "late-ack", "later-2").publicationAttempts[0].status).toBe("published");
    expect(() => applyPublicationResult(published, { id: "attempt", status: "published", providerPublicationId: null, receiptUrl: null, errorCode: null }, "later-2")).not.toThrow();
  });
});
