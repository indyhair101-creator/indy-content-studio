import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ActionPlanWorkspace } from "../features/action-plan/components/ActionPlanWorkspace";
import { DashboardDataProvider } from "../features/data/DashboardDataProvider";
import { MemoryDashboardRepository } from "../features/data/memory-dashboard-repository";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";

function createRepository({ includeStandalone = false }: { includeStandalone?: boolean } = {}) {
  const state = createEmptyDashboardState();
  state.contents.push({
    id: "content-1", title: "ถ่ายคลิป", categoryId: "category-knowledge", formatId: "format-video",
    owner: "colofill", objective: "awareness", priority: "normal", plannedWorkAt: null,
    lastWorkedAt: null, readyDate: null, productionStatus: "waiting-shoot", assetIds: [],
    processSteps: [
      { id: "step-1", name: "ตัดต่อ", scheduledDate: "2026-09-24", status: "todo", order: 0 },
      { id: "step-2", name: "เตรียมภาพ", scheduledDate: null, status: "todo", order: 1 },
    ],
    caption: "", captionSource: null, schedules: [
      { platform: "facebook", enabled: true, publishAt: "2026-09-24T09:00:00+07:00", latestAttemptId: null, manualEvidence: null },
      { platform: "instagram", enabled: true, publishAt: "2026-09-25T13:30:00+07:00", latestAttemptId: null, manualEvidence: null },
      { platform: "tiktok", enabled: false, publishAt: "2026-09-26T10:00:00+07:00", latestAttemptId: null, manualEvidence: null },
    ], referenceIds: [], notes: "",
    localApproval: "pending", lineReview: { status: "not-sent", activeCycleId: null, reviewCode: null,
      providerReceipts: [], lastEventAt: null, history: [] }, createdAt: "now", updatedAt: "now", deletedAt: null,
  });
  state.contents.push({
    id: "content-2", title: "รีวิวสินค้า", categoryId: "category-review", formatId: "format-video",
    owner: "Misschilli", objective: "awareness", priority: "normal", plannedWorkAt: null,
    lastWorkedAt: null, readyDate: null, productionStatus: "editing", assetIds: [],
    processSteps: [{ id: "step-3", name: "ตรวจแคปชัน", scheduledDate: "2026-09-24", status: "doing", order: 0 }],
    caption: "", captionSource: null, schedules: [], referenceIds: [], notes: "",
    localApproval: "pending", lineReview: { status: "not-sent", activeCycleId: null, reviewCode: null,
      providerReceipts: [], lastEventAt: null, history: [] }, createdAt: "now", updatedAt: "now", deletedAt: null,
  });
  if (includeStandalone) state.actionTasks.push({ id: "standalone-1", title: "ซื้อพร็อพ", scheduledDate: "2026-09-24", status: "todo", createdAt: "now", updatedAt: "now" });
  return new MemoryDashboardRepository(state);
}

