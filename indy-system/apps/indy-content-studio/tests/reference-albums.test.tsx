import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DashboardDataProvider } from "../features/data/DashboardDataProvider";
import { MemoryDashboardRepository } from "../features/data/memory-dashboard-repository";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import { createUploadedMedia } from "../features/media/media-commands";
import { ReferencesWorkspace } from "../features/references/components/ReferencesWorkspace";
import { prepareReferenceFile } from "../features/references/reference-upload";
import { ContentCalendarWorkspace } from "../features/calendar/components/ContentCalendarWorkspace";

vi.mock("../features/references/reference-upload", async (original) => {
  const actual = await original<typeof import("../features/references/reference-upload")>();
  return { ...actual, prepareReferenceFile: vi.fn() };
});
const blobStore = { put: vi.fn(), get: vi.fn(async () => null), remove: vi.fn() };

describe("Reference albums", () => {
  it("creates a named album, stores a link-free reference, collapses and opens it again", async () => {
    const repository = new MemoryDashboardRepository();
    render(<DashboardDataProvider repository={repository}><ReferencesWorkspace blobStore={blobStore} /></DashboardDataProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "สร้างอัลบั้ม" }));
    fireEvent.change(screen.getByLabelText("ชื่ออัลบั้ม"), { target: { value: "Poster ตารางเรียน" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกอัลบั้ม" }));
    fireEvent.click(await screen.findByRole("button", { name: "เพิ่ม Reference ใน Poster ตารางเรียน" }));
    fireEvent.change(screen.getByLabelText("ชื่อไอเดีย"), { target: { value: "สีและการจัดวาง" } });
    fireEvent.click(screen.getByLabelText("ใส่ลิงก์อ้างอิง"));
    expect(screen.queryByLabelText("ลิงก์ HTTPS")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "บันทึก Reference" }));
    expect(await screen.findByText("สีและการจัดวาง")).toBeVisible();
    const saved = await repository.read();
    expect(saved.references[0]).toMatchObject({ url: "", albumId: saved.referenceAlbums![0].id });
    expect(screen.queryByRole("link", { name: /เปิดแหล่งอ้างอิง/ })).not.toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: /Poster ตารางเรียน.*ซ่อน/ });
    fireEvent.click(toggle);
    expect(screen.queryByText("สีและการจัดวาง")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Poster ตารางเรียน.*เปิดอัลบั้ม/ }));
    expect(screen.getByText("สีและการจัดวาง")).toBeVisible();
  });

  it("saves multiple image/video attachments with the reference in one mutation", async () => {
    const repository = new MemoryDashboardRepository();
    let count = 0;
    vi.mocked(prepareReferenceFile).mockImplementation(async (file) => createUploadedMedia(createEmptyDashboardState(), { id: `file-${++count}`, name: file.name, mimeType: file.type, size: file.size, now: "now" }).media[0]);
    render(<DashboardDataProvider repository={repository}><ReferencesWorkspace blobStore={blobStore} /></DashboardDataProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "เพิ่ม Reference" }));
    const files = [new File(["image"], "poster.png", { type: "image/png" }), new File(["video"], "clip.mp4", { type: "video/mp4" })];
    fireEvent.change(screen.getByLabelText("เลือกภาพหรือวิดีโอ Reference"), { target: { files } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึก Reference" }));
    expect(await screen.findByRole("button", { name: "ดูภาพ poster.png" })).toBeVisible();
    expect(screen.getByRole("button", { name: "ดูวิดีโอ clip.mp4" })).toBeVisible();
    const saved = await repository.read();
    expect(saved.media).toHaveLength(2);
    expect(saved.references[0]).toMatchObject({ title: "poster", url: "", assetIds: ["file-1", "file-2"] });
    expect(screen.getByText(/เก็บในเครื่องนี้เท่านั้น/)).toBeVisible();
  });

  it("keeps the dialog and prior data when upload fails", async () => {
    vi.mocked(prepareReferenceFile).mockRejectedValueOnce(new Error("อัปโหลดไม่สำเร็จ"));
    const repository = new MemoryDashboardRepository();
    render(<DashboardDataProvider repository={repository}><ReferencesWorkspace blobStore={blobStore} /></DashboardDataProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "เพิ่ม Reference" }));
    fireEvent.change(screen.getByLabelText("เลือกภาพหรือวิดีโอ Reference"), { target: { files: [new File(["image"], "poster.png", { type: "image/png" })] } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึก Reference" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("อัปโหลดไม่สำเร็จ");
    expect(screen.getByRole("dialog", { name: "เพิ่ม Reference" })).toBeVisible();
    expect((await repository.read()).references).toHaveLength(0);
    expect((await repository.read()).media).toHaveLength(0);
  });

  it("shows the weekday for dates including dates outside the selected month", async () => {
    render(<DashboardDataProvider repository={new MemoryDashboardRepository()}><ContentCalendarWorkspace onCreateTask={() => undefined} /></DashboardDataProvider>);
    fireEvent.change(await screen.findByLabelText("เดือนปฏิทิน"), { target: { value: "2026-10" } });
    await waitFor(() => expect(screen.getAllByRole("columnheader")).toHaveLength(7));
    expect(within(screen.getByRole("gridcell", { name: "2026-10-12" })).getByText("จันทร์")).toBeVisible();
    expect(within(screen.getByRole("gridcell", { name: "2026-09-27" })).getByText("อาทิตย์")).toBeVisible();
  });
});
