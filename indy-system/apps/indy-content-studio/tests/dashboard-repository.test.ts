import { describe, expect, it } from "vitest";
import { getDashboardOverview } from "../features/dashboard/server/dashboard-repository";
import type { DashboardReadClient } from "../features/dashboard/server/dashboard-types";

describe("getDashboardOverview", () => {
  it("summarizes existing content without requesting a write", async () => {
    const db: DashboardReadClient = {
      listContent: async () => [
        { id: "one", status: "planned", format: "video" },
        { id: "two", status: "completed", format: "album" },
        { id: "three", status: "published", format: "video" },
      ],
    };

    await expect(getDashboardOverview(db)).resolves.toEqual({
      plannedCount: 1,
      completedCount: 1,
      publishedCount: 1,
      totalCount: 3,
      imageCount: 1,
      videoCount: 2,
    });
  });
});
