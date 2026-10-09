import { describe, expect, it } from "vitest";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import { cloneDashboardState } from "../features/data/dashboard-repository";
import type { DashboardState } from "../features/domain/types";

describe("dashboard snapshot compatibility", () => {
  it("fills in category goals when reading a legacy snapshot", () => {
    const legacy = { ...createEmptyDashboardState(), categoryMonthlyGoals: undefined } as unknown as DashboardState;
    expect(cloneDashboardState(legacy).categoryMonthlyGoals).toEqual([]);
  });
});
