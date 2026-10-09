import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiDashboardRepository } from "../features/data/api-dashboard-repository";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
afterEach(() => vi.unstubAllGlobals());
describe("authoritative API save acknowledgement", () => {
  it("returns and broadcasts the persisted server snapshot, including server-added history", async () => {
    const initial = createEmptyDashboardState();
    const submitted = { ...initial, notificationReadIds: ["client"] };
    const persisted = { ...submitted, statusHistory: [], notificationReadIds: ["server"] };
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ version: 1, state: initial })).mockResolvedValueOnce(Response.json({ version: 2, state: persisted }));
    vi.stubGlobal("fetch", fetcher);
    const repository = new ApiDashboardRepository();
    const listener = vi.fn(); const unsubscribe = repository.subscribe(listener);
    try {
      await repository.read();
      expect(await repository.write(submitted)).toEqual(persisted);
      expect(listener).toHaveBeenLastCalledWith(persisted);
      expect(fetcher).toHaveBeenCalledTimes(2);
    } finally { unsubscribe(); }
  });
  it("never broadcasts submitted state as confirmed when an older server returns only a revision", async () => {
    const initial = createEmptyDashboardState();
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ version: 1, state: initial })).mockResolvedValueOnce(Response.json({ version: 2 }));
    vi.stubGlobal("fetch", fetcher);
    const repository = new ApiDashboardRepository();
    const listener = vi.fn(); const unsubscribe = repository.subscribe(listener);
    try {
      await repository.read();
      expect(await repository.write({ ...initial, notificationReadIds: ["client"] })).toBeUndefined();
      expect(listener).not.toHaveBeenCalled();
    } finally { unsubscribe(); }
  });
});
