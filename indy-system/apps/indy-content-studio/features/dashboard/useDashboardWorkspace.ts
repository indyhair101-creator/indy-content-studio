"use client";

import { useCallback, useState } from "react";
import type { DashboardTask } from "./dashboard-model";

function mostRecentUnfinishedTask(tasks: DashboardTask[]) {
  return tasks
    .filter((task) => !task.isComplete)
    .reduce<DashboardTask | undefined>((latest, task) => {
      if (!latest) return task;

      return (task.lastWorkedAt ?? task.scheduledTime) > (latest.lastWorkedAt ?? latest.scheduledTime) ? task : latest;
    }, undefined);
}

export function useDashboardWorkspace(tasks: DashboardTask[]) {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isCreateOpen, setCreateOpen] = useState(false);

  const openTask = useCallback((taskId: string) => setSelectedTaskId(taskId), []);
  const closeTask = useCallback(() => setSelectedTaskId(null), []);
  const resumeLatest = useCallback(() => setSelectedTaskId(mostRecentUnfinishedTask(tasks)?.id ?? null), [tasks]);

  return { selectedTaskId, openTask, closeTask, resumeLatest, isCreateOpen, setCreateOpen };
}
