import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TaskDetailDrawer } from "../features/dashboard/components/TaskDetailDrawer";
import type { DashboardTask } from "../features/dashboard/dashboard-model";

const task: DashboardTask = {
  id: "reels",
  title: "ตัดต่อคลิป Reels",
  priority: "urgent",
  scheduledTime: "2026-09-23",
  workflowStage: "ตัดต่อ",
  category: "รีวิว",
  format: "Reels",
  owner: "ฟิว",
  objective: "เพิ่มยอดเข้าชม",
  caption: "แคปชันตัวอย่าง",
  notes: "ใช้ฉบับที่อนุมัติแล้ว",
  assets: [{ name: "review-reels.mp4", type: "video/mp4", size: 5, remoteReady: true, previewReady: true }],
};

describe("TaskDetailDrawer", () => {
  it("shows selected work details without making LINE delivery depend on that task", () => {
    const close = vi.fn();

    render(<TaskDetailDrawer task={task} onClose={close} />);

    const drawer = screen.getByRole("dialog", { name: "รายละเอียด ตัดต่อคลิป Reels" });
    expect(drawer).toBeVisible();
    expect(drawer).toHaveClass("motion-material-surface", "motion-drawer");
    expect(screen.getByText("ตัดต่อ")).toBeVisible();
    expect(screen.getByText("2026-09-23")).toBeVisible();
    expect(screen.getByText("review-reels.mp4")).toBeVisible();
    expect(screen.getByText("แคปชันตัวอย่าง")).toBeVisible();
    expect(screen.getByText("ฟิว · Reels · รีวิว")).toBeVisible();
    expect(screen.queryByRole("button", { name: /LINE/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "ปิดรายละเอียดงาน" }));
    expect(close).toHaveBeenCalledOnce();
  });

  it("does not render without a selected task", () => {
    render(<TaskDetailDrawer task={null} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
