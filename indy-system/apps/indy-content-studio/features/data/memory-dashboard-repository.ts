import { createEmptyDashboardState } from "../domain/create-empty-state";
import type { DashboardState } from "../domain/types";
import {
  cloneDashboardState,
  type DashboardListener,
  type DashboardRepository,
} from "./dashboard-repository";

export class MemoryDashboardRepository implements DashboardRepository {
  private snapshot: DashboardState;
  private readonly listeners = new Set<DashboardListener>();

  constructor(initialState: DashboardState = createEmptyDashboardState()) {
    this.snapshot = cloneDashboardState(initialState);
  }

  async read(): Promise<DashboardState> {
    return cloneDashboardState(this.snapshot);
  }

  async write(next: DashboardState): Promise<void> {
    this.snapshot = cloneDashboardState(next);
    const publishedSnapshot = cloneDashboardState(this.snapshot);
    this.listeners.forEach((listener) => listener(publishedSnapshot));
  }

  subscribe(listener: DashboardListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
