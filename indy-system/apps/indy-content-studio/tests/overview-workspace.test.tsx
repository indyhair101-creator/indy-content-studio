import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DashboardDataProvider } from "../features/data/DashboardDataProvider";
import { MemoryDashboardRepository } from "../features/data/memory-dashboard-repository";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import type { ContentItem } from "../features/domain/types";
import { OverviewWorkspace } from "../features/overview/components/OverviewWorkspace";

function item(id: string, categoryId: string, overrides: Partial<ContentItem> = {}): ContentItem {
  return {
    id, title: id, categoryId, formatId: "format-video", owner: "ทีม", objective: "awareness", priority: "normal",
    plannedWorkAt: "2026-09-12", lastWorkedAt: null, readyDate: "2026-09-12", productionStatus: "waiting-shoot",
    assetIds: [], processSteps: [], caption: "", captionSource: null, schedules: [], referenceIds: [], notes: "",
    localApproval: "pending", lineReview: { status: "not-sent", activeCycleId: null, reviewCode: null, providerReceipts: [], lastEventAt: null, history: [] },
    createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", deletedAt: null, ...overrides,
  };
}

describe("OverviewWorkspace", () => {
  it("shows live metric cards and search", async () => {
    render(<DashboardDataProvider repository={new MemoryDashboardRepository()}><OverviewWorkspace /></DashboardDataProvider>);
    expect(await screen.findByRole("searchbox", { name: "ค้นหาคอนเทนต์" })).toBeVisible();
    expect(screen.getByText("ภาพรวมรายเดือน")).toBeVisible();
  });

  it("lets the user set a per-category monthly target and reflects it in the progress ring", async () => {
    const state = createEmptyDashboardState();
    state.categories.push({ id: "category-behind", name: "เบื้องหลัง", requiresApproval: false });
    state.contents.push(item("ความรู้ส่งแล้ว", "category-knowledge", { lineReview: { status: "sent", activeCycleId: "cycle", reviewCode: null, providerReceipts: ["receipt"], lastEventAt: "now", history: [] } }));
    const repository = new MemoryDashboardRepository(state);
    render(<DashboardDataProvider repository={repository}><OverviewWorkspace /></DashboardDataProvider>);
    fireEvent.change(await screen.findByLabelText("เดือนที่ดู"), { target: { value: "2026-09" } });

    const targetInput = await screen.findByLabelText("เป้าหมาย ความรู้");
    expect(targetInput).toHaveValue(null);
    expect(screen.getByText("1/—")).toBeVisible();
    fireEvent.change(targetInput, { target: { value: "4" } });
    fireEvent.blur(targetInput);
    await waitFor(() => expect(screen.getByText("1/4")).toBeVisible());
    expect(screen.getByRole("progressbar", { name: "ความรู้ ความคืบหน้า 1 จาก 4" })).toHaveAttribute("aria-valuenow", "1");
    await waitFor(async () => expect((await repository.read()).categoryMonthlyGoals).toEqual([{ month: "2026-09", categoryId: "category-knowledge", target: 4 }]));
    expect(screen.getByLabelText("เป้าหมาย เบื้องหลัง")).toHaveValue(null);
    fireEvent.change(targetInput, { target: { value: "" } });
    fireEvent.blur(targetInput);
    await waitFor(async () => expect((await repository.read()).categoryMonthlyGoals).toEqual([]));
    await waitFor(() => expect(screen.getByText("1/—")).toBeVisible());
    expect(screen.queryByRole("columnheader", { name: "พร้อมผลิต" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "สถานะ" })).not.toBeInTheDocument();
  });
});
