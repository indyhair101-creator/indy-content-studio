import { sortTasksForToday, type DashboardTask } from "../dashboard-model";

export type TodayOverviewState = "loading" | "empty" | "error" | "ready";

interface TodayOverviewProps {
  tasks: DashboardTask[];
  state: TodayOverviewState;
  onOpenTask: (task: DashboardTask) => void;
  onResumeLatest: () => void;
  onRetry: () => void;
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
      className={`today-task priority-${task.priority}`}
      data-testid="today-task"
      data-task-id={task.id}
      onClick={() => onOpenTask(task)}
    >
      <span className="task-thumbnail" aria-hidden="true">{task.title.slice(0, 1)}</span>
      <span className="task-copy">
        <span className="task-title">{task.title}</span>
        <span className="task-stage">{task.workflowStage ?? "กำลังเตรียมงาน"}</span>
      </span>
      <span className="task-meta">
        <time>{task.scheduledTime}</time>
        <span className="priority-pill">{priorityLabels[task.priority]}</span>
      </span>
    </button>
  );
}

export function TodayOverview({ tasks, state, onOpenTask, onResumeLatest, onRetry }: TodayOverviewProps) {
  const sortedTasks = sortTasksForToday(tasks);

  return (
    <section className="today-overview" aria-labelledby="today-heading">
      <div className="today-heading-row">
        <div>
          <p className="eyebrow">INDY / วันนี้</p>
          <h1 id="today-heading">กำหนดการวันนี้</h1>
          <p className="today-subtitle">โฟกัสงานสำคัญก่อน แล้วค่อยพางานต่อไปให้ลื่นไหล</p>
        </div>
        <button className="resume-button" type="button" onClick={onResumeLatest} disabled={state !== "ready" || tasks.length === 0}>
          ทำงานล่าสุดต่อ
        </button>
      </div>

      <div className="today-layout">
        <div className="today-schedule" role="region" aria-label="กำหนดการวันนี้" tabIndex={0} aria-live="polite">
          {state === "loading" && <p className="overview-state">กำลังเตรียมกำหนดการวันนี้</p>}
          {state === "empty" && <p className="overview-state">ยังไม่มีงานสำหรับวันนี้</p>}
          {state === "error" && (
            <div className="overview-state" role="alert">
              <p>เปิดกำหนดการวันนี้ไม่สำเร็จ</p>
              <button type="button" className="retry-button" onClick={onRetry}>ลองใหม่</button>
            </div>
          )}
          {state === "ready" && sortedTasks.map((task) => <TaskCard key={task.id} task={task} onOpenTask={onOpenTask} />)}
        </div>

        <aside className="today-aside" aria-label="สรุปการทำงานวันนี้">
          <div className="overview-aside-panel mini-calendar">
            <p className="panel-label">กันยายน 2026</p>
            <strong>18</strong>
            <span>พฤหัสบดี · วันนี้</span>
          </div>
          <div className="overview-aside-panel">
            <p className="panel-label">รออนุมัติ</p>
            <strong>{tasks.filter((task) => task.workflowStage?.includes("อนุมัติ")).length}</strong>
            <span>ชิ้นงานที่ต้องตรวจทาน</span>
          </div>
        </aside>
      </div>
    </section>
  );
}
