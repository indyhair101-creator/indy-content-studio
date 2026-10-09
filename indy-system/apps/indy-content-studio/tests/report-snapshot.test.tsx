import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import { MemoryDashboardRepository } from "../features/data/memory-dashboard-repository";
import { DashboardDataProvider } from "../features/data/DashboardDataProvider";
import { ReportActions, SavedReportsPanel } from "../features/reports/components/SavedReportsPanel";
import { buildReportSnapshot, isReportSnapshot } from "../features/reports/report-snapshot";
import { defaultReportFilters } from "../features/reports/report-dates";

describe("saved report integration", () => {
  it("prints wide content metrics as readable fields and treats imported text as text", async () => {
    const state=createEmptyDashboardState();
    const snapshot=buildReportSnapshot(state,"content",defaultReportFilters("2026-10-09"));
    snapshot.rows=[snapshot.columns.map((_,i)=>i===0?"<script>untrusted</script>":"123")];
    state.reporting={connections:[],publications:[],observations:[],savedReports:[{id:"print",title:"Print fixture",kind:"content",createdAt:"2026-10-09T00:00:00Z",filters:defaultReportFilters("2026-10-09"),snapshot}]};
    const print=vi.spyOn(window,"print").mockImplementation(()=>{});
    render(<DashboardDataProvider repository={new MemoryDashboardRepository(state)}><SavedReportsPanel kind="content"/></DashboardDataProvider>);
    fireEvent.click(await screen.findByRole("button",{name:"Print fixture"}));
    fireEvent.click(screen.getByRole("button",{name:"พิมพ์ / บันทึก PDF"}));
    expect(print).toHaveBeenCalledOnce();
    expect(document.querySelector(".report-print-area dl")).not.toBeNull();
    expect(document.querySelector(".report-print-area script")).toBeNull();
    expect(document.querySelector(".report-print-area")?.textContent).toContain("<script>untrusted</script>");
    window.dispatchEvent(new Event("afterprint"));
    expect(document.querySelector(".report-print-area")).toBeNull();
    print.mockRestore();
  });
  it("persists the selected dates and frozen rows and opens them after remount", async () => {
    const state = createEmptyDashboardState();
    const filters = defaultReportFilters("2026-10-09");
    state.actionTasks = [{ id: "a", title: "Original title", owner: "Big boss", scheduledDate: "2026-10-09", status: "doing", createdAt: "2026-10-09T00:00:00Z", updatedAt: "2026-10-09T00:00:00Z" }];
    const repository = new MemoryDashboardRepository(state);
    const view = render(<DashboardDataProvider repository={repository}><ReportActions kind="team" filters={filters} /><SavedReportsPanel kind="team" /></DashboardDataProvider>);
    await waitFor(async () => expect((await repository.read()).actionTasks).toHaveLength(1));
    fireEvent.click(await screen.findByRole("button", { name: "บันทึกรายงานช่วงนี้" }));
    await screen.findByText("บันทึกรายงานและตัวเลข ณ เวลานี้แล้ว");
    const saved = await repository.read();
    expect(saved.reporting?.savedReports[0].filters).toEqual(filters);
    const snapshot = saved.reporting?.savedReports[0].snapshot;
    expect(isReportSnapshot(snapshot) && snapshot.evidence?.actionTasks).toEqual(state.actionTasks);
    saved.actionTasks[0].title = "Changed later";
    await repository.write(saved);
    view.unmount();
    render(<DashboardDataProvider repository={repository}><SavedReportsPanel kind="team" /></DashboardDataProvider>);
    fireEvent.click(await screen.findByRole("button", { name: `รายงานทีม ${filters.range.start} ถึง ${filters.range.end}` }));
    expect(await screen.findByText("Original title")).toBeVisible();
    expect(screen.queryByText("Changed later")).not.toBeInTheDocument();
  });

  it("builds an empty content report without inventing zero metrics and rejects malformed saved data", () => {
    const snapshot = buildReportSnapshot(createEmptyDashboardState(), "content", defaultReportFilters("2026-10-09"));
    expect(isReportSnapshot(snapshot)).toBe(true);
    expect(snapshot.rows).toEqual([]);
    expect(snapshot.columns).toContain("ฐานรายงาน");
    expect(snapshot.columns).toContain("แหล่งยอดที่เลือก");
    expect(snapshot.evidence?.observations).toEqual([]);
    expect(snapshot.summary.every(item => item.value === "ไม่มีข้อมูล")).toBe(true);
    expect(isReportSnapshot({ ...snapshot, rows: [[null]] })).toBe(false);
    expect(isReportSnapshot({ ...snapshot, summary: [null] })).toBe(false);
  });
});
