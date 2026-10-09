import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DashboardDataProvider } from "../features/data/DashboardDataProvider";
import { MemoryDashboardRepository } from "../features/data/memory-dashboard-repository";
import { SettingsWorkspace } from "../features/settings/components/SettingsWorkspace";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import { dashboardTaskToContent } from "../features/dashboard/dashboard-model";

async function renderSettings(withUsedContent = false) {
  const repository = new MemoryDashboardRepository();
  if (withUsedContent) {
    const state = createEmptyDashboardState();
    await repository.write({ ...state, contents: [dashboardTaskToContent({ id: "used", title: "งานที่ใช้หมวดรีวิว", priority: "normal", scheduledTime: "ยังไม่กำหนด", category: "รีวิว", format: "วิดีโอ" }, state, "2026-09-18T00:00:00.000Z")] });
  }
  return render(<DashboardDataProvider repository={repository}><SettingsWorkspace /></DashboardDataProvider>);
}

describe("SettingsWorkspace", () => {
  it("persists renamed owners on existing content when saving the settings name", async () => {
    const state = createEmptyDashboardState();
    state.ownerOptions = ["Misschilli", "colofill"];
    const content = dashboardTaskToContent({ id: "owned", title: "งานเดิม", priority: "normal", scheduledTime: "ยังไม่กำหนด", category: "รีวิว", format: "วิดีโอ" }, state, "2026-09-18T00:00:00.000Z");
    state.contents = [{ ...content, owner: "Misschilli" }];
    const repository = new MemoryDashboardRepository(state);
    render(<DashboardDataProvider repository={repository}><SettingsWorkspace /></DashboardDataProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "แก้ชื่อ Misschilli" }));
    fireEvent.change(screen.getByLabelText("ชื่อผู้รับผิดชอบ Misschilli"), { target: { value: "Big boss" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกชื่อ Misschilli" }));
    expect(await screen.findByText("เปลี่ยนชื่อผู้รับผิดชอบแล้ว")).toBeVisible();
    const saved = await repository.read();
    expect(saved.ownerOptions).toEqual(["Big boss", "colofill"]);
    expect(saved.contents).toEqual([{ ...content, owner: "Big boss" }]);
    expect(screen.queryByRole("button", { name: "แก้ชื่อ Misschilli" })).not.toBeInTheDocument();
  });

  it("adds a category, toggles approval, and renames it", async () => {
    await renderSettings();
    expect(await screen.findByText(/หมวดคอนเทนต์ใช้บอกว่าเนื้อหาเกี่ยวกับอะไร/)).toBeVisible();
    expect(screen.getByText(/รูปแบบการนำเสนอใช้บอกว่าจะเผยแพร่เป็นอะไร/)).toBeVisible();
    fireEvent.click(await screen.findByRole("button", { name: "เพิ่มหมวด" }));
    fireEvent.change(screen.getByLabelText("ชื่อหมวด"), { target: { value: "เบื้องหลัง" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกหมวด" }));
    const category = await screen.findByText("เบื้องหลัง");
    expect(category).toBeVisible();
    const card = category.closest("article")!;
    fireEvent.click(within(card).getByRole("checkbox", { name: "ต้องอนุมัติก่อนเผยแพร่" }));
    fireEvent.click(within(card).getByRole("button", { name: "แก้ชื่อหมวด" }));
    fireEvent.change(within(card).getByLabelText("ชื่อหมวดเบื้องหลัง"), { target: { value: "เบื้องหลังทีม" } });
    fireEvent.click(within(card).getByRole("button", { name: "บันทึกชื่อหมวด" }));
    expect(await screen.findByText("เบื้องหลังทีม")).toBeVisible();
  });

  it("adds a format, saves a monthly goal, and removes a used category without orphaning work", async () => {
    await renderSettings(true);
    const deleteReview = await screen.findByRole("button", { name: "ลบหมวด รีวิว" });
    expect(deleteReview).toBeEnabled();
    fireEvent.click(deleteReview);
    expect(await screen.findByText("ลบหมวดแล้ว และย้ายงานไปที่ ความรู้")).toBeVisible();
    expect(screen.queryByText("รีวิว", { selector: "strong" })).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "เพิ่มรูปแบบ" }));
    fireEvent.change(screen.getByLabelText("ชื่อรูปแบบ"), { target: { value: "Carousel" } });
    fireEvent.change(screen.getByLabelText("ชนิดสื่อ"), { target: { value: "image" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกรูปแบบ" }));
    expect(await screen.findByText("Carousel")).toBeVisible();
    fireEvent.change(screen.getByLabelText("เป้าหมายเดือนนี้"), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกเป้าหมาย" }));
    expect(await screen.findByText("บันทึกเป้าหมายแล้ว")).toBeVisible();
  });

  it("refreshes integration health without exposing secrets", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ integrations: [{ provider: "line", status: "connected", checkedAt: "2026-09-18T00:00:00.000Z", message: "เชื่อมต่อแล้ว" }] }) }));
    await renderSettings();
    fireEvent.click(await screen.findByRole("button", { name: "ตรวจการเชื่อมต่อ" }));
    expect(await screen.findByText("เชื่อมต่อแล้ว")).toBeVisible();
  });
});
