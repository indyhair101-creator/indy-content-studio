import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DashboardTask } from "../features/dashboard/dashboard-model";
import { TodayOverview } from "../features/dashboard/components/TodayOverview";
import { useDashboardWorkspace } from "../features/dashboard/useDashboardWorkspace";

const tasks: DashboardTask[] = [
  {
    id: "early",
    title: "จัดคิวภาพนิ่ง",
    priority: "high",
    scheduledTime: "09:00",
    workflowStage: "ตรวจทานแคปชัน",
    lastWorkedAt: "2026-09-18T09:00:00.000Z",
  },
  {
    id: "urgent",
    title: "ตัดต่อคลิป Reels",
    priority: "urgent",
    scheduledTime: "13:00",
    workflowStage: "ตัดต่อ",
    lastWorkedAt: "2026-09-18T12:00:00.000Z",
  },
];

describe("TodayOverview", () => {
  it("orders cards by priority and opens the selected task", () => {
    const openTask = vi.fn();
    const resumeLatest = vi.fn();

    render(<TodayOverview tasks={tasks} state="ready" onOpenTask={openTask} onResumeLatest={resumeLatest} onRetry={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "กำหนดการวันนี้" })).toBeVisible();
    expect(screen.getByRole("button", { name: "ทำงานล่าสุดต่อ" })).toBeVisible();
    expect(screen.getAllByTestId("today-task").map((node) => node.dataset.taskId)).toEqual(["urgent", "early"]);

    fireEvent.click(screen.getByRole("button", { name: /จัดคิวภาพนิ่ง/ }));

    expect(openTask).toHaveBeenCalledWith(tasks[0]);

    fireEvent.click(screen.getByRole("button", { name: "ทำงานล่าสุดต่อ" }));

    expect(resumeLatest).toHaveBeenCalledOnce();
  });

  it("does not show the extra LINE delivery readiness panel", () => {
    render(<TodayOverview tasks={tasks} state="ready" onOpenTask={vi.fn()} onResumeLatest={vi.fn()} onRetry={vi.fn()} />);
    expect(screen.queryByText("LINE delivery")).not.toBeInTheDocument();
    expect(screen.queryByText("ตรวจความพร้อมก่อนส่งทุกครั้ง")).not.toBeInTheDocument();
  });

  it.each([
    ["loading", "กำลังเตรียมกำหนดการวันนี้"],
    ["empty", "ยังไม่มีงานสำหรับวันนี้"],
    ["error", "ลองใหม่"],
  ] as const)("shows a useful %s state", (state, expectedText) => {
    render(<TodayOverview tasks={[]} state={state} onOpenTask={vi.fn()} onResumeLatest={vi.fn()} onRetry={vi.fn()} />);

    expect(screen.getByText(expectedText)).toBeVisible();
  });

  it("retries the error state through its callback", () => {
    const retry = vi.fn();

    render(<TodayOverview tasks={[]} state="error" onOpenTask={vi.fn()} onResumeLatest={vi.fn()} onRetry={retry} />);

    fireEvent.click(screen.getByRole("button", { name: "ลองใหม่" }));

    expect(retry).toHaveBeenCalledOnce();
  });
});

function WorkspaceProbe({ tasks: workspaceTasks }: { tasks: DashboardTask[] }) {
  const workspace = useDashboardWorkspace(workspaceTasks);

  return (
    <>
      <output>{workspace.selectedTaskId ?? "none"}</output>
      <button type="button" onClick={workspace.resumeLatest}>resume</button>
      <button type="button" onClick={() => workspace.openTask("early")}>open</button>
    </>
  );
}

describe("useDashboardWorkspace", () => {
  it("resumes the most recently worked unfinished task", () => {
    render(
      <WorkspaceProbe
        tasks={[
          ...tasks,
          {
            id: "done",
            title: "งานที่เผยแพร่แล้ว",
            priority: "normal",
            scheduledTime: "15:00",
            workflowStage: "เผยแพร่แล้ว",
            lastWorkedAt: "2026-09-18T15:00:00.000Z",
            isComplete: true,
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "resume" }));

    expect(screen.getByText("urgent")).toBeVisible();
  });
});