describe("ActionPlanWorkspace", () => {
  it("filters by the selected owner, keeps summaries in sync, and offers names from settings", async () => {
    render(<DashboardDataProvider repository={createRepository({ includeStandalone: true })}><ActionPlanWorkspace /></DashboardDataProvider>);
    fireEvent.change(await screen.findByLabelText("วันที่อ้างอิง"), { target: { value: "2026-09-24" } });

    const ownerFilter = screen.getByRole("combobox", { name: "กรองผู้รับผิดชอบ" });
    expect(within(ownerFilter).getByRole("option", { name: "รวมทุกคน" })).toBeInTheDocument();
    expect(within(ownerFilter).getByRole("option", { name: "colofill" })).toBeInTheDocument();
    expect(within(ownerFilter).getByRole("option", { name: "Misschilli" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "ทำเสร็จ ตัดต่อ — ถ่ายคลิป" })).toBeVisible();
    expect(screen.getByRole("checkbox", { name: "ทำเสร็จ ตรวจแคปชัน — รีวิวสินค้า" })).toBeVisible();
    expect(screen.getByRole("checkbox", { name: "ทำเสร็จ ซื้อพร็อพ" })).toBeVisible();

    fireEvent.change(ownerFilter, { target: { value: "Misschilli" } });

    expect(screen.getByRole("checkbox", { name: "ทำเสร็จ ตรวจแคปชัน — รีวิวสินค้า" })).toBeVisible();
    expect(screen.queryByRole("checkbox", { name: "ทำเสร็จ ตัดต่อ — ถ่ายคลิป" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "ทำเสร็จ ซื้อพร็อพ" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("สรุปสถานะขั้นตอน")).toHaveTextContent("รอทำ 0");
    expect(screen.getByLabelText("สรุปสถานะขั้นตอน")).toHaveTextContent("กำลังทำ 1");
  });

  it("shows the content title and enabled social publication date and time on its action step", async () => {
    render(<DashboardDataProvider repository={createRepository()}><ActionPlanWorkspace /></DashboardDataProvider>);
    fireEvent.change(await screen.findByLabelText("วันที่อ้างอิง"), { target: { value: "2026-09-24" } });

    const step = screen.getByRole("checkbox", { name: "ทำเสร็จ ตัดต่อ — ถ่ายคลิป" }).closest("li");
    expect(step).toHaveTextContent("ถ่ายคลิป");
    expect(step).toHaveTextContent("Facebook · 24 ก.ย. 09:00");
    expect(step).toHaveTextContent("Instagram · 25 ก.ย. 13:30");
    expect(step).not.toHaveTextContent("TikTok");
  });

  it("opens a My Day list with suggestions beside it", async () => {
    render(<DashboardDataProvider repository={createRepository()}><ActionPlanWorkspace /></DashboardDataProvider>);
    fireEvent.change(await screen.findByLabelText("วันที่อ้างอิง"), { target: { value: "2026-09-24" } });

    expect(screen.getByRole("heading", { name: "วันของฉัน" })).toBeVisible();
    expect(screen.getByRole("region", { name: "งานของวันที่เลือก" })).toContainElement(
      screen.getByRole("checkbox", { name: "ทำเสร็จ ตัดต่อ — ถ่ายคลิป" }),
    );
    expect(screen.getByRole("region", { name: "คำแนะนำ" })).toBeVisible();
    expect(screen.getByRole("button", { name: "เพิ่มเข้าวันนี้ เตรียมภาพ — ถ่ายคลิป" })).toBeVisible();
    expect(screen.queryByRole("grid", { name: "ปฏิทิน Action Plan" })).not.toBeInTheDocument();
  });

  it("adds a suggested step to My Day and keeps checklist changes persisted", async () => {
    const repository = createRepository();
    render(<DashboardDataProvider repository={repository}><ActionPlanWorkspace /></DashboardDataProvider>);
    fireEvent.change(await screen.findByLabelText("วันที่อ้างอิง"), { target: { value: "2026-09-24" } });
    fireEvent.click(screen.getByRole("button", { name: "เพิ่มเข้าวันนี้ เตรียมภาพ — ถ่ายคลิป" }));

    const checkbox = await screen.findByRole("checkbox", { name: "ทำเสร็จ เตรียมภาพ — ถ่ายคลิป" });
    expect((await repository.read()).contents[0].processSteps[1].scheduledDate).toBe("2026-09-24");
    fireEvent.click(checkbox);
    await waitFor(() => expect(checkbox).toBeChecked());
    expect(checkbox.closest(".action-step-row")).toHaveClass("is-done");
  });

  it("quick-adds an independent Action Plan task without creating content", async () => {
    const repository = createRepository();
    render(<DashboardDataProvider repository={repository}><ActionPlanWorkspace /></DashboardDataProvider>);
    fireEvent.change(await screen.findByLabelText("วันที่อ้างอิง"), { target: { value: "2026-09-24" } });
    fireEvent.change(screen.getByRole("combobox", { name: "ผู้รับผิดชอบงานใหม่" }), { target: { value: "colofill" } });
    fireEvent.change(screen.getByRole("textbox", { name: "เพิ่มงานทั่วไป" }), { target: { value: "ตรวจงานใหม่" } });
    fireEvent.click(screen.getByRole("button", { name: "เพิ่มงาน" }));

    const checkbox = await screen.findByRole("checkbox", { name: "ทำเสร็จ ตรวจงานใหม่" });
    expect(checkbox).toBeVisible();
    const saved = await repository.read();
    expect(saved.actionTasks).toEqual([expect.objectContaining({ title: "ตรวจงานใหม่", scheduledDate: "2026-09-24", status: "todo" })]);
    expect(saved.contents.some((content) => content.title === "ตรวจงานใหม่")).toBe(false);
    fireEvent.click(checkbox);
    await waitFor(() => expect(checkbox).toBeChecked());
    expect((await repository.read()).actionTasks[0].status).toBe("done");
  });

  it("requires a responsible owner when adding from the all-people view", async () => {
    const repository = createRepository();
    render(<DashboardDataProvider repository={repository}><ActionPlanWorkspace /></DashboardDataProvider>);
    fireEvent.change(await screen.findByLabelText("วันที่อ้างอิง"), { target: { value: "2026-09-24" } });
    const titleInput = screen.getByRole("textbox", { name: "เพิ่มงานทั่วไป" });
    const ownerInput = screen.getByRole("combobox", { name: "ผู้รับผิดชอบงานใหม่" });
    const addButton = screen.getByRole("button", { name: "เพิ่มงาน" });
    fireEvent.change(titleInput, { target: { value: "ถ่ายเบื้องหลัง" } });
    expect(addButton).toBeDisabled();
    fireEvent.change(ownerInput, { target: { value: "Misschilli" } });
    fireEvent.click(addButton);

    expect(await screen.findByRole("checkbox", { name: "ทำเสร็จ ถ่ายเบื้องหลัง" })).toBeVisible();
    expect((await repository.read()).actionTasks).toEqual([expect.objectContaining({ title: "ถ่ายเบื้องหลัง", owner: "Misschilli" })]);
  });

  it("assigns a quick-added task to the selected owner and hides it from other owners", async () => {
    const repository = createRepository();
    render(<DashboardDataProvider repository={repository}><ActionPlanWorkspace /></DashboardDataProvider>);
    fireEvent.change(await screen.findByLabelText("วันที่อ้างอิง"), { target: { value: "2026-09-24" } });
    const ownerFilter = screen.getByRole("combobox", { name: "กรองผู้รับผิดชอบ" });
    fireEvent.change(ownerFilter, { target: { value: "colofill" } });
    fireEvent.change(screen.getByRole("textbox", { name: "เพิ่มงานทั่วไป" }), { target: { value: "ถ่ายเบื้องหลัง" } });
    fireEvent.click(screen.getByRole("button", { name: "เพิ่มงาน" }));

    expect(await screen.findByRole("checkbox", { name: "ทำเสร็จ ถ่ายเบื้องหลัง" })).toBeVisible();
    expect((await repository.read()).actionTasks).toEqual([expect.objectContaining({ title: "ถ่ายเบื้องหลัง", owner: "colofill" })]);
    fireEvent.change(ownerFilter, { target: { value: "Misschilli" } });
    expect(screen.queryByRole("checkbox", { name: "ทำเสร็จ ถ่ายเบื้องหลัง" })).not.toBeInTheDocument();
  });

  it("edits a standalone task from its Action Plan row", async () => {
    const repository = createRepository({ includeStandalone: true });
    render(<DashboardDataProvider repository={repository}><ActionPlanWorkspace /></DashboardDataProvider>);
    fireEvent.change(await screen.findByLabelText("วันที่อ้างอิง"), { target: { value: "2026-09-24" } });
    fireEvent.click(screen.getByRole("button", { name: "แก้ไข ซื้อพร็อพ" }));
    fireEvent.change(screen.getByRole("textbox", { name: "แก้ไขชื่องาน ซื้อพร็อพ" }), { target: { value: "ซื้อพร็อพใหม่" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกงาน ซื้อพร็อพ" }));

    await waitFor(() => expect((repository.read()).then((state) => state.actionTasks[0].title)).resolves.toBe("ซื้อพร็อพใหม่"));
  });

  it("deletes a standalone task only after confirmation", async () => {
    const repository = createRepository({ includeStandalone: true });
    render(<DashboardDataProvider repository={repository}><ActionPlanWorkspace /></DashboardDataProvider>);
    fireEvent.change(await screen.findByLabelText("วันที่อ้างอิง"), { target: { value: "2026-09-24" } });
    fireEvent.click(screen.getByRole("button", { name: "ลบ ซื้อพร็อพ" }));
    expect(screen.getByRole("button", { name: "ยืนยันลบ ซื้อพร็อพ" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "ยืนยันลบ ซื้อพร็อพ" }));

    await waitFor(() => expect((repository.read()).then((state) => state.actionTasks)).resolves.toEqual([]));
  });

  it("edits a content step from its Action Plan row", async () => {
    const repository = createRepository();
    render(<DashboardDataProvider repository={repository}><ActionPlanWorkspace /></DashboardDataProvider>);
    fireEvent.change(await screen.findByLabelText("วันที่อ้างอิง"), { target: { value: "2026-09-24" } });
    fireEvent.click(screen.getByRole("button", { name: "แก้ไข ตัดต่อ — ถ่ายคลิป" }));
    fireEvent.change(screen.getByRole("textbox", { name: "แก้ไขชื่อขั้นตอน ตัดต่อ — ถ่ายคลิป" }), { target: { value: "ตัดต่อเวอร์ชันใหม่" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกขั้นตอน ตัดต่อ — ถ่ายคลิป" }));

    await waitFor(() => expect((repository.read()).then((state) => state.contents[0].processSteps[0].name)).resolves.toBe("ตัดต่อเวอร์ชันใหม่"));
  });

  it("deletes a content step only after confirmation", async () => {
    const repository = createRepository();
    render(<DashboardDataProvider repository={repository}><ActionPlanWorkspace /></DashboardDataProvider>);
    fireEvent.change(await screen.findByLabelText("วันที่อ้างอิง"), { target: { value: "2026-09-24" } });
    fireEvent.click(screen.getByRole("button", { name: "ลบ ตัดต่อ — ถ่ายคลิป" }));
    fireEvent.click(screen.getByRole("button", { name: "ยืนยันลบ ตัดต่อ — ถ่ายคลิป" }));

    await waitFor(() => expect((repository.read()).then((state) => state.contents[0].processSteps)).resolves.toHaveLength(1));
  });

  it("shows a compact seven-day calendar and selects a day for its checklist", async () => {
    render(<DashboardDataProvider repository={createRepository()}><ActionPlanWorkspace /></DashboardDataProvider>);
    fireEvent.change(await screen.findByLabelText("วันที่อ้างอิง"), { target: { value: "2026-09-24" } });
    fireEvent.click(screen.getByRole("button", { name: "สัปดาห์" }));

    expect(screen.getByRole("grid", { name: "ปฏิทิน Action Plan" })).toBeVisible();
    expect(within(screen.getByRole("grid")).getAllByRole("button", { name: /เลือกวันที่/ })).toHaveLength(7);
    fireEvent.click(screen.getByRole("button", { name: "เลือกวันที่ 2026-09-24" }));
    expect(screen.getByRole("checkbox", { name: "ทำเสร็จ ตัดต่อ — ถ่ายคลิป" })).not.toBeChecked();
    expect(screen.getByText("ยังไม่กำหนดวัน")).toBeVisible();
  });

  it("checks a step, turns it green, persists it, and can undo the check", async () => {
    const repository = createRepository();
    render(<DashboardDataProvider repository={repository}><ActionPlanWorkspace /></DashboardDataProvider>);
    fireEvent.change(await screen.findByLabelText("วันที่อ้างอิง"), { target: { value: "2026-09-24" } });
    fireEvent.click(screen.getByRole("button", { name: "สัปดาห์" }));
    fireEvent.click(screen.getByRole("button", { name: "เลือกวันที่ 2026-09-24" }));

    const checkbox = screen.getByRole("checkbox", { name: "ทำเสร็จ ตัดต่อ — ถ่ายคลิป" });
    fireEvent.click(checkbox);
    await waitFor(() => expect(checkbox).toBeChecked());
    expect(checkbox.closest(".action-step-row")).toHaveClass("is-done");
    expect(screen.getByRole("button", { name: "เลือกวันที่ 2026-09-24" })).toHaveClass("has-done");
    expect((await repository.read()).contents[0].processSteps[0].status).toBe("done");

    fireEvent.click(checkbox);
    await waitFor(() => expect(checkbox).not.toBeChecked());
    expect((await repository.read()).contents[0].processSteps[0].status).toBe("todo");
  });

  it("shows a month grid and opens the selected day's checklist", async () => {
    render(<DashboardDataProvider repository={createRepository()}><ActionPlanWorkspace /></DashboardDataProvider>);
    fireEvent.change(await screen.findByLabelText("วันที่อ้างอิง"), { target: { value: "2026-09-24" } });
    fireEvent.click(screen.getByRole("button", { name: "เดือน" }));

    expect(within(screen.getByRole("grid")).getAllByRole("button", { name: /เลือกวันที่/ })).toHaveLength(30);
    fireEvent.click(screen.getByRole("button", { name: "เลือกวันที่ 2026-09-24" }));
    expect(screen.getByRole("checkbox", { name: "ทำเสร็จ ตัดต่อ — ถ่ายคลิป" })).toBeVisible();
  });
});
