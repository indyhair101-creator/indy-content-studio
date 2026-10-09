import { describe, expect, it } from "vitest";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";

describe("createEmptyDashboardState", () => {
  it("creates schema version 1 with canonical production configuration", () => {
    const state = createEmptyDashboardState();

    expect(state.schemaVersion).toBe(1);
    expect(state.categories.map((category) => category.name)).toEqual([
      "ความรู้",
      "รีวิว",
      "บรรยากาศ",
    ]);
    expect(state.formats.map((format) => format.mediaKind)).toEqual([
      "video",
      "image",
      "image",
      "other",
    ]);
    expect(state.contents).toEqual([]);
    expect(state.notificationReadIds).toEqual([]);
    expect(state.integrations.every((item) => item.status === "disconnected")).toBe(true);
  });
});
