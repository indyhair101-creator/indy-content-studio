import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HomePage } from "../app/home-page-view";
import { MemoryDashboardRepository } from "../features/data/memory-dashboard-repository";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import type { ContentItem } from "../features/domain/types";
import type { MediaBlobStore } from "../features/media/media-blob-store";
import { uploadMediaToBlob } from "../features/media/blob-media-upload";

vi.mock("../features/media/blob-media-upload", () => ({ uploadMediaToBlob: vi.fn() }));

class TestBlobStore implements MediaBlobStore {
  private readonly blobs = new Map<string, Blob>();
  async put(id: string, blob: Blob) { this.blobs.set(id, blob); }
  async get(id: string) { return this.blobs.get(id) ?? null; }
  async remove(id: string) { this.blobs.delete(id); }
}

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

function seededRepository() {
  const now = "2026-09-18T10:00:00.000Z";
  const content: ContentItem = { id: "reels", title: "ตัดต่อคลิป Reels เทคนิคทรงผม", categoryId: "category-knowledge", formatId: "format-video", owner: "ทีมคอนเทนต์", objective: "awareness", priority: "urgent", plannedWorkAt: "10:30", lastWorkedAt: now, readyDate: null, productionStatus: "editing", assetIds: [], processSteps: [], caption: "", captionSource: null, schedules: [], referenceIds: [], notes: "", localApproval: "pending", lineReview: { status: "not-sent", activeCycleId: null, reviewCode: null, providerReceipts: [], lastEventAt: null, history: [] }, createdAt: now, updatedAt: now, deletedAt: null };
  return new MemoryDashboardRepository({ ...createEmptyDashboardState(), contents: [content] });
}

