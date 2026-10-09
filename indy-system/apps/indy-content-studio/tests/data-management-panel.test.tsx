import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DataManagementPanel } from "../features/backup/components/DataManagementPanel";
import { exportDashboardState } from "../features/backup/export-dashboard";
import { DashboardDataProvider } from "../features/data/DashboardDataProvider";
import { MemoryDashboardRepository } from "../features/data/memory-dashboard-repository";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";

describe("DataManagementPanel", () => {
  it("previews and merges a valid backup", async () => {
    const incoming = createEmptyDashboardState(); incoming.monthlyGoals.push({ month: "2026-09", target: 9 });
    const repository = new MemoryDashboardRepository(createEmptyDashboardState());
    const file = new File([JSON.stringify(exportDashboardState(incoming, "now"))], "backup.json", { type: "application/json" });
    render(<DashboardDataProvider repository={repository}><DataManagementPanel /></DashboardDataProvider>);
    fireEvent.change(await screen.findByLabelText("เลือกไฟล์สำรอง"), { target: { files: [file] } });
    expect(await screen.findByText(/จะเพิ่มชิ้นงาน/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "รวมข้อมูล" }));
    expect(await screen.findByRole("status")).toHaveTextContent("นำเข้าสำเร็จ");
    expect((await repository.read()).monthlyGoals).toHaveLength(1);
  });

  it("reports invalid backup files", async () => {
    vi.stubGlobal("URL", { createObjectURL: vi.fn(), revokeObjectURL: vi.fn() });
    const file = new File(["not json"], "bad.json", { type: "application/json" });
    render(<DashboardDataProvider repository={new MemoryDashboardRepository()}><DataManagementPanel /></DashboardDataProvider>);
    fireEvent.change(await screen.findByLabelText("เลือกไฟล์สำรอง"), { target: { files: [file] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("JSON");
  });
});
