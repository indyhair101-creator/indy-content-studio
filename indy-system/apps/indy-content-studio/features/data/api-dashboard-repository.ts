import type { DashboardState } from "../domain/types";
import {
  cloneDashboardState,
  type DashboardListener,
  type DashboardRepository,
} from "./dashboard-repository";

interface DashboardStateResponse {
  state: DashboardState;
  version: number;
}

export class ApiDashboardRepository implements DashboardRepository {
  private version: number | null = null;
  private snapshot: DashboardState | null = null;
  private readonly listeners = new Set<DashboardListener>();
  private stopRefreshing: (() => void) | null = null;
  private refreshing = false;

  async read(): Promise<DashboardState> {
    const response = await fetch("/api/dashboard-state", { cache: "no-store" });
    if (!response.ok) throw new Error("โหลดข้อมูลจากเซิร์ฟเวอร์ไม่สำเร็จ");
    const payload = await response.json() as DashboardStateResponse;
    if (this.version !== null && payload.version < this.version && this.snapshot) {
      return cloneDashboardState(this.snapshot);
    }
    this.version = payload.version;
    this.snapshot = cloneDashboardState(payload.state);
    return cloneDashboardState(payload.state);
  }

  async write(next: DashboardState): Promise<DashboardState | void> {
    if (this.version === null) await this.read();
    const response = await fetch("/api/dashboard-state", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ state: next, expectedVersion: this.version }),
    });
    if (response.status === 409) throw new Error("ข้อมูลถูกแก้ไขจากหน้าต่างอื่น กรุณาโหลดใหม่");
    if (!response.ok) throw new Error("บันทึกข้อมูลลงเซิร์ฟเวอร์ไม่สำเร็จ");
    const payload = await response.json() as { version: number; state?: DashboardState };
    if (this.version !== null && payload.version < this.version && this.snapshot) {
      this.listeners.forEach((listener) => listener(cloneDashboardState(this.snapshot!)));
      return cloneDashboardState(this.snapshot);
    }
    this.version = payload.version;
    // Older servers acknowledge only the revision: the caller must refresh in that case.
    if (!payload.state) return;
    const snapshot = cloneDashboardState(payload.state);
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener(cloneDashboardState(snapshot)));
    return cloneDashboardState(snapshot);
  }

  subscribe(listener: DashboardListener): () => void {
    this.listeners.add(listener);
    if (!this.stopRefreshing && typeof window !== "undefined") {
      const refresh = () => { void this.refresh(); };
      const timer = window.setInterval(refresh, 15000);
      window.addEventListener("focus", refresh);
      this.stopRefreshing = () => {
        window.clearInterval(timer);
        window.removeEventListener("focus", refresh);
      };
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) { this.stopRefreshing?.(); this.stopRefreshing = null; }
    };
  }

  private async refresh(): Promise<void> {
    if (this.refreshing || this.listeners.size === 0) return;
    this.refreshing = true;
    const previousVersion = this.version;
    try {
      const state = await this.read();
      if (this.version !== previousVersion) this.listeners.forEach((listener) => listener(cloneDashboardState(state)));
    } catch {
      // A temporary polling failure keeps the last confirmed snapshot; explicit reload still reports errors.
    } finally { this.refreshing = false; }
  }
}
