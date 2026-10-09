import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LineSendComposer } from "../features/dashboard/components/LineSendComposer";

describe("LineSendComposer", () => {
  it.each([52_428_801, 1_073_741_824])("accepts a video of %i bytes for uploading", async (size) => {
    const file = new File(["video"], "large.mp4", { type: "video/mp4" });
    Object.defineProperty(file, "size", { value: size });
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<LineSendComposer open authenticatedAdmin connectedRecipient recipientMasked="••••cdef" storageStatus="ready" onCancel={vi.fn()} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText("ไฟล์รูปหรือคลิป"), { target: { files: [file] } });
    fireEvent.change(screen.getByLabelText("แคปชัน"), { target: { value: "คลิปใหญ่" } });
    fireEvent.change(screen.getByLabelText("วันที่ลง"), { target: { value: "2026-10-03" } });
    fireEvent.click(screen.getByRole("button", { name: "อัปโหลดไฟล์และตรวจสอบก่อนส่ง" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ file })));
  });

  it("rejects files over 1 GB without submitting", () => {
    const file = new File(["video"], "too-large.mp4", { type: "video/mp4" });
    Object.defineProperty(file, "size", { value: 1_073_741_825 });
    const onSubmit = vi.fn();
    render(<LineSendComposer open authenticatedAdmin connectedRecipient recipientMasked="••••cdef" storageStatus="ready" onCancel={vi.fn()} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText("ไฟล์รูปหรือคลิป"), { target: { files: [file] } });
    fireEvent.change(screen.getByLabelText("แคปชัน"), { target: { value: "คลิปใหญ่" } });
    fireEvent.change(screen.getByLabelText("วันที่ลง"), { target: { value: "2026-10-03" } });
    fireEvent.click(screen.getByRole("button", { name: "อัปโหลดไฟล์และตรวจสอบก่อนส่ง" }));
    expect(screen.getByRole("alert")).toHaveTextContent("ไฟล์มีขนาดเกิน 1 GB");
    expect(onSubmit).not.toHaveBeenCalled();
  });
  it("shows exactly media, caption, and date inputs without task-specific fields", () => {
    render(<LineSendComposer open authenticatedAdmin connectedRecipient recipientMasked="••••cdef" storageStatus="ready" onCancel={vi.fn()} onSubmit={vi.fn()} />);

    const dialog = screen.getByRole("dialog", { name: "ส่งงานใน LINE" });
    expect(dialog).toBeVisible();
    expect(within(dialog).getByLabelText("ไฟล์รูปหรือคลิป")).toHaveAttribute("type", "file");
    expect(within(dialog).getByLabelText("แคปชัน")).toBeVisible();
    expect(within(dialog).getByLabelText("วันที่ลง")).toHaveAttribute("type", "date");
    expect(dialog.querySelectorAll('input[type="file"], textarea, input[type="date"]')).toHaveLength(3);
    expect(within(dialog).queryByLabelText("ชื่อชิ้นงาน")).not.toBeInTheDocument();
  });

  it("requires one supported file, caption, and date before invoking submit", () => {
    const onSubmit = vi.fn();
    render(<LineSendComposer open authenticatedAdmin connectedRecipient recipientMasked="••••cdef" storageStatus="ready" onCancel={vi.fn()} onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole("button", { name: "อัปโหลดไฟล์และตรวจสอบก่อนส่ง" }));

    expect(screen.getByText("เลือกไฟล์รูปหรือคลิปก่อนส่ง")).toBeVisible();
    expect(screen.getByText("กรอกแคปชันก่อนส่ง")).toBeVisible();
    expect(screen.getByText("เลือกวันที่ลงก่อนส่ง")).toBeVisible();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("passes the trimmed caption and date-only value to the submit handler", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const file = new File(["image"], "photo.jpg", { type: "image/jpeg" });
    render(<LineSendComposer open authenticatedAdmin connectedRecipient recipientMasked="••••cdef" storageStatus="ready" onCancel={vi.fn()} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText("ไฟล์รูปหรือคลิป"), { target: { files: [file] } });
    fireEvent.change(screen.getByLabelText("แคปชัน"), { target: { value: "  สวัสดีค่ะ  " } });
    fireEvent.change(screen.getByLabelText("วันที่ลง"), { target: { value: "2026-09-25" } });
    fireEvent.click(screen.getByRole("button", { name: "อัปโหลดไฟล์และตรวจสอบก่อนส่ง" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ file, caption: "สวัสดีค่ะ", plannedDate: "2026-09-25", categoryId: "", formatId: "" }));
  });

  it("uses configurable categories and chooses a media-compatible format by default", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const file = new File(["image"], "photo.jpg", { type: "image/jpeg" });
    render(<LineSendComposer open authenticatedAdmin connectedRecipient recipientMasked="••••cdef" storageStatus="ready" categories={[{ id: "category-behind", name: "เบื้องหลัง", requiresApproval: false }]} formats={[{ id: "format-video", name: "คลิปแนวตั้ง", mediaKind: "video", allowedPlatforms: ["facebook"] }, { id: "format-image", name: "ภาพชุด", mediaKind: "image", allowedPlatforms: ["facebook"] }]} onCancel={vi.fn()} onSubmit={onSubmit} />);

    expect(screen.getByLabelText("ประเภทคอนเทนต์")).toHaveDisplayValue("เบื้องหลัง");
    fireEvent.change(screen.getByLabelText("ไฟล์รูปหรือคลิป"), { target: { files: [file] } });
    expect(screen.getByLabelText("รูปแบบการนำเสนอ")).toHaveDisplayValue("ภาพชุด");
    fireEvent.change(screen.getByLabelText("แคปชัน"), { target: { value: "รายละเอียด" } });
    fireEvent.change(screen.getByLabelText("วันที่ลง"), { target: { value: "2026-09-25" } });
    fireEvent.click(screen.getByRole("button", { name: "อัปโหลดไฟล์และตรวจสอบก่อนส่ง" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ categoryId: "category-behind", formatId: "format-image" })));
  });

  it("preserves entered values after upload failure and disables sending without a paired recipient", async () => {
    const file = new File(["image"], "photo.jpg", { type: "image/jpeg" });
    const onSubmit = vi.fn().mockRejectedValue(new Error("provider detail must not be shown"));
    const { rerender } = render(<LineSendComposer open authenticatedAdmin connectedRecipient recipientMasked="••••cdef" storageStatus="ready" onCancel={vi.fn()} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText("ไฟล์รูปหรือคลิป"), { target: { files: [file] } });
    fireEvent.change(screen.getByLabelText("แคปชัน"), { target: { value: "รักษาข้อความ" } });
    fireEvent.change(screen.getByLabelText("วันที่ลง"), { target: { value: "2026-09-25" } });
    fireEvent.click(screen.getByRole("button", { name: "อัปโหลดไฟล์และตรวจสอบก่อนส่ง" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("บันทึกหรืออัปโหลดไม่สำเร็จ");
    expect(screen.getByLabelText("แคปชัน")).toHaveValue("รักษาข้อความ");
    expect(screen.getByLabelText("วันที่ลง")).toHaveValue("2026-09-25");

    rerender(<LineSendComposer open authenticatedAdmin connectedRecipient={false} recipientMasked={null} storageStatus="ready" onCancel={vi.fn()} onSubmit={onSubmit} />);
    expect(screen.getByRole("button", { name: "อัปโหลดไฟล์และตรวจสอบก่อนส่ง" })).toBeDisabled();
    expect(screen.getByText(/จับคู่บัญชี LINE OA/)).toBeVisible();
  });

  it("shows a selected file as pending and blocks submit when Drive is unavailable", () => {
    const onSubmit = vi.fn();
    render(<LineSendComposer open authenticatedAdmin connectedRecipient recipientMasked="••••cdef" storageStatus="unavailable" storageReason="configuration" onCancel={vi.fn()} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText("ไฟล์รูปหรือคลิป"), { target: { files: [new File(["image"], "photo.jpg", { type: "image/jpeg" })] } });

    expect(screen.getByText(/photo.jpg.*ยังไม่อัปโหลด/)).toBeVisible();
    expect(screen.getByText(/Vercel Blob.*ยังไม่พร้อม/)).toBeVisible();
    expect(screen.getByRole("button", { name: "อัปโหลดไฟล์และตรวจสอบก่อนส่ง" })).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
