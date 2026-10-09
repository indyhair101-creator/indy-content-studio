import { describe, expect, it } from "vitest"; import { createEmptyDashboardState } from "../features/domain/create-empty-state"; import { selectActionPlan } from "../features/action-plan/action-plan-selectors"; import { addStandaloneActionTask, deleteProcessStep, deleteStandaloneActionTask, setProcessStepStatus, updateProcessStep, updateStandaloneActionTask } from "../features/action-plan/action-plan-commands";
describe("action plan", () => { it("selects week and transitions status", () => { const state = createEmptyDashboardState(); state.contents.push({ id: "c", title: "งาน", categoryId: "category-knowledge", formatId: "format-video", owner: "ทีม", objective: "awareness", priority: "normal", plannedWorkAt: null, lastWorkedAt: null, readyDate: null, productionStatus: "waiting-shoot", assetIds: [], processSteps: [{ id: "s", name: "ตัดต่อ", scheduledDate: "2026-09-18", status: "todo", order: 0 }], caption: "", captionSource: null, schedules: [], referenceIds: [], notes: "", localApproval: "pending", lineReview: { status: "not-sent", activeCycleId: null, reviewCode: null, providerReceipts: [], lastEventAt: null, history: [] }, createdAt: "now", updatedAt: "now", deletedAt: null }); expect(selectActionPlan(state, { mode: "week", anchorDate: "2026-09-18" }).days).toHaveLength(7); expect(setProcessStepStatus(state, "c", "s", "done", "later").contents[0].processSteps[0].status).toBe("done"); }); });

describe("action plan mutations", () => {
  it("stores the selected owner on a standalone task", () => {
    const state = createEmptyDashboardState();
    const next = addStandaloneActionTask(state, { title: "ถ่ายคลิป", date: "2026-09-24", id: "task-1", owner: "colofill", now: "now" });
    expect(next.actionTasks[0].owner).toBe("colofill");
  });

  it("updates and deletes standalone tasks", () => {
    const state = createEmptyDashboardState();
    const withTask = addStandaloneActionTask(state, { title: "เดิม", date: "2026-09-24", id: "task-1", now: "now" });
    const updated = updateStandaloneActionTask(withTask, "task-1", { title: "ใหม่", scheduledDate: "2026-09-25", now: "later" });
    expect(updated.actionTasks[0]).toEqual(expect.objectContaining({ title: "ใหม่", scheduledDate: "2026-09-25", updatedAt: "later" }));
    expect(deleteStandaloneActionTask(updated, "task-1").actionTasks).toEqual([]);
  });

  it("updates and deletes content process steps", () => {
    const state = createEmptyDashboardState();
    state.contents.push({ id: "c", title: "งาน", categoryId: "category-knowledge", formatId: "format-video", owner: "ทีม", objective: "awareness", priority: "normal", plannedWorkAt: null, lastWorkedAt: null, readyDate: null, productionStatus: "waiting-shoot", assetIds: [], processSteps: [{ id: "s", name: "เดิม", scheduledDate: "2026-09-24", status: "todo", order: 0 }], caption: "", captionSource: null, schedules: [], referenceIds: [], notes: "", localApproval: "pending", lineReview: { status: "not-sent", activeCycleId: null, reviewCode: null, providerReceipts: [], lastEventAt: null, history: [] }, createdAt: "now", updatedAt: "now", deletedAt: null });
    const updated = updateProcessStep(state, "c", "s", { name: "ใหม่", scheduledDate: "2026-09-25", now: "later" });
    expect(updated.contents[0].processSteps[0]).toEqual(expect.objectContaining({ name: "ใหม่", scheduledDate: "2026-09-25" }));
    expect(deleteProcessStep(updated, "c", "s").contents[0].processSteps).toEqual([]);
  });
});
