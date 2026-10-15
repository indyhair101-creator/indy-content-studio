import { createEmptyDashboardState } from "../domain/create-empty-state";
import type { DashboardState } from "../domain/types";
import type { DashboardListener, DashboardRepository } from "../data/dashboard-repository";
import { validateReportingState } from "./report-schema";
import { emptyReportingState, type ReportingState } from "./report-types";

const CACHE_KEY = "indy-content-insights-recovery-v1";

/** A report-only fallback, never a replacement snapshot for the shared work database. */
export class ReportRecoveryRepository implements DashboardRepository {
  private reporting = emptyReportingState();
  private listeners = new Set<DashboardListener>();
  storageWarning: string | null = null;

  async read(): Promise<DashboardState> {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached && !this.storageWarning) this.reporting = validateReportingState(JSON.parse(cached));
    } catch {
      this.storageWarning = "อ่านรายงานที่เก็บในเบราว์เซอร์ไม่ได้ กดดึงข้อมูลใหม่ได้โดยไม่กระทบข้อมูลเดิม";
    }
    return this.snapshot();
  }

  async write(next: DashboardState): Promise<DashboardState> {
    const reporting = validateReportingState(next.reporting);
    // Do not persist tasks, tokens or integration credentials through this repository.
    this.reporting = structuredClone(reporting);
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(reporting));
      this.storageWarning = null;
    } catch {
      this.storageWarning = "พื้นที่เบราว์เซอร์ไม่พร้อม เก็บได้เฉพาะหน้านี้ กรุณาส่งออก CSV หรือ PDF ก่อนปิดหน้า";
    }
    const snapshot = this.snapshot();
    this.listeners.forEach(listener => listener(structuredClone(snapshot)));
    return snapshot;
  }

  subscribe(listener: DashboardListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private snapshot(): DashboardState {
    const reporting: ReportingState = structuredClone(this.reporting);
    // No calendar metadata is available in this mode; don't hide linked posts or invent owners.
    reporting.publications = reporting.publications.map(post => ({ ...post, contentId: null }));
    return { ...createEmptyDashboardState(), ownerOptions: [], categories: [], formats: [], reporting };
  }
}
