import { describe, expect, it } from "vitest";
import { sortTasksForToday, type DashboardTask } from "../features/dashboard/dashboard-model";

describe("sortTasksForToday", () => {
  it("places higher-priority tasks first and orders equal priorities by scheduled time", () => {
    const tasks: DashboardTask[] = [
      { id: "later", title: "Later urgent task", priority: "urgent", scheduledTime: "15:00" },
      { id: "early", title: "Early urgent task", priority: "urgent", scheduledTime: "09:00" },
      { id: "normal", title: "Normal task", priority: "normal", scheduledTime: "08:00" },
      { id: "high", title: "High priority task", priority: "high", scheduledTime: "08:30" },
    ];

    expect(sortTasksForToday(tasks).map((task) => task.id)).toEqual([
      "early",
      "later",
      "high",
      "normal",
    ]);
  });
});
