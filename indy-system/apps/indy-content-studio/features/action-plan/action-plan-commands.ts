import type { ActionTask, DashboardState, StepStatus } from "../domain/types";
export function setProcessStepStatus(state: DashboardState, contentId: string, stepId: string, status: StepStatus, now: string): DashboardState { const content = state.contents.find((item) => item.id === contentId); if (!content) throw new Error("ไม่พบชิ้นงาน"); if (!content.processSteps.some((step) => step.id === stepId)) throw new Error("ไม่พบขั้นตอน"); return { ...state, contents: state.contents.map((item) => item.id === contentId ? { ...item, processSteps: item.processSteps.map((step) => step.id === stepId ? { ...step, status } : step), updatedAt: now } : item) }; }
export function rescheduleProcessStep(state: DashboardState, contentId: string, stepId: string, scheduledDate: string | null, now: string): DashboardState { return { ...state, contents: state.contents.map((item) => item.id === contentId ? { ...item, processSteps: item.processSteps.map((step) => step.id === stepId ? { ...step, scheduledDate } : step), updatedAt: now } : item) }; }

function assertValidDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) throw new Error("วันที่ไม่ถูกต้อง");
}

function assertTaskExists(state: DashboardState, taskId: string): void {
  if (!(state.actionTasks ?? []).some((task) => task.id === taskId)) throw new Error("ไม่พบงาน Action Plan");
}

function assertProcessStepExists(state: DashboardState, contentId: string, stepId: string): void {
  const content = state.contents.find((item) => item.id === contentId);
  if (!content) throw new Error("ไม่พบชิ้นงาน");
  if (!content.processSteps.some((step) => step.id === stepId)) throw new Error("ไม่พบขั้นตอน");
}

export function addStandaloneActionTask(state: DashboardState, input: { title: string; date: string; id: string; owner?: string | null; now: string }): DashboardState {
  const title = input.title.trim();
  if (!title) throw new Error("กรอกชื่องานก่อนเพิ่ม");
  assertValidDate(input.date);
  if ((state.actionTasks ?? []).some((task) => task.id === input.id)) throw new Error("งานนี้มีอยู่แล้ว");
  const task: ActionTask = { id: input.id, title, scheduledDate: input.date, status: "todo", owner: input.owner ?? null, createdAt: input.now, updatedAt: input.now };
  return { ...state, actionTasks: [...(state.actionTasks ?? []), task] };
}

export function updateStandaloneActionTask(state: DashboardState, taskId: string, input: { title: string; scheduledDate: string; now: string }): DashboardState {
  assertTaskExists(state, taskId);
  const title = input.title.trim();
  if (!title) throw new Error("กรอกชื่องานก่อนบันทึก");
  assertValidDate(input.scheduledDate);
  return { ...state, actionTasks: state.actionTasks.map((task) => task.id === taskId ? { ...task, title, scheduledDate: input.scheduledDate, updatedAt: input.now } : task) };
}

export function deleteStandaloneActionTask(state: DashboardState, taskId: string): DashboardState {
  assertTaskExists(state, taskId);
  return { ...state, actionTasks: state.actionTasks.filter((task) => task.id !== taskId) };
}

export function setStandaloneActionTaskStatus(state: DashboardState, taskId: string, status: StepStatus, now: string): DashboardState {
  assertTaskExists(state, taskId);
  return { ...state, actionTasks: state.actionTasks.map((task) => task.id === taskId ? { ...task, status, updatedAt: now } : task) };
}

export function rescheduleStandaloneActionTask(state: DashboardState, taskId: string, scheduledDate: string, now: string): DashboardState {
  assertTaskExists(state, taskId);
  assertValidDate(scheduledDate);
  return { ...state, actionTasks: state.actionTasks.map((task) => task.id === taskId ? { ...task, scheduledDate, updatedAt: now } : task) };
}

export function updateProcessStep(state: DashboardState, contentId: string, stepId: string, input: { name: string; scheduledDate: string | null; now: string }): DashboardState {
  assertProcessStepExists(state, contentId, stepId);
  const name = input.name.trim();
  if (!name) throw new Error("กรอกชื่อขั้นตอนก่อนบันทึก");
  if (input.scheduledDate !== null) assertValidDate(input.scheduledDate);
  return { ...state, contents: state.contents.map((item) => item.id === contentId ? { ...item, processSteps: item.processSteps.map((step) => step.id === stepId ? { ...step, name, scheduledDate: input.scheduledDate } : step), updatedAt: input.now } : item) };
}

export function deleteProcessStep(state: DashboardState, contentId: string, stepId: string): DashboardState {
  assertProcessStepExists(state, contentId, stepId);
  return { ...state, contents: state.contents.map((item) => item.id === contentId ? { ...item, processSteps: item.processSteps.filter((step) => step.id !== stepId) } : item) };
}
