import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContentEditorDialog } from "../features/content/components/ContentEditorDialog";
import { DashboardDataProvider } from "../features/data/DashboardDataProvider";
import { MemoryDashboardRepository } from "../features/data/memory-dashboard-repository";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import type { ContentItem } from "../features/domain/types";

const source: ContentItem = {
  id: "content-original", title: "คอนเทนต์เดิม", categoryId: "category-knowledge", formatId: "format-video",
  owner: "ทีม", objective: "awareness", priority: "normal", plannedWorkAt: "2026-09-24", lastWorkedAt: null,
  readyDate: "2026-09-25", productionStatus: "waiting-shoot", assetIds: [], processSteps: [{ id: "step-1", name: "ตัดต่อ", scheduledDate: null, status: "todo", order: 0 }], caption: "แคปชันเดิม",
  captionSource: null, schedules: [], referenceIds: [], notes: "โน้ตเดิม", localApproval: "pending",
  lineReview: { status: "not-sent", activeCycleId: null, reviewCode: null, providerReceipts: [], lastEventAt: null, history: [] },
  createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", deletedAt: null,
};
afterEach(() => vi.unstubAllGlobals());

function renderEditor() {
  const state = createEmptyDashboardState();
  state.contents.push(source);
  const repository = new MemoryDashboardRepository(state);
  const view = render(<DashboardDataProvider repository={repository}><ContentEditorDialog mode="edit" contentId={source.id} open onClose={() => undefined} /></DashboardDataProvider>);
  return { repository, ...view };
}

