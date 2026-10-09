import { expect, it } from "vitest";
import type { Category } from "../features/domain/types";
import type { DashboardRepository } from "../features/data/dashboard-repository";

const categoryFixture: Category = {
  id: "category-contract",
  name: "ทดสอบ",
  requiresApproval: true,
};

export function dashboardRepositoryContract(
  label: string,
  makeRepository: () => DashboardRepository,
) {
  it(`${label} persists an immutable snapshot and notifies subscribers`, async () => {
    const repository = makeRepository();
    const seen: string[] = [];
    const unsubscribe = repository.subscribe((state) => seen.push(state.categories[0]?.name ?? ""));
    const state = await repository.read();
    const next = {
      ...state,
      categories: [...state.categories, categoryFixture],
    };

    await repository.write(next);
    next.categories[0].name = "mutated outside";

    expect((await repository.read()).categories[0].name).not.toBe("mutated outside");
    expect(seen).toEqual(["ความรู้"]);
    unsubscribe();
  });
}
