import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DashboardDataProvider } from "../features/data/DashboardDataProvider";
import { MemoryDashboardRepository } from "../features/data/memory-dashboard-repository";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import type { ContentItem } from "../features/domain/types";
import { ReferencesWorkspace } from "../features/references/components/ReferencesWorkspace";

function contentReferencing(referenceId: string): ContentItem {
  const now = "2026-09-18T10:00:00.000Z";
  return { id: "content-1", title: "โพสต์ที่อ้างอิง", categoryId: "category-knowledge", formatId: "format-video", owner: "ทีม", objective: "awareness", priority: "normal", plannedWorkAt: null, lastWorkedAt: null, readyDate: null, productionStatus: "waiting-shoot", assetIds: [], processSteps: [], caption: "", captionSource: null, schedules: [], referenceIds: [referenceId], notes: "", localApproval: "pending", lineReview: { status: "not-sent", activeCycleId: null, reviewCode: null, providerReceipts: [], lastEventAt: null, history: [] }, createdAt: now, updatedAt: now, deletedAt: null };
}

describe("ReferencesWorkspace", () => {
  it("creates, edits, searches, filters, and opens a reference in a safe external link", async () => {
    const repository = new MemoryDashboardRepository();
    render(<DashboardDataProvider repository={repository}><ReferencesWorkspace /></DashboardDataProvider>);

    fireEvent.click(await screen.findByRole("button", { name: "เพิ่ม Reference" }));
    fireEvent.change(screen.getByLabelText("ชื่อไอเดีย"), { target: { value: "  ไอเดียทรงผม  " } });
    fireEvent.change(screen.getByLabelText("ลิงก์ HTTPS"), { target: { value: "https://example.com/hair" } });
    fireEvent.change(screen.getByLabelText("แพลตฟอร์ม"), { target: { value: "Instagram" } });
    fireEvent.change(screen.getByLabelText("แท็ก (คั่นด้วยจุลภาค)"), { target: { value: "ทรงผม, reel" } });
    fireEvent.change(screen.getByLabelText("โน้ต"), { target: { value: "ดูจังหวะการตัด" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึก Reference" }));

    expect(await screen.findByText("ไอเดียทรงผม")).toBeVisible();
    const link = screen.getByRole("link", { name: "เปิดแหล่งอ้างอิง: ไอเดียทรงผม" });
    expect(link).toHaveAttribute("href", "https://example.com/hair");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");

    fireEvent.click(screen.getByRole("button", { name: "แก้ไข ไอเดียทรงผม" }));
    fireEvent.change(screen.getByLabelText("ชื่อไอเดีย"), { target: { value: "ไอเดียทรงผมใหม่" } });
    fireEvent.change(screen.getByLabelText("แพลตฟอร์ม"), { target: { value: "TikTok" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกการแก้ไข" }));
    expect(await screen.findByText("ไอเดียทรงผมใหม่")).toBeVisible();

    fireEvent.change(screen.getByLabelText("กรองแพลตฟอร์ม"), { target: { value: "TikTok" } });
    expect(screen.getByText("ไอเดียทรงผมใหม่")).toBeVisible();
    fireEvent.change(screen.getByLabelText("ค้นหาไอเดีย"), { target: { value: "ไม่มี" } });
    expect(screen.getByText("ไม่พบ Reference ที่ตรงกับการค้นหา")).toBeVisible();
  });

  it("asks for confirmation before soft-deleting an attached reference and keeps it recoverable", async () => {
    const state = createEmptyDashboardState();
    state.references.push({ id: "ref-1", title: "Reference ที่แนบ", url: "https://example.com", platform: "YouTube", tags: [], notes: "", createdAt: "now", updatedAt: "now", deletedAt: null });
    state.contents.push(contentReferencing("ref-1"));
    const repository = new MemoryDashboardRepository(state);
    render(<DashboardDataProvider repository={repository}><ReferencesWorkspace /></DashboardDataProvider>);

    await screen.findByText("Reference ที่แนบ");
    expect(screen.getByText("แนบกับคอนเทนต์ 1 ชิ้น")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "ลบ Reference ที่แนบ" }));
    expect(screen.getByRole("dialog", { name: "ยืนยันการลบ Reference" })).toBeVisible();
    expect(screen.getByText("Reference นี้ถูกแนบกับคอนเทนต์ 1 ชิ้น")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "ยกเลิก" }));
    expect(screen.getByText("Reference ที่แนบ")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "ลบ Reference ที่แนบ" }));
    fireEvent.click(screen.getByRole("button", { name: "ยืนยันการลบ" }));
    await waitFor(() => expect(screen.queryByText("Reference ที่แนบ")).not.toBeInTheDocument());
    const persisted = await repository.read();
    expect(persisted.references[0].deletedAt).not.toBeNull();
    expect(persisted.references[0].url).toBe("https://example.com");
  });

  it("keeps in-progress comma-separated tags intact and gives dialogs keyboard focus control", async () => {
    const state = createEmptyDashboardState();
    state.references.push({ id: "ref-focus", title: "ลบด้วยคีย์บอร์ด", url: "https://example.com/focus", platform: "YouTube", tags: [], notes: "", createdAt: "now", updatedAt: "now", deletedAt: null });
    const repository = new MemoryDashboardRepository(state);
    render(<DashboardDataProvider repository={repository}><ReferencesWorkspace /></DashboardDataProvider>);

    const addTrigger = await screen.findByRole("button", { name: "เพิ่ม Reference" });
    addTrigger.focus();
    fireEvent.click(addTrigger);
    const title = screen.getByLabelText("ชื่อไอเดีย");
    expect(title).toHaveFocus();
    const tags = screen.getByLabelText("แท็ก (คั่นด้วยจุลภาค)");
    fireEvent.change(tags, { target: { value: "hair," } });
    expect(tags).toHaveValue("hair,");
    fireEvent.keyDown(screen.getByRole("dialog", { name: "เพิ่ม Reference" }), { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "เพิ่ม Reference" })).not.toBeInTheDocument();
    expect(addTrigger).toHaveFocus();

    const deleteTrigger = screen.getByRole("button", { name: "ลบ ลบด้วยคีย์บอร์ด" });
    deleteTrigger.focus();
    fireEvent.click(deleteTrigger);
    const cancel = screen.getByRole("button", { name: "ยกเลิก" });
    expect(cancel).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("dialog", { name: "ยืนยันการลบ Reference" }), { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "ยืนยันการลบ Reference" })).not.toBeInTheDocument();
    expect(deleteTrigger).toHaveFocus();
  });
});
