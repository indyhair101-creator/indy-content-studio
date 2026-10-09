import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardDataProvider } from "../features/data/DashboardDataProvider";
import { MemoryDashboardRepository } from "../features/data/memory-dashboard-repository";
import type { DashboardRepository } from "../features/data/dashboard-repository";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import type { DashboardState } from "../features/domain/types";
import { MediaLibraryWorkspace } from "../features/media/components/MediaLibraryWorkspace";
import { createUploadedMedia } from "../features/media/media-commands";
import type { MediaBlobStore } from "../features/media/media-blob-store";
import { createVideoPoster } from "../features/media/video-poster";

vi.mock("../features/media/video-poster", () => ({
  createVideoPoster: vi.fn(async () => new Blob(["poster"], { type: "image/jpeg" })),
}));

vi.mock("../features/media/blob-media-upload", () => ({
  uploadMediaToBlob: vi.fn(async ({ assetId, name, mimeType, blob }: { assetId: string; name: string; mimeType: string; blob: Blob }) => {
    const health = await fetch("/api/integrations/health", { cache: "no-store" });
    const payload = await health.json();
    if (!payload.integrations?.some((item: { provider: string; status: string }) => item.provider === "blob" && item.status === "connected")) {
      return { remoteStatus: "local-only" as const };
    }
    const file = new File([blob], name, { type: mimeType });
    const form = new FormData();
    form.set("assetId", assetId);
    form.set("file", file);
    if (mimeType.startsWith("video/") || /\.mp4$/i.test(name)) {
      const poster = await createVideoPoster(file);
      form.set("preview", new File([poster], `${name.replace(/\.[^.]+$/, "")}-poster.jpg`, { type: "image/jpeg" }));
    }
    const response = await fetch("/api/media/upload", { method: "POST", body: form });
    if (response.status === 503) return { remoteStatus: "local-only" as const };
    if (!response.ok) throw new Error("provider-upload-failed");
    return await response.json();
  }),
}));

class TestBlobStore implements MediaBlobStore {
  private readonly blobs = new Map<string, Blob>();
  async put(id: string, blob: Blob) { this.blobs.set(id, blob); }
  async get(id: string) { return this.blobs.get(id) ?? null; }
  async remove(id: string) { this.blobs.delete(id); }
}

function integrationHealth(status: "connected" | "disconnected" = "connected") {
  return Response.json({ integrations: [{ provider: "blob", status, checkedAt: "2026-09-18T00:00:00.000Z", message: status === "connected" ? "เชื่อมต่อแล้ว" : "ยังไม่ได้เชื่อมต่อ" }] });
}

