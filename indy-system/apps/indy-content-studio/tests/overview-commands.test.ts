import { describe, expect, it } from "vitest";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import { setCategoryMonthlyGoal } from "../features/overview/overview-commands";

describe("setCategoryMonthlyGoal", () => {
  it("creates, updates, and clears a target for only the selected category and month", () => {
    const state = createEmptyDashboardState();
    const first = setCategoryMonthlyGoal(state, "2026-09", "category-knowledge", 4);
    const updated = setCategoryMonthlyGoal(first, "2026-09", "category-knowledge", 7);
    const otherMonth = setCategoryMonthlyGoal(updated, "2026-10", "category-knowledge", 3);

    expect(otherMonth.categoryMonthlyGoals).toEqual([
      { month: "2026-09", categoryId: "category-knowledge", target: 7 },
      { month: "2026-10", categoryId: "category-knowledge", target: 3 },
    ]);
    expect(setCategoryMonthlyGoal(otherMonth, "2026-09", "category-knowledge", null).categoryMonthlyGoals).toEqual([
      { month: "2026-10", categoryId: "category-knowledge", target: 3 },
    ]);
  });

  it("rejects invalid months, missing categories, and non-positive targets", () => {
    const state = createEmptyDashboardState();
    expect(() => setCategoryMonthlyGoal(state, "2026-13", "category-knowledge", 3)).toThrow("เดือนต้องอยู่ในรูปแบบ YYYY-MM");
    expect(() => setCategoryMonthlyGoal(state, "2026-09", "missing-category", 3)).toThrow("ไม่พบหมวดคอนเทนต์นี้");
    expect(() => setCategoryMonthlyGoal(state, "2026-09", "category-knowledge", 0)).toThrow("เป้าหมายต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป");
  });
});
