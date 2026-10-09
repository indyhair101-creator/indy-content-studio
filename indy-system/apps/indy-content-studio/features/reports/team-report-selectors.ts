import type { ContentItem, DashboardState } from "../domain/types";
import { bangkokDate, inReportRange, previousRange, shiftDate } from "./report-dates";
import type { ReportFilters, WorkStatusEvent } from "./report-types";
import { workDate } from "./work-status-history";

export const WORK_STATUS_LABELS: Record<string, string> = { "waiting-shoot": "รอถ่าย", shot: "ถ่ายแล้ว", editing: "ตัดต่อ", review: "รอตรวจ", "needs-changes": "แก้ไข", ready: "พร้อมเผยแพร่", published: "เผยแพร่แล้ว", todo: "ยังไม่เริ่ม", doing: "กำลังทำ", done: "เสร็จ" };
export interface TeamWorkRow {
  id: string; kind: "content" | "action-task"; title: string; owner: string; dueDate: string | null;
  status: string; bucket: "done" | "doing" | "todo"; overdue: boolean;
  completion: WorkStatusEvent | null; timing: "on-time" | "late" | "unknown" | "open";
  channels: number; steps: number; manualPublication: boolean;
}
export interface TeamStepRow { id: string; contentId: string; contentTitle: string; name: string; owner: string; status: string; dueDate: string | null; ageDays: number | null; autoClosed: boolean }
const doneContent = (status: string) => status === "published";
function completionEvent(events: WorkStatusEvent[], status: string, isContent: boolean): WorkStatusEvent | null {
  const done = isContent ? doneContent : (value: string) => value === "done";
  if (!done(status)) return null;
  const ordered = [...events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  let completion: WorkStatusEvent | null = null;
  for (const event of ordered) {
    if (!done(event.to)) completion = null;
    else if (event.from === null) completion = null;
    else if (!done(event.from)) completion = event;
  }
  return completion;
}
function contentMatches(content: ContentItem, state: DashboardState, filters: ReportFilters): boolean {
  const publications = state.reporting?.publications.filter((post) => post.contentId === content.id) ?? [];
  return !content.deletedAt && (!filters.owner || content.owner === filters.owner)
    && (!filters.categoryId || content.categoryId === filters.categoryId) && (!filters.formatId || content.formatId === filters.formatId)
    && (!filters.objective || content.objective === filters.objective)
    && (filters.platform === "all" || content.schedules.some((schedule) => schedule.enabled && schedule.platform === filters.platform) || publications.some((post) => post.platform === filters.platform))
    && (!filters.accountId || publications.some((post) => post.accountId === filters.accountId && (filters.platform === "all" || post.platform === filters.platform)));
}
function timing(completion: WorkStatusEvent | null, bucket: TeamWorkRow["bucket"]): TeamWorkRow["timing"] {
  if (bucket !== "done") return "open";
  if (!completion?.scheduledDate) return "unknown";
  return bangkokDate(completion.occurredAt) <= completion.scheduledDate ? "on-time" : "late";
}
function summarize(rows: TeamWorkRow[]) {
  return { planned: rows.length, done: rows.filter((row) => row.bucket === "done").length, doing: rows.filter((row) => row.bucket === "doing").length, todo: rows.filter((row) => row.bucket === "todo").length, overdue: rows.filter((row) => row.overdue).length };
}

/** Planned cohort uses due date (or planned-work date); completion cohort uses evidence time. */
export function selectTeamReport(state: DashboardState, filters: ReportFilters, now = new Date().toISOString()) {
  const today = bangkokDate(now);
  const history = state.statusHistory ?? [];
  const contents = state.contents.filter((content) => contentMatches(content, state, filters));
  const rows: TeamWorkRow[] = contents.map((content) => {
    const completion = completionEvent(history.filter((event) => event.entity === "content" && event.entityId === content.id && event.contentId === content.id), content.productionStatus, true);
    const bucket = doneContent(content.productionStatus) ? "done" : content.productionStatus === "waiting-shoot" ? "todo" : "doing";
    const dueDate = workDate(content.readyDate ?? content.plannedWorkAt);
    return { id: content.id, kind: "content", title: content.title, owner: content.owner, status: content.productionStatus, dueDate, bucket, overdue: bucket !== "done" && !!dueDate && dueDate < today, completion, timing: timing(completion, bucket), channels: content.schedules.filter((schedule) => schedule.enabled).length, steps: content.processSteps.length, manualPublication: completion?.source === "manual-publication" || content.schedules.some((schedule) => !!schedule.manualEvidence) };
  });
  const hasContentOnlyFilters = filters.platform !== "all" || !!filters.accountId || !!filters.categoryId || !!filters.formatId || !!filters.objective;
  const actionRows: TeamWorkRow[] = (hasContentOnlyFilters ? [] : state.actionTasks).filter((task) => !filters.owner || task.owner === filters.owner).map((task) => {
    const completion = completionEvent(history.filter((event) => event.entity === "action-task" && event.entityId === task.id), task.status, false);
    const bucket = task.status;
    return { id: task.id, kind: "action-task", title: task.title, owner: task.owner ?? "", dueDate: task.scheduledDate, status: task.status, bucket, overdue: bucket !== "done" && task.scheduledDate < today, completion, timing: timing(completion, bucket), channels: 0, steps: 0, manualPublication: false };
  });
  const all = [...rows, ...actionRows];
  const planned = rows.filter((row) => inReportRange(row.dueDate, filters.range));
  const actions = actionRows.filter((row) => inReportRange(row.dueDate, filters.range));
  const previous = rows.filter((row) => inReportRange(row.dueDate, previousRange(filters.range)));
  const completed = all.filter((row) => row.completion && inReportRange(row.completion.occurredAt, filters.range));
  const backlog = all.filter((row) => row.bucket !== "done" && row.dueDate && row.dueDate < filters.range.start);
  const undated = all.filter((row) => !row.dueDate);
  const owners = [...new Set([...planned, ...actions, ...backlog].map((row) => row.owner))].map((owner) => {
    const ownerRows = [...planned, ...actions].filter((row) => row.owner === owner);
    return { owner, contents: ownerRows.filter((row) => row.kind === "content").length, actions: ownerRows.filter((row) => row.kind === "action-task").length, ...summarize(ownerRows), backlog: backlog.filter((row) => row.owner === owner).length, rows: [...ownerRows, ...backlog.filter((row) => row.owner === owner)] };
  });
  const steps: TeamStepRow[] = contents.flatMap((content) => content.processSteps.map((step) => {
    const events = history.filter((event) => event.entity === "step" && event.contentId === content.id && event.entityId === step.id).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    const latest = events.at(-1);
    const ageDays = latest?.to === step.status && latest.source !== "import" ? Math.max(0, Math.floor((Date.parse(now) - Date.parse(latest.occurredAt)) / 86_400_000)) : null;
    return { id: step.id, contentId: content.id, contentTitle: content.title, name: step.name, owner: content.owner, status: step.status, dueDate: step.scheduledDate, ageDays, autoClosed: step.status === "done" && !!latest && (latest.source === "manual-publication" || latest.source === "publication-sync") };
  })).filter((step) => inReportRange(step.dueDate, filters.range)
    || planned.some((row) => row.id === step.contentId)
    || (step.autoClosed && history.some((event) => event.entity === "step" && event.contentId === step.contentId && event.entityId === step.id && event.to === "done" && inReportRange(event.occurredAt, filters.range)))
    || (step.status !== "done" && (!step.dueDate || step.dueDate < filters.range.start)));
  const workflow = [...new Set(steps.map((step) => step.name))].map((name) => ({ name, todo: steps.filter((step) => step.name === name && step.status === "todo").length, doing: steps.filter((step) => step.name === name && step.status === "doing").length, done: steps.filter((step) => step.name === name && step.status === "done").length, unknownAge: steps.filter((step) => step.name === name && step.status !== "done" && step.ageDays === null).length }));
  const upcoming = all.filter((row) => row.bucket !== "done" && row.dueDate && row.dueDate >= today && row.dueDate <= shiftDate(today, 3));
  const collisions = [...new Set(upcoming.map((row) => JSON.stringify([row.owner, row.dueDate])))].map((key) => { const [owner, dueDate] = JSON.parse(key) as string[]; return { owner, dueDate, rows: upcoming.filter((row) => row.owner === owner && row.dueDate === dueDate) }; }).filter((group) => group.rows.length > 1);
  return { planned, actions, completed, backlog, undated, owners, steps, workflow, upcoming, collisions, totals: summarize(planned), previousTotals: summarize(previous), actionTotals: summarize(actions), onTime: completed.filter((row) => row.timing === "on-time").length, late: completed.filter((row) => row.timing === "late").length, unknownCompletion: all.filter((row) => row.bucket === "done" && !row.completion).length, unknownDue: completed.filter((row) => row.timing === "unknown").length, hasContentOnlyFilters };
}
