import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LineSendConfirmation } from "../features/dashboard/components/LineSendConfirmation";
import type { DashboardTask } from "../features/dashboard/dashboard-model";

const readyTask: DashboardTask = {
  id: "reels",
  title: "ตัดต่อคลิป Reels",
  priority: "urgent",
  scheduledTime: "2026-09-25",
  caption: "แคปชันตัวอย่าง",
  updatedAt: "2026-09-22T12:00:00.000Z",
  assets: [{ name: "review-reels.mp4", type: "video/mp4", size: 5, remoteReady: true, previewReady: true }],
};

const delivery = { id: "delivery-123", status: "sent" as const, errorCategory: null, sentAt: "2026-09-22T12:00:00.000Z" };
const commonProps = { connectedRecipient: true, authenticatedAdmin: true, recipientMasked: "••••cdef", expectedUpdatedAt: readyTask.updatedAt! };

describe("LineSendConfirmation", () => {
  it("shows the selected saved asset, caption, and intended recipient before confirming", () => {
    const confirm = vi.fn().mockResolvedValue(delivery);

    render(<LineSendConfirmation {...commonProps} task={readyTask} open onCancel={vi.fn()} onConfirm={confirm} />);

    const dialog = screen.getByRole("dialog", { name: "ยืนยันการส่งเข้า LINE OA" });
    expect(dialog).toBeVisible();
    expect(dialog).toHaveClass("motion-material-surface", "motion-modal");
    expect(screen.getByText("review-reels.mp4")).toBeVisible();
    expect(screen.getByText("แคปชันตัวอย่าง")).toBeVisible();
    expect(screen.getByText("2026-09-25")).toBeVisible();
    expect(screen.getByText(/กดยืนยันจะส่งเข้า LINE ทันที/)).toBeVisible();
    expect(screen.getByText("••••cdef")).toBeVisible();
    expect(screen.getByRole("button", { name: "ยกเลิก" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "ยืนยันส่ง" }));
    expect(confirm).toHaveBeenCalledOnce();
  });

  it("prevents a second confirmation while the first submission is pending", () => {
    let resolveConfirmation: (() => void) | undefined;
    const confirm = vi.fn(() => new Promise<typeof delivery>((resolve) => { resolveConfirmation = () => resolve(delivery); }));

    render(<LineSendConfirmation {...commonProps} task={readyTask} open onCancel={vi.fn()} onConfirm={confirm} />);

    const submit = screen.getByRole("button", { name: "ยืนยันส่ง" });
    fireEvent.click(submit);
    expect(submit).toBeDisabled();
    fireEvent.click(submit);
    expect(confirm).toHaveBeenCalledOnce();
    resolveConfirmation?.();
  });

  it("shows a receipt after success", async () => {
    render(<LineSendConfirmation {...commonProps} task={readyTask} open onCancel={vi.fn()} onConfirm={vi.fn().mockResolvedValue(delivery)} />);

    fireEvent.click(screen.getByRole("button", { name: "ยืนยันส่ง" }));

    expect(await screen.findByRole("status")).toHaveTextContent("ส่งเข้า LINE OA เรียบร้อยแล้ว");
    expect(screen.getByText("Delivery ID: delivery-123")).toBeVisible();
    expect(screen.getByText(/เวลาส่ง:/)).toBeVisible();
  });

  it("offers a safe retry after a failed delivery", async () => {
    const confirm = vi.fn().mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce(delivery);

    render(<LineSendConfirmation {...commonProps} task={readyTask} open onCancel={vi.fn()} onConfirm={confirm} />);

    fireEvent.click(screen.getByRole("button", { name: "ยืนยันส่ง" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("ส่งไม่สำเร็จ");
    fireEvent.click(screen.getByRole("button", { name: "ลองส่งอีกครั้ง" }));

    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("status")).toHaveTextContent("ส่งเข้า LINE OA เรียบร้อยแล้ว");
  });

  it("shows only the safe server error category when delivery fails", async () => {
    const failed = { id: "delivery-123", status: "failed" as const, errorCategory: "quota", sentAt: null };
    render(<LineSendConfirmation {...commonProps} task={readyTask} open onCancel={vi.fn()} onConfirm={vi.fn().mockResolvedValue(failed)} />);

    fireEvent.click(screen.getByRole("button", { name: "ยืนยันส่ง" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("quota");
    expect(screen.getByRole("alert")).not.toHaveTextContent("provider token");
  });

  it("does not open for a task without both a ready asset and caption", () => {
    render(<LineSendConfirmation {...commonProps} task={{ ...readyTask, assets: [], caption: "" }} open onCancel={vi.fn()} onConfirm={vi.fn()} />);

    expect(screen.queryByRole("dialog", { name: "ยืนยันการส่งเข้า LINE OA" })).not.toBeInTheDocument();
  });

  it.each([
    ["success", vi.fn().mockResolvedValueOnce(delivery).mockResolvedValueOnce(delivery)],
    ["error", vi.fn().mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce(delivery)],
  ])("resets the %s result when reopened for another eligible task", async (_result, confirm) => {
    const nextTask = { ...readyTask, id: "carousel", title: "ตรวจคารูเซล", assets: [{ name: "carousel.jpg", type: "image/jpeg", size: 8, remoteReady: true, previewReady: true }] };
    const { rerender } = render(<LineSendConfirmation {...commonProps} task={readyTask} open onCancel={vi.fn()} onConfirm={confirm} />);

    fireEvent.click(screen.getByRole("button", { name: "ยืนยันส่ง" }));
    expect(await screen.findByRole(_result === "success" ? "status" : "alert")).toBeVisible();

    rerender(<LineSendConfirmation {...commonProps} task={nextTask} open={false} onCancel={vi.fn()} onConfirm={confirm} />);
    rerender(<LineSendConfirmation {...commonProps} task={nextTask} open onCancel={vi.fn()} onConfirm={confirm} />);

    expect(screen.getByRole("button", { name: "ยืนยันส่ง" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "ยืนยันส่ง" }));
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(2));
  });
});