describe("HomePage", () => {
  it("keeps Today as the only page heading and exposes the selected task continuation", async () => {
    render(<HomePage repository={seededRepository()} />);

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);

    fireEvent.click(await screen.findByRole("button", { name: /ตัดต่อคลิป Reels เทคนิคทรงผม/ }));

    expect(screen.getByRole("region", { name: "ทำงานต่อกับ ตัดต่อคลิป Reels เทคนิคทรงผม" })).toBeVisible();
    expect(screen.getByText("ขั้นตอนปัจจุบัน: ตัดต่อ")).toBeVisible();
    expect(screen.getByRole("button", { name: "ดำเนินงานต่อที่ขั้นตอน ตัดต่อ" })).toBeVisible();
  });

  it("creates planning work with a date only and without LINE media fields", async () => {
    const repository = new MemoryDashboardRepository();
    const { unmount } = render(<HomePage repository={repository} mediaBlobStore={new TestBlobStore()} />);

    fireEvent.click(screen.getByRole("button", { name: "สร้างชิ้นงานใหม่" }));
    expect(screen.queryByLabelText("ไฟล์แนบ")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("แคปชัน")).not.toBeInTheDocument();
    await screen.findByRole("option", { name: "colofill" });
    fireEvent.change(screen.getByLabelText("ชื่อชิ้นงาน"), { target: { value: "งานตามแผน" } });
    fireEvent.change(screen.getByLabelText("วันที่ลงในปฏิทิน"), { target: { value: "2026-09-23" } });
    fireEvent.change(screen.getByLabelText("ผู้รับผิดชอบ"), { target: { value: "colofill" } });
    fireEvent.click(screen.getByRole("button", { name: "สร้างงาน" }));

    await waitFor(async () => {
      const state = await repository.read();
      expect(state.contents[0]).toMatchObject({ title: "งานตามแผน", plannedWorkAt: "2026-09-23", caption: "", assetIds: [] });
      expect(state.contents[0].processSteps).toEqual([{ id: expect.any(String), name: "เตรียมงาน", scheduledDate: "2026-09-23", status: "todo", order: 0 }]);
    });
    expect(screen.queryByRole("dialog", { name: /รายละเอียดงาน/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ปฏิทินคอนเทนต์" }));
    fireEvent.change(await screen.findByLabelText("เดือนปฏิทิน"), { target: { value: "2026-09" } });
    const dayCell = await screen.findByLabelText("2026-09-23");
    expect(within(dayCell).getByText("งานตามแผน")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Action Plan" }));
    fireEvent.change(screen.getByLabelText("วันที่อ้างอิง"), { target: { value: "2026-09-23" } });
    expect(await screen.findByRole("checkbox", { name: "ทำเสร็จ เตรียมงาน — งานตามแผน" })).toBeVisible();
    unmount();
  });

  it("creates work with the categories and formats configured in Settings", async () => {
    const state = createEmptyDashboardState();
    state.categories.push({ id: "category-behind", name: "เบื้องหลัง", requiresApproval: false });
    state.formats.push({ id: "format-vertical", name: "คลิปแนวตั้ง", mediaKind: "video", allowedPlatforms: ["facebook", "instagram", "tiktok"] });
    const repository = new MemoryDashboardRepository(state);
    render(<HomePage repository={repository} />);

    fireEvent.click(screen.getByRole("button", { name: "สร้างชิ้นงานใหม่" }));
    fireEvent.change(await screen.findByLabelText("ชื่อชิ้นงาน"), { target: { value: "คลิปเบื้องหลัง" } });
    fireEvent.change(screen.getByLabelText("ประเภทคอนเทนต์"), { target: { value: "เบื้องหลัง" } });
    fireEvent.change(screen.getByLabelText("รูปแบบการนำเสนอ"), { target: { value: "คลิปแนวตั้ง" } });
    fireEvent.change(screen.getByLabelText("ผู้รับผิดชอบ"), { target: { value: "colofill" } });
    fireEvent.click(screen.getByRole("button", { name: "สร้างงาน" }));

    await waitFor(async () => expect((await repository.read()).contents[0]).toMatchObject({
      title: "คลิปเบื้องหลัง", categoryId: "category-behind", formatId: "format-vertical",
    }));
  });

  it.each([false, true])("saves and sends the saved LINE item, retaining delivery success if refresh fails: %s", async (refreshFails) => {
    const repository = new MemoryDashboardRepository();
    const read = vi.spyOn(repository, "read");
    const write = vi.spyOn(repository, "write");
    const blobStore = new TestBlobStore();
    vi.mocked(uploadMediaToBlob).mockResolvedValue({ remoteStatus: "ready", providerFileId: "blob:media/cover.jpg", previewProviderFileId: "blob:media/cover.jpg" });
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/line/pairing") return Response.json({ status: "connected", maskedRecipient: "••••cdef" });
      if (url === "/api/integrations/health") return Response.json({ integrations: [{ provider: "blob", status: "connected" }] });
      if (url === "/api/line/send") {
        if (refreshFails) read.mockRejectedValueOnce(new Error("refresh unavailable"));
        return Response.json({ delivery: { id: "delivery-created", status: "sent", sentAt: "2026-09-23T01:00:00.000Z", errorCategory: null } });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetcher);

    render(<HomePage repository={repository} mediaBlobStore={blobStore} />);
    await waitFor(() => expect(fetcher).toHaveBeenCalledWith("/api/line/pairing", { cache: "no-store" }));
    fireEvent.click(screen.getByRole("button", { name: "ส่งงานใน LINE" }));
    expect(await screen.findByRole("dialog", { name: "ส่งงานใน LINE" })).toBeVisible();
    fireEvent.change(screen.getByLabelText("แคปชัน"), { target: { value: "แคปชันสำหรับ LINE" } });
    fireEvent.change(screen.getByLabelText("วันที่ลง"), { target: { value: "2026-09-25" } });
    const file = new File(["image"], "cover.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText("ไฟล์รูปหรือคลิป"), { target: { files: [file] } });
    const uploadButton = await screen.findByRole("button", { name: "อัปโหลดไฟล์และตรวจสอบก่อนส่ง" });
    await waitFor(() => expect(uploadButton).toBeEnabled());
    fireEvent.click(uploadButton);

    const confirmation = await screen.findByRole("dialog", { name: "ยืนยันการส่งเข้า LINE OA" });
    expect(confirmation).toBeVisible();
    await waitFor(async () => {
      const state = await repository.read();
      expect(state.contents[0]).toMatchObject({ title: "ส่ง LINE · 2026-09-25", plannedWorkAt: "2026-09-25", caption: "แคปชันสำหรับ LINE", categoryId: "category-knowledge", formatId: "format-image", assetIds: [state.media[0].id] });
      expect(state.media[0]).toMatchObject({ remoteStatus: "ready", providerFileId: "blob:media/cover.jpg" });
    });
    expect(await blobStore.get((await repository.read()).media[0].id)).toBe(file);
    const expectedRevision = (await repository.read()).contents[0];
    const readsBeforeSend = read.mock.calls.length;
    const writesBeforeSend = write.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "ยืนยันส่ง" }));
    expect(await screen.findByText(/Delivery ID: delivery-created/)).toBeVisible();
    expect(read).toHaveBeenCalledTimes(readsBeforeSend + 1);
    expect(write).toHaveBeenCalledTimes(writesBeforeSend);
    expect(uploadMediaToBlob).toHaveBeenCalledWith(expect.objectContaining({ name: "cover.jpg", blob: file }));
    const saved = (await repository.read()).contents[0];
    expect(fetcher).toHaveBeenCalledWith("/api/line/send", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ contentId: saved.id, expectedUpdatedAt: expectedRevision.updatedAt }),
    }));
  });

  it("opens the working calendar workspace from the rail", async () => {
    render(<HomePage repository={new MemoryDashboardRepository()} />);

    fireEvent.click(screen.getByRole("button", { name: "ปฏิทินคอนเทนต์" }));

    expect(await screen.findByLabelText("เดือนปฏิทิน")).toBeVisible();
    expect(screen.getByRole("heading", { name: "ปฏิทินคอนเทนต์" })).toBeVisible();
    expect(screen.getByRole("button", { name: "ปฏิทินคอนเทนต์" })).toHaveAttribute("aria-current", "page");
  });

  it("does not offer the LINE upload action when Blob health reports disconnected", async () => {
    const repository = new MemoryDashboardRepository();
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/line/pairing") return Response.json({ status: "connected", maskedRecipient: "••••cdef" });
      if (url === "/api/integrations/health") return Response.json({ integrations: [{ provider: "blob", status: "disconnected", category: "configuration" }] });
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetcher);

    render(<HomePage repository={repository} />);
    fireEvent.click(screen.getByRole("button", { name: "ส่งงานใน LINE" }));

    expect(await screen.findByText(/Vercel Blob.*ยังไม่พร้อม/)).toBeVisible();
    expect(screen.getByRole("button", { name: "อัปโหลดไฟล์และตรวจสอบก่อนส่ง" })).toBeDisabled();
    expect((await repository.read()).media).toHaveLength(0);
    expect(fetcher).not.toHaveBeenCalledWith("/api/media/upload", expect.anything());
  });

  it("creates and saves a task from the calendar using the shared creation modal", async () => {
    const repository = new MemoryDashboardRepository();
    render(<HomePage repository={repository} />);

    fireEvent.click(screen.getByRole("button", { name: "ปฏิทินคอนเทนต์" }));
    fireEvent.click(await screen.findByRole("button", { name: "สร้างชิ้นงานใหม่" }));
    expect(await screen.findByRole("dialog", { name: "สร้างคอนเทนต์" })).toBeVisible();

    fireEvent.change(screen.getByLabelText("ชื่อชิ้นงาน"), { target: { value: "งานจากปฏิทิน" } });
    fireEvent.change(screen.getByLabelText("ผู้รับผิดชอบ"), { target: { value: "colofill" } });
    fireEvent.click(screen.getByRole("button", { name: "สร้างงาน" }));

    await waitFor(async () => expect((await repository.read()).contents.map((content) => content.title)).toContain("งานจากปฏิทิน"));
    expect(screen.queryByRole("dialog", { name: "สร้างคอนเทนต์" })).not.toBeInTheDocument();
  });

  it("keeps the generic LINE action separate from ordinary work creation", async () => {
    const repository = new MemoryDashboardRepository();
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/line/pairing") return Response.json({ status: "connected", maskedRecipient: "••••cdef" });
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetcher);

    render(<HomePage repository={repository} />);

    expect(screen.getByRole("button", { name: "สร้างชิ้นงานใหม่" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "ส่งงานใน LINE" }));

    expect(await screen.findByRole("dialog", { name: "ส่งงานใน LINE" })).toBeVisible();
    expect(screen.queryByLabelText("ชื่อชิ้นงาน")).not.toBeInTheDocument();
    expect(fetcher).not.toHaveBeenCalledWith("/api/line/send", expect.anything());
  });

  it("opens the generic LINE composer even when no task has been selected", async () => {
    render(<HomePage repository={new MemoryDashboardRepository()} />);

    fireEvent.click(screen.getByRole("button", { name: "ส่งงานใน LINE" }));

    expect(await screen.findByRole("dialog", { name: "ส่งงานใน LINE" })).toBeVisible();
  });

  it("shows the existing production board as its own workspace", () => {
    render(<HomePage repository={new MemoryDashboardRepository()} />);

    fireEvent.click(screen.getByRole("button", { name: "บอร์ดการผลิต" }));

    expect(screen.getByRole("heading", { name: "บอร์ดการผลิต" })).toBeVisible();
    expect(screen.queryByRole("heading", { level: 1, name: "วันนี้" })).not.toBeInTheDocument();
  });
});
