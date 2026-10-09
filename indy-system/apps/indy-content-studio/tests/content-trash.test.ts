import { describe, expect, it } from "vitest";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import type { ContentItem } from "../features/domain/types";
import { permanentlyDeleteContent, restoreContent, softDeleteContent } from "../features/content/content-trash-commands";

function content(): ContentItem { const now = "now"; return { id: "trash-content", title: "งานถังขยะ", categoryId: "category-knowledge", formatId: "format-video", owner: "ทีม", objective: "awareness", priority: "normal", plannedWorkAt: null, lastWorkedAt: null, readyDate: null, productionStatus: "waiting-shoot", assetIds: ["shared"], processSteps: [], caption: "", captionSource: null, schedules: [], referenceIds: [], notes: "", localApproval: "pending", lineReview: { status: "not-sent", activeCycleId: null, reviewCode: null, providerReceipts: [], lastEventAt: null, history: [] }, createdAt: now, updatedAt: now, deletedAt: null }; }

describe("content trash", () => {
  it("soft deletes, restores, and permanently removes only content records", () => {
    const state = { ...createEmptyDashboardState(), contents: [content()], media: [{ id: "shared", name: "shared.jpg", mimeType: "image/jpeg", size: 1, source: "upload" as const, externalUrl: null, externalPreviewUrl: null, blobKey: "b", remoteStatus: "local-only" as const, providerFileId: null, previewProviderFileId: null, tags: [], createdAt: "now", updatedAt: "now", deletedAt: null }] };
    const deleted = softDeleteContent(state, "trash-content", "later");
    expect(deleted.contents[0].deletedAt).toBe("later");
    expect(restoreContent(deleted, "trash-content", "restored").contents[0].deletedAt).toBeNull();
    const removed = permanentlyDeleteContent(deleted, "trash-content");
    expect(removed.contents).toHaveLength(0);
    expect(removed.media).toHaveLength(1);
  });
});
