import { describe, expect, it } from "vitest";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import { dashboardTaskToContent } from "../features/dashboard/dashboard-model";
import {
  addCategory,
  addFormat,
  deleteCategory,
  deleteFormat,
  renameCategory,
  renameFormat,
  renameOwnerOption,
  setCategoryApprovalRequired,
  setMonthlyGoal,
} from "../features/settings/settings-commands";

const meta = { id: "new-item", now: "2026-09-18T00:00:00.000Z" };

describe("settings commands", () => {
  it("renames the owner on existing and trashed content without changing other content fields", () => {
    const state = createEmptyDashboardState();
    state.ownerOptions = ["Misschilli", "colofill"];
    const content = dashboardTaskToContent({ id: "owned", title: "งานเดิม", priority: "normal", scheduledTime: "ยังไม่กำหนด", category: "รีวิว", format: "วิดีโอ" }, state, meta.now);
    state.contents = [
      { ...content, owner: "Misschilli", productionStatus: "published" },
      { ...content, id: "trashed", owner: "Misschilli", deletedAt: meta.now },
      { ...content, id: "other", owner: "colofill" },
    ];
    const before = structuredClone(state);
    const renamed = renameOwnerOption(state, "Misschilli", " Big boss ");
    expect(renamed.ownerOptions).toEqual(["Big boss", "colofill"]);
    expect(renamed.contents).toEqual([
      { ...before.contents[0], owner: "Big boss" },
      { ...before.contents[1], owner: "Big boss" },
      before.contents[2],
    ]);
    expect(state).toEqual(before);
  });

  it("rejects duplicate, empty, and unknown owner renames without mutating data", () => {
    const state = createEmptyDashboardState();
    state.ownerOptions = ["Misschilli", "Big boss"];
    const before = structuredClone(state);
    expect(() => renameOwnerOption(state, "Misschilli", " big BOSS ")).toThrow("มีชื่อผู้รับผิดชอบนี้อยู่แล้ว");
    expect(() => renameOwnerOption(state, "Misschilli", " ")).toThrow("กรุณาระบุชื่อ");
    expect(() => renameOwnerOption(state, "missing", "ใหม่")).toThrow("ไม่พบชื่อผู้รับผิดชอบนี้");
    expect(state).toEqual(before);
  });

  it("adds, renames, and toggles category settings immutably", () => {
    const state = createEmptyDashboardState();
    const added = addCategory(state, " เบื้องหลัง ", meta);
    expect(added).not.toBe(state);
    expect(added.categories.at(-1)).toMatchObject({ id: "new-item", name: "เบื้องหลัง", requiresApproval: false });
    expect(() => addCategory(state, " รีวิว ", meta)).toThrow("มีหมวดนี้อยู่แล้ว");
    const renamed = renameCategory(added, "new-item", " เบื้องหลังทีม ");
    expect(renamed.categories.find((item) => item.id === "new-item")?.name).toBe("เบื้องหลังทีม");
    expect(setCategoryApprovalRequired(renamed, "new-item", true).categories.find((item) => item.id === "new-item")?.requiresApproval).toBe(true);
  });

  it("deletes used categories by reassigning their content and protects in-use formats", () => {
    const state = createEmptyDashboardState();
    state.categoryMonthlyGoals.push({ month: "2026-09", categoryId: "category-review", target: 4 });
    const usedState: typeof state = { ...state, contents: [{
      id: "content-1", title: "งาน", categoryId: "category-review", formatId: "format-video", owner: "ทีม", objective: "awareness", priority: "normal", plannedWorkAt: null, lastWorkedAt: null, readyDate: null, productionStatus: "waiting-shoot", assetIds: [], processSteps: [], caption: "", captionSource: null, schedules: [], referenceIds: [], notes: "", localApproval: "pending", lineReview: { status: "not-sent", activeCycleId: null, reviewCode: null, providerReceipts: [], lastEventAt: null, history: [] }, createdAt: "now", updatedAt: "now", deletedAt: null,
    }] };
    const deleted = deleteCategory(usedState, "category-review", meta.now);
    expect(deleted.categories.some((item) => item.id === "category-review")).toBe(false);
    expect(deleted.categoryMonthlyGoals).toEqual([]);
    expect(deleted.contents[0]).toMatchObject({ categoryId: "category-knowledge", updatedAt: meta.now });
    expect(() => deleteCategory({ ...usedState, categories: usedState.categories.filter((item) => item.id === "category-review") }, "category-review", meta.now)).toThrow("เพิ่มหมวดอื่นก่อนลบหมวดสุดท้าย");
    expect(() => deleteFormat({ ...state, contents: [{
      id: "content-1", title: "งาน", categoryId: "category-review", formatId: "format-video", owner: "ทีม", objective: "awareness", priority: "normal", plannedWorkAt: null, lastWorkedAt: null, readyDate: null, productionStatus: "waiting-shoot", assetIds: [], processSteps: [], caption: "", captionSource: null, schedules: [], referenceIds: [], notes: "", localApproval: "pending", lineReview: { status: "not-sent", activeCycleId: null, reviewCode: null, providerReceipts: [], lastEventAt: null, history: [] }, createdAt: "now", updatedAt: "now", deletedAt: null,
    }], }, "format-video")).toThrow("รูปแบบนี้มีชิ้นงานใช้อยู่");
    expect(deleteCategory(state, "category-review").categories.some((item) => item.id === "category-review")).toBe(false);
  });

  it("manages formats and monthly goals", () => {
    const state = createEmptyDashboardState();
    const added = addFormat(state, " Carousel ", "image", ["facebook"], meta);
    expect(added.formats.at(-1)).toMatchObject({ id: "new-item", name: "Carousel", mediaKind: "image" });
    expect(() => addFormat(state, " วิดีโอ ", "video", ["facebook"], meta)).toThrow("มีรูปแบบนี้อยู่แล้ว");
    const renamed = renameFormat(added, "new-item", "อัลบั้มใหม่");
    expect(renamed.formats.find((item) => item.id === "new-item")?.name).toBe("อัลบั้มใหม่");
    expect(setMonthlyGoal(state, "2026-09", 20).monthlyGoals[0]).toMatchObject({ month: "2026-09", target: 20 });
    expect(() => setMonthlyGoal(state, "2026-09", -1)).toThrow("เป้าหมายต้องไม่ติดลบ");
  });
});
