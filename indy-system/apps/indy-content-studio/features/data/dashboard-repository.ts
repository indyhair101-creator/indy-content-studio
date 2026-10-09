import type { DashboardState } from "../domain/types";
import { DEFAULT_OWNER_OPTIONS } from "../domain/create-empty-state";

export type DashboardListener = (state: DashboardState) => void;

export interface DashboardRepository {
  read(): Promise<DashboardState>;
  write(next: DashboardState): Promise<void>;
  subscribe(listener: DashboardListener): () => void;
}

export function cloneDashboardState(state: DashboardState): DashboardState {
  const snapshot = typeof structuredClone === "function"
    ? structuredClone(state)
    : JSON.parse(JSON.stringify(state)) as DashboardState;
  // Older IndexedDB snapshots predate standalone Action Plan tasks.
  if (!Array.isArray(snapshot.actionTasks)) snapshot.actionTasks = [];
  // Older snapshots predate category-specific monthly targets.
  if (!Array.isArray(snapshot.categoryMonthlyGoals)) snapshot.categoryMonthlyGoals = [];
  // Older snapshots predate editable content-owner options.
  if (!Array.isArray(snapshot.ownerOptions)) snapshot.ownerOptions = [...DEFAULT_OWNER_OPTIONS];
  return snapshot;
}