function renderLibrary(
  initialState: DashboardState = createEmptyDashboardState(),
  repository: DashboardRepository = new MemoryDashboardRepository(initialState),
  blobStore = new TestBlobStore(),
) {
  return {
    ...render(<DashboardDataProvider repository={repository}><MediaLibraryWorkspace blobStore={blobStore} /></DashboardDataProvider>),
    blobStore,
    repository,
  };
}

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("MediaLibraryWorkspace", () => {
  it("uploads media, moves it to trash, and restores it", async () => {
    renderLibrary();
    const file = new File(["image"], "ผลงาน.jpg", { type: "image/jpeg" });
    fireEvent.change(await screen.findByLabelText("เลือกไฟล์สื่อ"), { target: { files: [file] } });
    expect(await screen.findByText("ผลงาน.jpg")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "ย้าย ผลงาน.jpg ไปถังขยะ" }));
    fireEvent.click(screen.getByRole("tab", { name: "ถังขยะ" }));
    expect(await screen.findByText("ผลงาน.jpg")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "กู้คืน ผลงาน.jpg" }));
    fireEvent.click(screen.getByRole("tab", { name: "ทั้งหมด" }));
    expect(await screen.findByText("ผลงาน.jpg")).toBeVisible();
  });

  it("adds an external https link and rejects unsafe links", async () => {
    renderLibrary();
    fireEvent.click(await screen.findByRole("button", { name: "เพิ่มลิงก์ภายนอก" }));
    fireEvent.change(screen.getByLabelText("ชื่อสื่อภายนอก"), { target: { value: "คลิปอ้างอิง" } });
    fireEvent.change(screen.getByLabelText("ลิงก์สื่อ"), { target: { value: "https://example.com/video.mp4" } });
    fireEvent.change(screen.getByLabelText("ลิงก์ภาพตัวอย่าง"), { target: { value: "https://example.com/poster.jpg" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกลิงก์" }));
    expect(await screen.findByText("คลิปอ้างอิง")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "เพิ่มลิงก์ภายนอก" }));
    fireEvent.change(screen.getByLabelText("ชื่อสื่อภายนอก"), { target: { value: "ไม่ปลอดภัย" } });
    fireEvent.change(screen.getByLabelText("ลิงก์สื่อ"), { target: { value: "http://unsafe.test/video.mp4" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกลิงก์" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("ต้องเป็นลิงก์ https");
  });

  it("keeps a video local-only without decoding it when the health preflight says Drive is disconnected", async () => {
    const fetcher = vi.fn().mockResolvedValue(integrationHealth("disconnected"));
    vi.stubGlobal("fetch", fetcher);
    const { blobStore, repository } = renderLibrary();
    const file = new File(["video"], "เก็บในเครื่อง.MP4", { type: "" });

    fireEvent.change(await screen.findByLabelText("เลือกไฟล์สื่อ"), { target: { files: [file] } });

    expect(await screen.findByText("เก็บไว้ในเครื่องนี้เท่านั้น")).toBeVisible();
    const [asset] = (await repository.read()).media;
    expect(asset.remoteStatus).toBe("local-only");
    expect(await blobStore.get(asset.id)).toBe(file);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith("/api/integrations/health", { cache: "no-store" });
    expect(createVideoPoster).not.toHaveBeenCalled();
  });

  it("stores provider identifiers only after Drive confirms the upload", async () => {
    const state = createEmptyDashboardState();
    state.integrations.find(({ provider }) => provider === "google-drive")!.status = "connected";
    let resolveUpload!: (response: Response) => void;
    const fetcher = vi.fn()
      .mockResolvedValueOnce(integrationHealth())
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveUpload = resolve; }));
    vi.stubGlobal("fetch", fetcher);
    const { repository } = renderLibrary(state);

    fireEvent.change(await screen.findByLabelText("เลือกไฟล์สื่อ"), { target: { files: [new File(["image"], "พร้อมส่ง.jpg", { type: "image/jpeg" })] } });

    expect(await screen.findByText("กำลังอัปโหลดไป Vercel Blob…")).toBeVisible();
    expect(screen.queryByText("พร้อมใช้ผ่าน Vercel Blob")).not.toBeInTheDocument();
    await waitFor(() => expect(fetcher).toHaveBeenCalledWith("/api/media/upload", expect.objectContaining({ method: "POST" })));
    const uploadingAsset = (await repository.read()).media[0];
    expect(uploadingAsset).toMatchObject({ remoteStatus: "uploading", providerFileId: null, previewProviderFileId: null });

    resolveUpload(Response.json({
      assetId: uploadingAsset.id,
      providerFileId: "drive-original",
      previewProviderFileId: "drive-preview",
      remoteStatus: "ready",
    }));

    expect(await screen.findByText("พร้อมใช้ผ่าน Vercel Blob")).toBeVisible();
    expect((await repository.read()).media[0]).toMatchObject({
      remoteStatus: "ready",
      providerFileId: "drive-original",
      previewProviderFileId: "drive-preview",
    });
  });

  it("returns to local-only when the server says Drive is disconnected", async () => {
    const state = createEmptyDashboardState();
    state.integrations.find(({ provider }) => provider === "google-drive")!.status = "connected";
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(integrationHealth())
      .mockResolvedValueOnce(Response.json(
        { error: "ยังไม่ได้เชื่อมต่อ Google Drive" },
        { status: 503 },
      )));
    const { blobStore, repository } = renderLibrary(state);

    fireEvent.change(await screen.findByLabelText("เลือกไฟล์สื่อ"), { target: { files: [new File(["image"], "ยังอยู่ในเครื่อง.jpg", { type: "image/jpeg" })] } });

    expect(await screen.findByText("เก็บไว้ในเครื่องนี้เท่านั้น")).toBeVisible();
    const [asset] = (await repository.read()).media;
    expect(asset).toMatchObject({ remoteStatus: "local-only", providerFileId: null, previewProviderFileId: null });
    expect(await blobStore.get(asset.id)).not.toBeNull();
    expect(screen.getByRole("button", { name: `ลองอัปโหลด ${asset.name} อีกครั้ง` })).toBeVisible();
  });

  it("can retry a local-only upload after Google Drive becomes available", async () => {
    const now = "2026-09-18T00:00:00.000Z";
    const state = createUploadedMedia(createEmptyDashboardState(), { id: "asset-local", name: "พร้อมอัปโหลด.jpg", mimeType: "image/jpeg", size: 5, now });
    const fetcher = vi.fn()
      .mockResolvedValueOnce(integrationHealth())
      .mockResolvedValueOnce(Response.json({ assetId: "asset-local", providerFileId: "drive-ready", previewProviderFileId: "drive-ready", remoteStatus: "ready" }));
    vi.stubGlobal("fetch", fetcher);
    const blobStore = new TestBlobStore();
    await blobStore.put("asset-local", new File(["image"], "พร้อมอัปโหลด.jpg", { type: "image/jpeg" }));
    const { repository } = renderLibrary(state, new MemoryDashboardRepository(state), blobStore);

    fireEvent.click(await screen.findByRole("button", { name: "ลองอัปโหลด พร้อมอัปโหลด.jpg อีกครั้ง" }));

    expect(await screen.findByText("พร้อมใช้ผ่าน Vercel Blob")).toBeVisible();
    expect((await repository.read()).media[0]).toMatchObject({ remoteStatus: "ready", providerFileId: "drive-ready" });
  });

  it("retains a failed local upload and retries without claiming provider success", async () => {
    const state = createEmptyDashboardState();
    state.integrations.find(({ provider }) => provider === "google-drive")!.status = "connected";
    const fetcher = vi.fn()
      .mockResolvedValueOnce(integrationHealth())
      .mockResolvedValueOnce(Response.json({ error: "อัปโหลดไป Vercel Blob ไม่สำเร็จ" }, { status: 502 }));
    vi.stubGlobal("fetch", fetcher);
    const { blobStore, repository } = renderLibrary(state);

    fireEvent.change(await screen.findByLabelText("เลือกไฟล์สื่อ"), { target: { files: [new File(["image"], "ลองใหม่.jpg", { type: "image/jpeg" })] } });

    expect(await screen.findByText("อัปโหลดไป Vercel Blob ไม่สำเร็จ")).toBeVisible();
    const failedAsset = (await repository.read()).media[0];
    expect(failedAsset.remoteStatus).toBe("failed");
    expect(await blobStore.get(failedAsset.id)).not.toBeNull();
    expect(screen.queryByText(/ส่งแล้ว|เผยแพร่แล้ว/)).not.toBeInTheDocument();

    fetcher.mockResolvedValueOnce(integrationHealth());
    fetcher.mockResolvedValueOnce(Response.json({
      assetId: failedAsset.id,
      providerFileId: "drive-retry-original",
      previewProviderFileId: "drive-retry-preview",
      remoteStatus: "ready",
    }));
    fireEvent.click(screen.getByRole("button", { name: `ลองอัปโหลด ${failedAsset.name} อีกครั้ง` }));

    expect(await screen.findByText("พร้อมใช้ผ่าน Vercel Blob")).toBeVisible();
    expect((await repository.read()).media[0]).toMatchObject({ remoteStatus: "ready", providerFileId: "drive-retry-original" });
  });

  it("retries an upload that was persisted as uploading", async () => {
    const now = "2026-09-18T00:00:00.000Z";
    const state = createUploadedMedia(createEmptyDashboardState(), { id: "asset-stuck", name: "ค้าง.jpg", mimeType: "image/jpeg", size: 5, now });
    state.media[0].remoteStatus = "uploading";
    const fetcher = vi.fn()
      .mockResolvedValueOnce(integrationHealth())
      .mockResolvedValueOnce(Response.json({ assetId: "asset-stuck", providerFileId: "drive-stuck", previewProviderFileId: "drive-stuck", remoteStatus: "ready" }));
    vi.stubGlobal("fetch", fetcher);
    const { blobStore, repository } = renderLibrary(state);
    await blobStore.put("asset-stuck", new File(["image"], "ค้าง.jpg", { type: "image/jpeg" }));

    fireEvent.click(await screen.findByRole("button", { name: "ลองอัปโหลด ค้าง.jpg อีกครั้ง" }));

    expect(await screen.findByText("พร้อมใช้ผ่าน Vercel Blob")).toBeVisible();
    expect((await repository.read()).media[0]).toMatchObject({ remoteStatus: "ready", providerFileId: "drive-stuck" });
  });

  it("prevents overlapping retries while a live upload attempt is pending", async () => {
    const now = "2026-09-18T00:00:00.000Z";
    const state = createUploadedMedia(createEmptyDashboardState(), { id: "asset-race", name: "ห้ามซ้อน.jpg", mimeType: "image/jpeg", size: 5, now });
    state.media[0].remoteStatus = "uploading";
    let resolveHealth!: (response: Response) => void;
    const fetcher = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveHealth = resolve; }))
      .mockResolvedValueOnce(Response.json({ assetId: "asset-race", providerFileId: "drive-race", previewProviderFileId: "drive-race", remoteStatus: "ready" }));
    vi.stubGlobal("fetch", fetcher);
    const { blobStore, repository } = renderLibrary(state);
    await blobStore.put("asset-race", new File(["image"], "ห้ามซ้อน.jpg", { type: "image/jpeg" }));
    const retry = await screen.findByRole("button", { name: "ลองอัปโหลด ห้ามซ้อน.jpg อีกครั้ง" });

    fireEvent.click(retry);
    fireEvent.click(retry);

    await waitFor(() => expect(screen.queryByRole("button", { name: "ลองอัปโหลด ห้ามซ้อน.jpg อีกครั้ง" })).not.toBeInTheDocument());
    expect(fetcher).toHaveBeenCalledTimes(1);
    resolveHealth(integrationHealth());

    expect(await screen.findByText("พร้อมใช้ผ่าน Vercel Blob")).toBeVisible();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect((await repository.read()).media[0]).toMatchObject({ remoteStatus: "ready", providerFileId: "drive-race" });
  });

  it("keeps an in-flight attempt locked across a media workspace remount", async () => {
    const now = "2026-09-18T00:00:00.000Z";
    const state = createUploadedMedia(createEmptyDashboardState(), { id: "asset-remount", name: "ข้ามหน้า.jpg", mimeType: "image/jpeg", size: 5, now });
    state.media[0].remoteStatus = "uploading";
    const repository = new MemoryDashboardRepository(state);
    const blobStore = new TestBlobStore();
    await blobStore.put("asset-remount", new File(["image"], "ข้ามหน้า.jpg", { type: "image/jpeg" }));
    let resolveUpload!: (response: Response) => void;
    const fetcher = vi.fn()
      .mockResolvedValueOnce(integrationHealth())
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveUpload = resolve; }));
    vi.stubGlobal("fetch", fetcher);
    const firstView = renderLibrary(state, repository, blobStore);

    fireEvent.click(await screen.findByRole("button", { name: "ลองอัปโหลด ข้ามหน้า.jpg อีกครั้ง" }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    firstView.unmount();
    renderLibrary(await repository.read(), repository, blobStore);

    expect(await screen.findByText("กำลังอัปโหลดไป Vercel Blob…")).toBeVisible();
    expect(screen.queryByRole("button", { name: "ลองอัปโหลด ข้ามหน้า.jpg อีกครั้ง" })).not.toBeInTheDocument();
    resolveUpload(Response.json({ error: "อัปโหลดไป Vercel Blob ไม่สำเร็จ" }, { status: 502 }));

    expect(await screen.findByRole("button", { name: "ลองอัปโหลด ข้ามหน้า.jpg อีกครั้ง" })).toBeVisible();
    fetcher.mockResolvedValueOnce(integrationHealth());
    fetcher.mockResolvedValueOnce(Response.json({ assetId: "asset-remount", providerFileId: "drive-remount", previewProviderFileId: "drive-remount", remoteStatus: "ready" }));
    fireEvent.click(screen.getByRole("button", { name: "ลองอัปโหลด ข้ามหน้า.jpg อีกครั้ง" }));
    expect(await screen.findByText("พร้อมใช้ผ่าน Vercel Blob")).toBeVisible();
  });

  it("keeps the local blob when a provider-state write fails after metadata was committed", async () => {
    class FailingProviderStateRepository extends MemoryDashboardRepository {
      private writes = 0;
      override async write(next: DashboardState) {
        this.writes += 1;
        if (this.writes === 2) throw new Error("provider state write failed");
        await super.write(next);
      }
    }
    const initialState = createEmptyDashboardState();
    const repository = new FailingProviderStateRepository(initialState);
    const { blobStore } = renderLibrary(initialState, repository);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(integrationHealth()));

    fireEvent.change(await screen.findByLabelText("เลือกไฟล์สื่อ"), { target: { files: [new File(["image"], "ยังต้องอยู่.jpg", { type: "image/jpeg" })] } });

    expect(await screen.findByRole("alert")).toHaveTextContent("อัปโหลดไป Vercel Blob ไม่สำเร็จ");
    const [asset] = (await repository.read()).media;
    expect(asset.name).toBe("ยังต้องอยู่.jpg");
    expect(await blobStore.get(asset.id)).not.toBeNull();
  });

  it("creates a JPEG preview for a video extension even when MIME is blank", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(integrationHealth())
      .mockImplementationOnce(async (_url: string, init?: RequestInit) => {
        const form = init?.body as FormData;
        const assetId = String(form.get("assetId"));
        const preview = form.get("preview") as File;
        expect(preview.name).toBe("ตัวอย่าง-poster.jpg");
        expect(preview.type).toBe("image/jpeg");
        return Response.json({ assetId, providerFileId: "drive-video", previewProviderFileId: "drive-poster", remoteStatus: "ready" });
      });
    vi.stubGlobal("fetch", fetcher);
    renderLibrary();

    fireEvent.change(await screen.findByLabelText("เลือกไฟล์สื่อ"), { target: { files: [new File(["video"], "ตัวอย่าง.MP4", { type: "" })] } });

    expect(await screen.findByText("พร้อมใช้ผ่าน Vercel Blob")).toBeVisible();
    expect(createVideoPoster).toHaveBeenCalledOnce();
  });
});
