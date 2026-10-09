import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiDashboardRepository } from "../features/data/api-dashboard-repository";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe("dashboard synchronization with MCP changes", () => {
  it("refreshes remote changes on focus and a timer, and removes polling on unsubscribe", async () => {
    vi.useFakeTimers();
    const state = createEmptyDashboardState();
    let version = 1;
    const fetch = vi.fn(async () => Response.json({ state, version }));
    vi.stubGlobal("fetch", fetch);
    const repo = new ApiDashboardRepository();
    await repo.read();
    const listener = vi.fn(); const stop = repo.subscribe(listener);
    state.notificationReadIds.push("changed-through-mcp"); version = 2;
    window.dispatchEvent(new Event("focus"));
    await vi.waitFor(() => expect(listener).toHaveBeenCalled());
    expect(listener.mock.calls.at(-1)?.[0].notificationReadIds).toEqual(["changed-through-mcp"]);
    listener.mockClear(); version = 3;
    await vi.advanceTimersByTimeAsync(15000);
    expect(listener).toHaveBeenCalled();
    stop();
    expect(vi.getTimerCount()).toBe(0);
    fetch.mockClear(); window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(15000);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not replace a saved snapshot with an older read that finishes late", async () => {
    const initial = createEmptyDashboardState();
    const next = structuredClone(initial); next.notificationReadIds.push("saved");
    let resolveRead!: (response: Response) => void;
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ state: initial, version: 1 }))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveRead = resolve; }))
      .mockResolvedValueOnce(Response.json({ version: 2, state: next }));
    vi.stubGlobal("fetch", fetch);
    const repo = new ApiDashboardRepository();
    await repo.read();
    const staleRead = repo.read();
    await repo.write(next);
    resolveRead(Response.json({ state: initial, version: 1 }));
    expect((await staleRead).notificationReadIds).toEqual(["saved"]);
  });
  it("rejects a late stale read after a legacy revision-only save instead of labelling old or submitted state confirmed", async () => {
    const initial = createEmptyDashboardState();
    const submitted = { ...initial, notificationReadIds: ["submitted"] };
    const persisted = { ...initial, notificationReadIds: ["server-confirmed"] };
    let resolveRead!: (response: Response) => void;
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ state: initial, version: 1 }))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveRead = resolve; }))
      .mockResolvedValueOnce(Response.json({ version: 2 }))
      .mockResolvedValueOnce(Response.json({ state: persisted, version: 2 }));
    vi.stubGlobal("fetch", fetch);
    const repo = new ApiDashboardRepository();
    await repo.read();
    const listener = vi.fn(); const stop = repo.subscribe(listener);
    try {
      const staleRead = repo.read();
      expect(await repo.write(submitted)).toBeUndefined();
      resolveRead(Response.json({ state: initial, version: 1 }));
      await expect(staleRead).rejects.toThrow("ข้อมูลล่าสุด");
      expect(listener).not.toHaveBeenCalled();
      window.dispatchEvent(new Event("focus"));
      await vi.waitFor(() => expect(listener).toHaveBeenLastCalledWith(persisted));
    } finally { stop(); }
  });
});
