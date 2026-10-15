import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { selectTodayTasks, type DashboardTask } from "../features/dashboard/dashboard-model";
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

const baseProps = { today: "2026-10-15", reviewCount: 0, onOpenTask: vi.fn(), onRetry: vi.fn() };

describe("TodayOverview", () => {
  it("orders cards by priority, leads with overdue work and opens the selected task", () => {
    const openTask = vi.fn();
    const overdue: DashboardTask = { id: "late", title: "โพสต์ที่เลยกำหนด", priority: "low", scheduledTime: "2026-10-10", isOverdue: true };

    render(<TodayOverview {...baseProps} tasks={[...tasks, overdue]} state="ready" onOpenTask={openTask} actions={<button type="button">สร้างชิ้นงานใหม่</button>} />);

    expect(screen.getByRole("heading", { name: "กำหนดการวันนี้" })).toBeVisible();
    expect(screen.getByRole("button", { name: "สร้างชิ้นงานใหม่" })).toBeVisible();
    expect(screen.getAllByTestId("today-task").map((node) => node.dataset.taskId)).toEqual(["late", "urgent", "early"]);
    expect(screen.getByText("เลยกำหนด")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /จัดคิวภาพนิ่ง/ }));
    expect(openTask).toHaveBeenCalledWith(tasks[0]);
  });

  it("shows the real date and counts instead of fixed placeholders", () => {
    render(<TodayOverview {...baseProps} tasks={tasks} state="ready" reviewCount={3} />);
    expect(screen.getByText("15")).toBeVisible();
    expect(screen.getByText(/ตุลาคม 2026/)).toBeVisible();
    expect(screen.getByText("3")).toBeVisible();
    expect(screen.queryByText("กันยายน 2026")).not.toBeInTheDocument();
  });

  it("does not show the extra LINE delivery readiness panel", () => {
    render(<TodayOverview {...baseProps} tasks={tasks} state="ready" />);
    expect(screen.queryByText("LINE delivery")).not.toBeInTheDocument();
    expect(screen.queryByText("ตรวจความพร้อมก่อนส่งทุกครั้ง")).not.toBeInTheDocument();
  });

  it.each([
    ["loading", "กำลังเตรียมกำหนดการวันนี้"],
    ["empty", "ยังไม่มีงานสำหรับวันนี้"],
    ["ready", "ยังไม่มีงานสำหรับวันนี้"],
    ["error", "ลองใหม่"],
  ] as const)("shows a useful %s state", (state, expectedText) => {
    render(<TodayOverview {...baseProps} tasks={[]} state={state} />);

    expect(screen.getByText(expectedText)).toBeVisible();
  });

  it("retries the error state through its callback", () => {
    const retry = vi.fn();

    render(<TodayOverview {...baseProps} tasks={[]} state="error" onRetry={retry} />);

    fireEvent.click(screen.getByRole("button", { name: "ลองใหม่" }));

    expect(retry).toHaveBeenCalledOnce();
  });
});

describe("selectTodayTasks", () => {
  const today = "2026-10-15";
  const base = { priority: "normal" as const, scheduledTime: "ยังไม่กำหนด" };

  it("keeps work due today or still open from earlier days and drops future or finished work", () => {
    const selected = selectTodayTasks([
      { ...base, id: "calendar-today", title: "a", scheduledTime: "2026-10-15" },
      { ...base, id: "step-today", title: "b", processSteps: [{ id: "s", name: "ถ่าย", scheduledDate: "2026-10-15", status: "todo", order: 0 }] },
      { ...base, id: "publish-today", title: "c", platformSchedules: { tiktok: { enabled: true, date: "2026-10-15", time: "19:00" } } },
      { ...base, id: "overdue-step", title: "d", processSteps: [{ id: "s", name: "ตัดต่อ", scheduledDate: "2026-10-12", status: "doing", order: 0 }] },
      { ...base, id: "done-step", title: "e", processSteps: [{ id: "s", name: "ตัดต่อ", scheduledDate: "2026-10-12", status: "done", order: 0 }] },
      { ...base, id: "future", title: "f", scheduledTime: "2026-10-20" },
      { ...base, id: "disabled-slot", title: "g", platformSchedules: { facebook: { enabled: false, date: "2026-10-15", time: "09:00" } } },
      { ...base, id: "published", title: "h", scheduledTime: "2026-10-15", isComplete: true },
    ], today);

    expect(selected.map((task) => [task.id, task.isOverdue])).toEqual([
      ["calendar-today", false],
      ["step-today", false],
      ["publish-today", false],
      ["overdue-step", true],
    ]);
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
