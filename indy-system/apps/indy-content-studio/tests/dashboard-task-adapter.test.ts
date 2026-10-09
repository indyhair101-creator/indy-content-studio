import { describe, expect, it } from "vitest";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import {
  dashboardTaskFromContent,
  dashboardTaskToContent,
  dashboardTaskToMedia,
} from "../features/dashboard/dashboard-model";
import type { DashboardTask } from "../features/dashboard/dashboard-model";

const taskFixture: DashboardTask = {
  id: "task-adapter",
  title: "รีวิวสินค้า",
  priority: "high",
  scheduledTime: "2026-09-18",
  workflowStage: "ตัดต่อ",
  category: "รีวิว",
  format: "วิดีโอ",
  owner: "ทีมวิดีโอ",
  objective: "awareness",
  caption: "แคปชั่น",
  notes: "โน้ต",
  processSteps: [{ id: "step-edit", name: "ตัดต่อ", scheduledDate: "2026-09-18", status: "doing", order: 0 }],
  assets: [{ name: "clip.mp4", type: "video/mp4", size: 10 }],
};

describe("dashboard task adapter", () => {
  it("maps a dashboard task into canonical content and media records", () => {
    const state = createEmptyDashboardState();
    const content = dashboardTaskToContent(taskFixture, state, "2026-09-18T08:00:00.000Z");
    const media = dashboardTaskToMedia(taskFixture, "2026-09-18T08:00:00.000Z");

    expect(content).toMatchObject({
      id: "task-adapter",
      categoryId: "category-review",
      formatId: "format-video",
      productionStatus: "editing",
      priority: "high",
      plannedWorkAt: "2026-09-18",
      processSteps: taskFixture.processSteps,
      caption: "แคปชั่น",
    });
    expect(content.assetIds).toEqual(["asset-task-adapter-0"]);
    expect(media[0]).toMatchObject({ id: "asset-task-adapter-0", name: "clip.mp4", remoteStatus: "local-only" });
  });

  it("maps canonical content back to the task shape used by Today", () => {
    const state = createEmptyDashboardState();
    const content = dashboardTaskToContent(taskFixture, state, "2026-09-18T08:00:00.000Z");
    const nextState = { ...state, contents: [content], media: dashboardTaskToMedia(taskFixture, "2026-09-18T08:00:00.000Z") };

    expect(dashboardTaskFromContent(content, nextState)).toMatchObject({
      id: "task-adapter",
      title: "รีวิวสินค้า",
      scheduledTime: "2026-09-18",
      workflowStage: "ตัดต่อ",
      assets: [{ name: "clip.mp4", type: "video/mp4", size: 10 }],
      processSteps: taskFixture.processSteps,
    });
  });

  it("preserves per-platform schedules through the task adapter", () => {
    const state = createEmptyDashboardState();
    const content = dashboardTaskToContent({
      ...taskFixture,
      platformSchedules: {
        facebook: { enabled: true, date: "2026-09-19", time: "09:30" },
        instagram: { enabled: true, date: "2026-09-20", time: "12:15" },
        tiktok: { enabled: false, date: "", time: "09:00" },
      },
    }, state, "2026-09-18T08:00:00.000Z");
    expect(content.schedules.map((schedule) => [schedule.platform, schedule.enabled, schedule.publishAt])).toEqual([
      ["facebook", true, "2026-09-19T09:30:00+07:00"],
      ["instagram", true, "2026-09-20T12:15:00+07:00"],
      ["tiktok", false, null],
    ]);
  });

  it("marks an HTTPS external image as ready for LINE confirmation", () => {
    const state = createEmptyDashboardState();
    const content = dashboardTaskToContent(taskFixture, state, "2026-09-18T08:00:00.000Z");
    const media = dashboardTaskToMedia(taskFixture, "2026-09-18T08:00:00.000Z").map((asset) => ({
      ...asset,
      source: "external" as const,
      mimeType: "image/jpeg",
      externalUrl: "https://cdn.example.test/photo.jpg",
      remoteStatus: "ready" as const,
      providerFileId: null,
    }));
    const result = dashboardTaskFromContent(content, { ...state, contents: [content], media });
    expect(result.assets?.[0]).toMatchObject({ remoteReady: true, previewReady: true });
  });
});
