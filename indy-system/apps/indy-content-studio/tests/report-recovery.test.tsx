import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HomePage } from "../app/home-page-view";
import { MemoryDashboardRepository } from "../features/data/memory-dashboard-repository";

beforeEach(() => localStorage.clear());
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function setup() {
  const repository = new MemoryDashboardRepository();
  vi.spyOn(repository, "read").mockRejectedValue(new Error("database quota"));
  const write = vi.spyOn(repository, "write");
  const now = new Date().toISOString();
  const fetcher = vi.fn(async (url: string) => {
    if (url !== "/api/reports/sync") return Response.json({ status: "not_connected" });
    return Response.json({ connections: [], warnings: [], truncated: false,
      publications: [{ id: "facebook:page:post", contentId: null, platform: "facebook", accountId: "page", providerPostId: "post", url: "https://facebook.com/post", title: "คลิปจริงจาก Facebook", publishedAt: now, mediaKind: "video", durationSeconds: 30, thumbnailUrl: null }],
      observations: [{ id: "measurement", publicationId: "facebook:page:post", fetchedAt: now, source: "api", sourceLabel: "Meta API", scope: "lifetime", period: null, traffic: "all", metrics: { views: 1234, watchSeconds: 9876 }, averageWatchWeight: null, retention: null }],
    });
  });
  vi.stubGlobal("fetch", fetcher);
  return { repository, write, fetcher };
}

describe("insights during database outage", () => {
  it("can manually fetch and graph real metrics without writing the unavailable work database, then restore them locally", async () => {
    const { repository, write, fetcher } = setup();
    const view = render(<HomePage repository={repository} />);
    fireEvent.click(screen.getByRole("button", { name: "Report ข้อมูลเชิงลึก" }));
    const sync = await screen.findByRole("button", { name: "ดึงข้อมูลล่าสุดจากโซเชียล" });
    await waitFor(() => expect(sync).toBeEnabled());
    expect(fetcher.mock.calls.filter(([url]) => url === "/api/reports/sync")).toHaveLength(0);
    fireEvent.click(sync);
    expect(await screen.findByRole("region", { name: "สรุป Facebook" })).toHaveTextContent("1,234");
    expect(screen.getByRole("img", { name: /กราฟผลโพสต์/ })).toBeInTheDocument();
    expect(screen.getByText(/เก็บเฉพาะในเบราว์เซอร์นี้/)).toBeInTheDocument();
    expect(write).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "เปิดคอนเทนต์" })).not.toBeInTheDocument();
    expect(screen.queryByText("นำเข้าและจับคู่กับปฏิทิน (ไม่จำเป็นสำหรับดูตัวเลข)")).not.toBeInTheDocument();
    view.unmount();
    render(<HomePage repository={repository} />);
    fireEvent.click(screen.getByRole("button", { name: "Report ข้อมูลเชิงลึก" }));
    expect(await screen.findByRole("region", { name: "สรุป Facebook" })).toHaveTextContent("1,234");
    expect(fetcher.mock.calls.filter(([url]) => url === "/api/reports/sync")).toHaveLength(1);
  });

  it("still displays fetched metrics if browser storage is full, with a session-only warning", async () => {
    const { repository, write } = setup();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    render(<HomePage repository={repository} />);
    fireEvent.click(screen.getByRole("button", { name: "Report ข้อมูลเชิงลึก" }));
    const sync = await screen.findByRole("button", { name: "ดึงข้อมูลล่าสุดจากโซเชียล" });
    await waitFor(() => expect(sync).toBeEnabled());
    fireEvent.click(sync);
    expect(await screen.findByRole("region", { name: "สรุป Facebook" })).toHaveTextContent("1,234");
    expect(screen.getByText(/เก็บได้เฉพาะหน้านี้/)).toBeInTheDocument();
    expect(write).not.toHaveBeenCalled();
  });
});
