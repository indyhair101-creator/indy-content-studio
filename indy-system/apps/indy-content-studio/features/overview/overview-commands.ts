import type { DashboardState } from "../domain/types";

export function setCategoryMonthlyGoal(
  state: DashboardState,
  month: string,
  categoryId: string,
  target: number | null,
): DashboardState {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("เดือนต้องอยู่ในรูปแบบ YYYY-MM");
  if (!state.categories.some((category) => category.id === categoryId)) throw new Error("ไม่พบหมวดคอนเทนต์นี้");
  if (target !== null && (!Number.isInteger(target) || target < 1)) throw new Error("เป้าหมายต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป");

  const exists = state.categoryMonthlyGoals.some((goal) => goal.month === month && goal.categoryId === categoryId);
  if (target === null) {
    return {
      ...state,
      categoryMonthlyGoals: state.categoryMonthlyGoals.filter((goal) => goal.month !== month || goal.categoryId !== categoryId),
    };
  }

  const goal = { month, categoryId, target };
  return {
    ...state,
    categoryMonthlyGoals: exists
      ? state.categoryMonthlyGoals.map((item) => item.month === month && item.categoryId === categoryId ? goal : item)
      : [...state.categoryMonthlyGoals, goal],
  };
}
