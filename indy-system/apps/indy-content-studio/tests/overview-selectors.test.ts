import { describe, expect, it } from "vitest";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import type { ContentItem } from "../features/domain/types";
import { selectMonthlyOverview } from "../features/overview/overview-selectors";

function content(id: string, overrides: Partial<ContentItem> = {}): ContentItem {
  return {
    id,
    title: id,
    categoryId: "category-knowledge",
    formatId: "format-video",
    owner: "ทีม",
    objective: "awareness",
    priority: "normal",
    plannedWorkAt: "2026-09-04",
    lastWorkedAt: null,
    readyDate: "2026-09-04",
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
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  };
}

describe("overview selectors", () => {
  it("keeps monthly metrics and search working", () => {
    const state = createEmptyDashboardState();
    state.monthlyGoals.push({ month: "2026-09", target: 12 });
    state.contents.push(content("c", { title: "กรรไกร", productionStatus: "published" }));

    const view = selectMonthlyOverview(state, { month: "2026-09", query: "กรรไกร", now: "now" });

    expect(view.metrics).toMatchObject({ target: 12, planned: 1, completed: 1 });
    expect(view.items.map((item) => item.title)).toEqual(["กรรไกร"]);
  });

  it("uses a category-specific target for the selected month and leaves unset targets blank", () => {
    const state = {
      ...createEmptyDashboardState(),
      categoryMonthlyGoals: [
        { month: "2026-09", categoryId: "category-knowledge", target: 3 },
        { month: "2026-09", categoryId: "category-review", target: 1 },
      ],
    };
    state.categories.push({ id: "category-new", name: "เบื้องหลัง", requiresApproval: false });
    state.contents.push(
      content("knowledge-sent", { lineReview: { status: "sent", activeCycleId: "c1", reviewCode: null, providerReceipts: ["r1"], lastEventAt: "now", history: [] } }),
      content("knowledge-draft", { productionStatus: "editing" }),
      content("review-sent", { categoryId: "category-review", productionStatus: "published" }),
      content("outside-month", { plannedWorkAt: "2026-10-04", readyDate: "2026-10-04", productionStatus: "published" }),
      content("deleted", { deletedAt: "2026-09-05T00:00:00.000Z", productionStatus: "published" }),
    );

    const view = selectMonthlyOverview(state, { month: "2026-09", query: "no-match", now: "now" });

    expect(view.items).toHaveLength(0);
    expect(view.categoryProgress).toEqual([
      { categoryId: "category-knowledge", categoryName: "ความรู้", completed: 1, target: 3, percentage: 33, total: 2 },
      { categoryId: "category-review", categoryName: "รีวิว", completed: 1, target: 1, percentage: 100, total: 1 },
      { categoryId: "category-atmosphere", categoryName: "บรรยากาศ", completed: 0, target: null, percentage: 0, total: 0 },
      { categoryId: "category-new", categoryName: "เบื้องหลัง", completed: 0, target: null, percentage: 0, total: 0 },
    ]);
  });
});
