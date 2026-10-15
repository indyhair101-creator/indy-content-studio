import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  objective: "awareness",
  caption: "แคปชันตัวอย่าง",
  notes: "ใช้ฉบับที่อนุมัติแล้ว",
  assets: [{ name: "review-reels.mp4", type: "video/mp4", size: 5, remoteReady: true, previewReady: true }],
  processSteps: [
    { id: "shoot", name: "ถ่ายทำ", scheduledDate: "2026-09-21", status: "done", order: 0 },
    { id: "edit", name: "ตัดต่อ", scheduledDate: "2026-09-22", status: "doing", order: 1 },
  ],
  platformSchedules: { tiktok: { enabled: true, date: "2026-09-23", time: "19:00" }, facebook: { enabled: false, date: "", time: "09:00" } },
};

describe("TaskDetailDrawer", () => {
  it("shows selected work details in plain Thai without making LINE delivery depend on that task", () => {
    const close = vi.fn();

    render(<TaskDetailDrawer task={task} onClose={close} />);

    const drawer = screen.getByRole("dialog", { name: "รายละเอียด ตัดต่อคลิป Reels" });
    expect(drawer).toBeVisible();
    expect(drawer).toHaveClass("motion-material-surface", "motion-drawer");
    expect(screen.getByText("2026-09-23")).toBeVisible();
    expect(screen.getByText("review-reels.mp4")).toBeVisible();
    expect(screen.getByText("แคปชันตัวอย่าง")).toBeVisible();
    expect(screen.getByText("ฟิว")).toBeVisible();
    expect(screen.getByText("รีวิว · Reels")).toBeVisible();
    expect(screen.getByText("เพิ่มการรับรู้")).toBeVisible();
    expect(screen.getByText("TikTok · 2026-09-23 19:00")).toBeVisible();
    expect(screen.queryByText(/Facebook/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /LINE/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "ปิดรายละเอียดงาน" }));
    expect(close).toHaveBeenCalledOnce();
  });

  it("lets the user change status, tick steps and open the full editor without leaving Today", async () => {
    const changeStatus = vi.fn().mockResolvedValue(undefined);
    const toggleStep = vi.fn().mockResolvedValue(undefined);
    const edit = vi.fn();

    render(<TaskDetailDrawer task={task} onClose={vi.fn()} onEdit={edit} onChangeStatus={changeStatus} onToggleStep={toggleStep} />);

    expect(screen.getByLabelText("สถานะการผลิต")).toHaveDisplayValue("ตัดต่อ");
    fireEvent.change(screen.getByLabelText("สถานะการผลิต"), { target: { value: "review" } });
    await waitFor(() => expect(changeStatus).toHaveBeenCalledWith("review"));

    expect(screen.getByRole("checkbox", { name: /ถ่ายทำ/ })).toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: /ตัดต่อ/ }));
    await waitFor(() => expect(toggleStep).toHaveBeenCalledWith("edit", true));

    fireEvent.click(screen.getByRole("button", { name: "แก้ไขรายละเอียดทั้งหมด" }));
    expect(edit).toHaveBeenCalledOnce();
  });

  it("shows why a status change failed and closes on Escape", async () => {
    const close = vi.fn();
    render(<TaskDetailDrawer task={task} onClose={close} onChangeStatus={vi.fn().mockRejectedValue(new Error("ต้องอนุมัติก่อนเผยแพร่"))} />);

    fireEvent.change(screen.getByLabelText("สถานะการผลิต"), { target: { value: "published" } });
    expect(await screen.findByRole("alert")).toHaveTextContent("ต้องอนุมัติก่อนเผยแพร่");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(close).toHaveBeenCalledOnce();
  });

  it("does not render without a selected task", () => {
    render(<TaskDetailDrawer task={null} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