describe("full content editor", () => {
  it("sends a saved approved clip directly once and does not create phantom local queue rows", async () => {
    const state = createEmptyDashboardState();
    state.contents.push({ ...source, productionStatus: "ready", localApproval: "approved", processSteps: [], assetIds: ["video"], schedules: [{ platform: "facebook", enabled: true, publishAt: "2099-10-01T10:00:00+07:00", latestAttemptId: null, manualEvidence: null }] });
    state.media.push({ id: "video", name: "clip.mp4", mimeType: "video/mp4", size: 10, source: "external", externalUrl: "https://example.test/video.mp4", externalPreviewUrl: null, blobKey: null, remoteStatus: "ready", providerFileId: null, previewProviderFileId: null, tags: [], createdAt: source.createdAt, updatedAt: source.updatedAt, deletedAt: null });
    const repository = new MemoryDashboardRepository(state);
    const submitted: unknown[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => { submitted.push(JSON.parse(String(init.body))); return Response.json({ status: "queued", queueId: "approved-job" }); });
    render(<DashboardDataProvider repository={repository}><ContentEditorDialog mode="edit" contentId={source.id} open onClose={() => undefined} /></DashboardDataProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Final · ส่งไป Make" }));
    expect(await screen.findByRole("status")).toHaveTextContent("ส่ง 1 ช่องทางเข้า Make แล้ว");
    expect(submitted).toEqual([{ contentId: source.id }]);
    expect((await repository.read()).publicationAttempts).toEqual([]);
  });
  it("does not expose the dashboard approval checkbox or change approval when saving", async () => {
    const state = createEmptyDashboardState();
    state.contents.push({ ...source, productionStatus: "ready", processSteps: [] });
    const repository = new MemoryDashboardRepository(state);
    render(<DashboardDataProvider repository={repository}><ContentEditorDialog mode="edit" contentId={source.id} open onClose={() => undefined} /></DashboardDataProvider>);
    expect(await screen.findByLabelText("ชื่อคอนเทนต์")).toBeInTheDocument();
    expect(screen.queryByLabelText("อนุมัติคลิปและแคปชันใน dashboard")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "บันทึกคอนเทนต์" }));
    await waitFor(async () => expect((await repository.read()).contents[0].localApproval).toBe("pending"));
    expect((await repository.read()).contents[0].lineReview.status).toBe("not-sent");
  });
  it("offers Make submission for locally approved Final content without a LINE review", async () => {
    const state = createEmptyDashboardState();
    state.contents.push({ ...source, productionStatus: "ready", localApproval: "approved", processSteps: [] });
    render(<DashboardDataProvider repository={new MemoryDashboardRepository(state)}><ContentEditorDialog mode="edit" contentId={source.id} open onClose={() => undefined} /></DashboardDataProvider>);
    expect(await screen.findByRole("button", { name: "Final · ส่งไป Make" })).toBeEnabled();
  });
  it("uses a date per production step, hides the standalone ready date, and keeps repeat-copy controls out of the editor", async () => {
    const { repository } = renderEditor();
    expect(screen.queryByLabelText("วันที่พร้อมผลิต")).not.toBeInTheDocument();
    fireEvent.change(await screen.findByLabelText("วันที่ขั้นตอน 1"), { target: { value: "2026-09-26" } });
    expect(screen.queryByRole("group", { name: "สำเนางานตามรอบเวลา" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("จำนวนสำเนา")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "บันทึกคอนเทนต์" }));

    await waitFor(async () => expect((await repository.read()).contents[0].processSteps[0].scheduledDate).toBe("2026-09-26"));
  });

  it("hides work history until its disclosure is opened", async () => {
    renderEditor();
    const historyDisclosure = await screen.findByText("ประวัติการทำงาน");

    expect(historyDisclosure.closest("details")).not.toHaveAttribute("open");

    fireEvent.click(historyDisclosure);

    expect(historyDisclosure.closest("details")).toHaveAttribute("open");
    expect(screen.getByText("LINE review:")).toBeVisible();
  });

  it("keeps the close button outside the scrollable editor while retaining its close action", async () => {
    const onClose = vi.fn();
    render(<DashboardDataProvider repository={new MemoryDashboardRepository(createEmptyDashboardState())}><ContentEditorDialog mode="create" open onClose={onClose} /></DashboardDataProvider>);

    const dialog = await screen.findByRole("dialog", { name: "สร้างคอนเทนต์" });
    const closeButton = screen.getByRole("button", { name: "ปิดตัวแก้ไข" });

    const scrollableEditor = dialog.querySelector(".content-editor-dialog") ?? dialog;
    expect(scrollableEditor).not.toContainElement(closeButton);
    fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("edits the task name, production status, and calendar date", async () => {
    const { repository } = renderEditor();
    fireEvent.change(await screen.findByLabelText("ชื่อคอนเทนต์"), { target: { value: "ชื่อใหม่" } });
    fireEvent.change(screen.getByLabelText("สถานะการผลิต"), { target: { value: "editing" } });
    fireEvent.change(screen.getByLabelText("วันที่ลงในปฏิทิน"), { target: { value: "2026-09-28" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกคอนเทนต์" }));

    await waitFor(async () => expect((await repository.read()).contents[0]).toMatchObject({ title: "ชื่อใหม่", productionStatus: "editing", plannedWorkAt: "2026-09-28" }));
  });

  it("edits an independent platform schedule", async () => {
    const { repository } = renderEditor();
    fireEvent.click(await screen.findByLabelText("เปิด Facebook"));
    fireEvent.change(screen.getByLabelText("วันลง Facebook"), { target: { value: "2026-09-28" } });
    fireEvent.change(screen.getByLabelText("เวลาลง Facebook"), { target: { value: "09:30" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกคอนเทนต์" }));

    await waitFor(async () => expect((await repository.read()).contents[0].schedules).toEqual(expect.arrayContaining([
      expect.objectContaining({ platform: "facebook", enabled: true, publishAt: "2026-09-28T09:30:00+07:00" }),
    ])));
  });

  it("does not show the old copy and paste task buttons", async () => {
    const { repository } = renderEditor();
    expect(await screen.findByLabelText("ชื่อคอนเทนต์")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "คัดลอกงาน" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "วางเป็นงานใหม่" })).not.toBeInTheDocument();
    expect((await repository.read()).contents).toHaveLength(1);
  });

  it("moves the task to recoverable trash only after confirmation", async () => {
    const { repository } = renderEditor();
    fireEvent.click(await screen.findByRole("button", { name: "ลบงาน" }));
    expect(screen.getByRole("button", { name: "ยืนยันลบงาน" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "ยืนยันลบงาน" }));

    await waitFor(async () => expect((await repository.read()).contents[0].deletedAt).toEqual(expect.any(String)));
  });
});
