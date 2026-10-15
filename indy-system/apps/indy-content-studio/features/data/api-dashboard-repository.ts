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
  private snapshotVersion: number | null = null;
  private readonly listeners = new Set<DashboardListener>();

  async read(): Promise<DashboardState> {
    const response = await fetch("/api/dashboard-state", { cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (response.status === 401) throw new Error("เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง");
    if (!response.ok) throw new Error("โหลดข้อมูลจากเซิร์ฟเวอร์ไม่สำเร็จ");
    const payload = await response.json() as DashboardStateResponse;
    if (this.version !== null && payload.version < this.version) {
      if (this.snapshot && this.snapshotVersion === this.version) return cloneDashboardState(this.snapshot);
      // A revision-only acknowledgement does not confirm the older cached contents.
      throw new Error("ยังโหลดข้อมูลล่าสุดหลังบันทึกไม่ได้ กรุณาโหลดใหม่");
    }
    this.version = payload.version;
    this.snapshot = cloneDashboardState(payload.state);
    this.snapshotVersion = payload.version;
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
    if (this.version !== null && payload.version < this.version) {
      if (this.snapshot && this.snapshotVersion === this.version) {
        this.listeners.forEach((listener) => listener(cloneDashboardState(this.snapshot!)));
        return cloneDashboardState(this.snapshot);
      }
      return;
    }
    this.version = payload.version;
    // Older servers acknowledge only the revision: the caller must refresh in that case.
    if (!payload.state) return;
    const snapshot = cloneDashboardState(payload.state);
    this.snapshot = snapshot;
    this.snapshotVersion = payload.version;
    this.listeners.forEach((listener) => listener(cloneDashboardState(snapshot)));
    return cloneDashboardState(snapshot);
  }

  subscribe(listener: DashboardListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
}
