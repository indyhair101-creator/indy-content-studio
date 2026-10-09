import { describe, expect, it } from "vitest";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import { copyContentAsNew, saveContentDraft } from "../features/content/content-commands";
import type { ContentItem } from "../features/domain/types";

const item: ContentItem = {
  id: "c",
  title: "เดิม",
  categoryId: "category-knowledge",
  formatId: "format-video",
  owner: "ทีม",
  objective: "awareness",
  priority: "normal",
  plannedWorkAt: "2026-09-22",
  lastWorkedAt: "2026-09-20T08:00:00.000Z",
  readyDate: "2026-09-21",
  productionStatus: "ready",
  assetIds: ["a"],
  processSteps: [{ id: "step-old", name: "ตัดต่อ", scheduledDate: "2026-09-20", status: "done", order: 0 }],
  caption: "เดิม",
  captionSource: null,
  schedules: [{ platform: "facebook", enabled: true, publishAt: "2026-09-22T09:00", latestAttemptId: "attempt", manualEvidence: { receiptUrl: "receipt", note: "ส่งแล้ว", confirmedAt: "now" } }],
  referenceIds: [],
  notes: "",
  localApproval: "approved",
  lineReview: { status: "approved", activeCycleId: "cycle", reviewCode: "R-1", providerReceipts: ["receipt"], lastEventAt: "now", history: [] },
  createdAt: "now",
  updatedAt: "now",
  deletedAt: null,
};

describe("content commands", () => {
  it("resets approval on caption/media changes", () => {
    const draft = { title: item.title, categoryId: item.categoryId, formatId: item.formatId, owner: item.owner, objective: item.objective, priority: item.priority, plannedWorkAt: "", readyDate: "", productionStatus: item.productionStatus, assetIds: ["b"], processSteps: [], caption: "ใหม่", schedules: [], referenceIds: [], notes: "", localApproval: item.localApproval };
    const saved = saveContentDraft(item, draft, "later");

    expect(saved.localApproval).toBe("pending");
    expect(saved.lineReview.status).toBe("not-sent");
    expect(saved.lineReview.history.at(-1)?.event).toBe("approval-reset");
    expect(createEmptyDashboardState().contents).toHaveLength(0);
  });

  it("copies content into a new unsent draft without retaining publication state", () => {
    const copy = copyContentAsNew(item, "copy-1", "later");

    expect(copy).toMatchObject({
      id: "copy-1",
      title: "เดิม (สำเนา)",
      categoryId: "category-knowledge",
      formatId: "format-video",
      plannedWorkAt: "2026-09-22",
      productionStatus: "waiting-shoot",
      assetIds: ["a"],
      localApproval: "pending",
      createdAt: "later",
      updatedAt: "later",
      deletedAt: null,
      lineReview: { status: "not-sent", activeCycleId: null, reviewCode: null, providerReceipts: [], lastEventAt: null, history: [] },
      schedules: [{ platform: "facebook", enabled: false, publishAt: null, latestAttemptId: null, manualEvidence: null }],
      processSteps: [{ id: "copy-1-step-1", name: "ตัดต่อ", scheduledDate: "2026-09-20", status: "todo", order: 0 }],
    });
  });
});
