import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DashboardDataProvider } from "../features/data/DashboardDataProvider";
import { MemoryDashboardRepository } from "../features/data/memory-dashboard-repository";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import type { ContentItem } from "../features/domain/types";
import { ProductionBoardWorkspace } from "../features/production/components/ProductionBoardWorkspace";

function makeContent(overrides: Partial<ContentItem> = {}): ContentItem {
  const now = "2026-09-18T10:00:00.000Z";
  return { id: "production-1", title: "โพสต์พร้อมตรวจ", categoryId: "cat", formatId: "format", owner: "ทีมคอนเทนต์", objective: "awareness", priority: "high", plannedWorkAt: null, lastWorkedAt: null, readyDate: null, productionStatus: "review", assetIds: [], processSteps: [], caption: "", captionSource: null, schedules: [{ platform: "facebook", enabled: true, publishAt: null, latestAttemptId: null, manualEvidence: null }], referenceIds: [], notes: "", localApproval: "pending", lineReview: { status: "not-sent", activeCycleId: null, reviewCode: null, providerReceipts: [], lastEventAt: null, history: [] }, createdAt: now, updatedAt: now, deletedAt: null, ...overrides };
}

describe("ProductionBoardWorkspace", () => {
  it("offers minimal owner filter buttons from settings and switches between one owner and all work", async () => {
    const repository = new MemoryDashboardRepository({
      ...createEmptyDashboardState(),
      ownerOptions: ["colofill", "Misschilli"],
      contents: [
        makeContent({ owner: "colofill" }),
        makeContent({ id: "production-2", title: "รีวิวของ Misschilli", owner: "Misschilli" }),
      ],
    });
    render(<DashboardDataProvider repository={repository}><ProductionBoardWorkspace /></DashboardDataProvider>);

    const ownerFilter = await screen.findByRole("group", { name: "กรองผู้รับผิดชอบ" });
    expect(screen.getByRole("button", { name: "รวมทั้งหมด" })).toHaveAttribute("aria-pressed", "true");
    expect(within(ownerFilter).getByRole("button", { name: "colofill" })).toBeVisible();
    expect(within(ownerFilter).getByRole("button", { name: "Misschilli" })).toBeVisible();
    expect(screen.getByText("โพสต์พร้อมตรวจ")).toBeVisible();
    expect(screen.getByText("รีวิวของ Misschilli")).toBeVisible();

    fireEvent.click(within(ownerFilter).getByRole("button", { name: "Misschilli" }));
    expect(screen.getByRole("button", { name: "Misschilli" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("รีวิวของ Misschilli")).toBeVisible();
    expect(screen.queryByText("โพสต์พร้อมตรวจ")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "รวมทั้งหมด" }));
    expect(screen.getByText("โพสต์พร้อมตรวจ")).toBeVisible();
  });

  it("filters and moves a content card between production columns", async () => {
    const repository = new MemoryDashboardRepository({ ...createEmptyDashboardState(), contents: [makeContent()] });
    render(<DashboardDataProvider repository={repository}><ProductionBoardWorkspace /></DashboardDataProvider>);
    expect(await screen.findByText("โพสต์พร้อมตรวจ")).toBeVisible();
    fireEvent.change(screen.getByLabelText("ย้าย โพสต์พร้อมตรวจ"), { target: { value: "ready" } });
    await waitFor(() => expect(screen.getByRole("combobox", { name: "ย้าย โพสต์พร้อมตรวจ" })).toHaveValue("ready"));
    expect((await repository.read()).contents[0].productionStatus).toBe("ready");
  });

  it("surfaces the evidence rule when moving directly to Published", async () => {
    const repository = new MemoryDashboardRepository({ ...createEmptyDashboardState(), contents: [makeContent()] });
    render(<DashboardDataProvider repository={repository}><ProductionBoardWorkspace /></DashboardDataProvider>);
    fireEvent.change(await screen.findByLabelText("ย้าย โพสต์พร้อมตรวจ"), { target: { value: "published" } });
    expect(await screen.findByRole("alert")).toHaveTextContent("ยังไม่มีหลักฐานเผยแพร่ครบทุกช่องทาง");
  });
});
