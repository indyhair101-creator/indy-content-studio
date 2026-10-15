import type { ReactNode } from "react";
import { sortTasksForToday, type DashboardTask } from "../dashboard-model";

export type TodayOverviewState = "loading" | "empty" | "error" | "ready";

interface TodayOverviewProps {
  tasks: DashboardTask[];
  state: TodayOverviewState;
  /** Today as YYYY-MM-DD in Bangkok time. */
  today: string;
  reviewCount: number;
  onOpenTask: (task: DashboardTask) => void;
  onRetry: () => void;
  actions?: ReactNode;
}

const priorityLabels = {
  urgent: "เร่งด่วน",
  high: "สำคัญ",
  normal: "ตามแผน",
  low: "รอได้",
} as const;

function TaskCard({ task, onOpenTask }: { task: DashboardTask; onOpenTask: (task: DashboardTask) => void }) {
  return (
    <button
      type="button"
      className={`today-task priority-${task.priority}${task.isOverdue ? " is-overdue" : ""}`}
      data-testid="today-task"
      data-task-id={task.id}
      onClick={() => onOpenTask(task)}
    >
      <span className="task-thumbnail" aria-hidden="true">{task.title.slice(0, 1)}</span>
      <span className="task-copy">
        <span className="task-title">{task.title}</span>
        <span className="task-stage">{[task.workflowStage ?? "กำลังเตรียมงาน", task.owner].filter(Boolean).join(" · ")}</span>
      </span>
      <span className="task-meta">
        {task.isOverdue ? <span className="overdue-pill">เลยกำหนด</span> : <span className="priority-pill">{priorityLabels[task.priority]}</span>}
      </span>
    </button>
  );
}

function thaiDateParts(today: string) {
  const date = new Date(`${today}T12:00:00+07:00`);
  const format = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("th-TH-u-ca-gregory", { timeZone: "Asia/Bangkok", ...options }).format(date);
  return { day: format({ day: "numeric" }), monthYear: format({ month: "long", year: "numeric" }), weekday: format({ weekday: "long" }) };
}

export function TodayOverview({ tasks, state, today, reviewCount, onOpenTask, onRetry, actions }: TodayOverviewProps) {
  const sortedTasks = sortTasksForToday(tasks);
  const overdueCount = tasks.filter((task) => task.isOverdue).length;
  const date = thaiDateParts(today);
  const listState = state === "ready" && sortedTasks.length === 0 ? "empty" : state;

  return (
    <section className="today-overview" aria-labelledby="today-heading">
      <div className="today-heading-row">
        <h1 id="today-heading">กำหนดการวันนี้</h1>
        {actions && <div className="today-actions">{actions}</div>}
      </div>

      <div className="today-layout">
        <div className="today-schedule" role="region" aria-label="กำหนดการวันนี้" tabIndex={0} aria-live="polite">
          {listState === "loading" && <p className="overview-state">กำลังเตรียมกำหนดการวันนี้</p>}
          {listState === "empty" && <p className="overview-state">ยังไม่มีงานสำหรับวันนี้</p>}
          {listState === "error" && (
            <div className="overview-state" role="alert">
              <p>เปิดกำหนดการวันนี้ไม่สำเร็จ</p>
              <button type="button" className="retry-button" onClick={onRetry}>ลองใหม่</button>
            </div>
          )}
          {listState === "ready" && sortedTasks.map((task) => <TaskCard key={task.id} task={task} onOpenTask={onOpenTask} />)}
        </div>

        <aside className="today-aside" aria-label="สรุปการทำงานวันนี้">
          <div className="overview-aside-panel mini-calendar">
            <p className="panel-label">{date.monthYear}</p>
            <strong>{date.day}</strong>
            <span>{date.weekday}</span>
          </div>
          <div className="overview-aside-panel">
            <p className="panel-label">งานวันนี้</p>
            <strong>{tasks.length - overdueCount}</strong>
            {overdueCount > 0 && <span className="overdue-count">เลยกำหนด {overdueCount}</span>}
          </div>
          <div className="overview-aside-panel">
            <p className="panel-label">รอตรวจ</p>
            <strong>{reviewCount}</strong>
          </div>
        </aside>
      </div>
    </section>
  );
}
