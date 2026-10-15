import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportConnectionsPanel } from "../features/reports/components/ReportConnectionsPanel";
import type { DashboardState } from "../features/domain/types";

const mock = vi.hoisted(() => ({ mutate: vi.fn(), state: { reporting: { connections: [], publications: [{ id: "facebook:p:1", contentId: "content-existing", title: "Old" }], observations: [{ id: "old-snapshot" }], savedReports: [] } } }));
vi.mock("../features/data/DashboardDataProvider", () => ({ useDashboardData: () => mock }));
afterEach(() => { vi.unstubAllGlobals(); mock.mutate.mockReset(); });
describe("report connection panel", () => {
  it("persists snapshots without erasing manual matches or earlier observations", async () => {
    let next: DashboardState | undefined;
    mock.mutate.mockImplementation(async (mutate) => { next = mutate(mock.state); });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ connections: [], publications: [{ id: "facebook:p:1", contentId: null, title: "New" }], observations: [{ id: "new-snapshot" }], warnings: [], truncated: false })));
    render(<ReportConnectionsPanel />);
    fireEvent.click(screen.getByRole("button", { name: "ดึงข้อมูลล่าสุดจากโซเชียล" }));
    await waitFor(() => expect(mock.mutate).toHaveBeenCalled());
    expect(next?.reporting?.publications[0]).toMatchObject({ contentId: "content-existing", title: "New" });
    expect(next?.reporting?.observations.map((o) => o.id)).toEqual(["old-snapshot", "new-snapshot"]);
    expect(await screen.findByRole("status")).toHaveTextContent("บันทึก 1 โพสต์");
  });
  it("does not claim a successful save when persistence fails", async () => {
    mock.mutate.mockRejectedValue(new Error("บันทึกขัดข้อง"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ connections: [], publications: [], observations: [], warnings: [], truncated: false })));
    render(<ReportConnectionsPanel />);
    fireEvent.click(screen.getByRole("button", { name: "ดึงข้อมูลล่าสุดจากโซเชียล" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("บันทึกขัดข้อง"));
  });
});
