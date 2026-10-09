import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TeamReportWorkspace } from "../features/reports/components/TeamReportWorkspace";
import { DashboardDataProvider } from "../features/data/DashboardDataProvider";
import { MemoryDashboardRepository } from "../features/data/memory-dashboard-repository";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import { bangkokDate } from "../features/reports/report-dates";

describe("team report navigation", () => {
  it("opens owner drilldown, then the real Action Plan and exposes filters to report actions", async () => {
    const state = createEmptyDashboardState();
    state.actionTasks = [{ id: "one", title: "โทร supplier", owner: "เมย์", scheduledDate: bangkokDate(), status: "doing", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
    const onOpenActionPlan = vi.fn();
    render(<DashboardDataProvider repository={new MemoryDashboardRepository(state)}><TeamReportWorkspace onOpenActionPlan={onOpenActionPlan} renderActions={(filters) => <p>ช่วงรายงาน {filters.range.end}</p>} /></DashboardDataProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "เมย์" }));
    const heading = screen.getByRole("heading", { name: "งานของ เมย์" });
    fireEvent.click(within(heading.parentElement!).getByRole("button", { name: "โทร supplier" }));
    expect(onOpenActionPlan).toHaveBeenCalledOnce();
    expect(screen.getByText(`ช่วงรายงาน ${bangkokDate()}`)).toBeVisible();
    expect(screen.getByText(/งานเสร็จหมายถึงเผยแพร่แล้ว/)).toBeVisible();
  });
});
