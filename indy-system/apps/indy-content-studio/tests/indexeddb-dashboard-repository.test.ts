import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import { MemoryDashboardRepository } from "../features/data/memory-dashboard-repository";
import { IndexedDbDashboardRepository } from "../features/data/indexeddb-dashboard-repository";
import { dashboardRepositoryContract } from "./dashboard-repository-contract";

dashboardRepositoryContract("memory repository", () => new MemoryDashboardRepository());

describe("IndexedDbDashboardRepository", () => {
  const databaseName = "indy-repository-contract";

  dashboardRepositoryContract(
    "indexeddb repository",
    () => new IndexedDbDashboardRepository({ databaseName }),
  );

  it("reads the same snapshot from a new repository instance", async () => {
    const first = new IndexedDbDashboardRepository({ databaseName: "indy-repository-reload" });
    const state = createEmptyDashboardState();
    state.monthlyGoals.push({ month: "2026-09", target: 12 });

    await first.write(state);

    const second = new IndexedDbDashboardRepository({ databaseName: "indy-repository-reload" });
    expect(await second.read()).toMatchObject({ monthlyGoals: [{ month: "2026-09", target: 12 }] });
  });
});
