import { compareScheduleTimestamps } from "../calendar/schedule-time";
import type { DashboardState, Platform, StepStatus } from "../domain/types";

export interface ActionPlanEntry {
  kind: "content-step" | "standalone";
  id: string;
  name: string;
  scheduledDate: string | null;
  status: StepStatus;
  order: number;
  contentId?: string;
  contentTitle?: string;
  owner?: string;
  publicationSchedules?: { platform: Platform; publishAt: string }[];
}

export function selectActionPlanEntries(state: DashboardState, filters?: { owner?: string; status?: StepStatus }): ActionPlanEntry[] {
  const projectSteps = state.contents
    .filter((content) => !content.deletedAt && (!filters?.owner || content.owner === filters.owner))
    .flatMap((content) => content.processSteps
      .filter((step) => !filters?.status || step.status === filters.status)
      .map((step): ActionPlanEntry => ({
        kind: "content-step",
        ...step,
        contentId: content.id,
        contentTitle: content.title,
        owner: content.owner,
        publicationSchedules: content.schedules
          .filter((schedule) => schedule.enabled && schedule.publishAt)
          .sort((left, right) => compareScheduleTimestamps(left.publishAt!, right.publishAt!))
          .map(({ platform, publishAt }) => ({ platform, publishAt: publishAt! })),
      })));
  const standaloneTasks = (state.actionTasks ?? [])
    .filter((task) => (!filters?.owner || task.owner === filters.owner) && (!filters?.status || task.status === filters.status)).map((task): ActionPlanEntry => ({
      kind: "standalone",
      id: task.id,
      name: task.title,
      scheduledDate: task.scheduledDate,
      status: task.status,
      order: 0,
      owner: task.owner ?? undefined,
    }))
  return [...projectSteps, ...standaloneTasks];
}

export function selectActionPlan(state: DashboardState, input: { mode: "week" | "month"; anchorDate: string; filters?: { owner?: string; status?: StepStatus } }) {
  const anchor = new Date(`${input.anchorDate}T00:00:00Z`);
  const start = new Date(anchor);
  const end = new Date(anchor);
  if (input.mode === "week") {
    const day = (start.getUTCDay() + 6) % 7;
    start.setUTCDate(start.getUTCDate() - day);
    end.setTime(start.getTime());
    end.setUTCDate(end.getUTCDate() + 6);
  } else {
    start.setUTCDate(1);
    end.setUTCMonth(end.getUTCMonth() + 1, 0);
  }

  const entries = selectActionPlanEntries(state, input.filters);
  const dated = entries.filter((entry) => entry.scheduledDate
    && entry.scheduledDate >= start.toISOString().slice(0, 10)
    && entry.scheduledDate <= end.toISOString().slice(0, 10));
  const unscheduled = entries.filter((entry) => !entry.scheduledDate);
  const days = Array.from({ length: input.mode === "week" ? 7 : end.getUTCDate() }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    const value = date.toISOString().slice(0, 10);
    return { date: value, steps: dated.filter((entry) => entry.scheduledDate === value) };
  });
  const summary = {
    todo: entries.filter((entry) => entry.status === "todo").length,
    doing: entries.filter((entry) => entry.status === "doing").length,
    done: entries.filter((entry) => entry.status === "done").length,
  };
  return { days, unscheduled, summary };
}
