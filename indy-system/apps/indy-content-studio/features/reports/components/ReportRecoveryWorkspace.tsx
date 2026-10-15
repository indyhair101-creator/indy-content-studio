"use client";

import { useState } from "react";
import { DashboardDataProvider, useDashboardData } from "../../data/DashboardDataProvider";
import { ReportRecoveryRepository } from "../report-recovery-repository";
import { InsightsReportWorkspace } from "./InsightsReportWorkspace";
import { ReportConnectionsPanel } from "./ReportConnectionsPanel";
import { ReportActions, SavedReportsPanel } from "./SavedReportsPanel";

function RecoveryView({ repository }: { repository: ReportRecoveryRepository }) {
  useDashboardData(); // Re-render the storage notice after a read/save.
  return <>
    <section className="report-panel" role="status">
      <strong>ดูข้อมูลเชิงลึกได้โดยไม่รอฐานข้อมูลงาน</strong>
      <p>ดึงตัวเลขจากบัญชีโซเชียลที่เชื่อมไว้เมื่อกดปุ่มเท่านั้น รายงานนี้เก็บเฉพาะในเบราว์เซอร์นี้ ไม่ได้บันทึกเข้าฐานข้อมูลกลาง และไม่เปลี่ยนข้อมูลปฏิทินหรือ Action Plan</p>
      <p>เมื่อกลับมาเปิดจะเห็นข้อมูลที่เก็บไว้พร้อมเวลาที่ดึงล่าสุด การจับคู่ผู้รับผิดชอบและรายงานทีมต้องรอฐานข้อมูลงานพร้อมใช้งาน</p>
      {repository.storageWarning && <p role="alert">{repository.storageWarning}</p>}
    </section>
    <InsightsReportWorkspace
      renderActions={filters => <ReportActions kind="content" filters={filters} />}
      renderSaved={() => <SavedReportsPanel kind="content" />}
      renderSources={filters => <ReportConnectionsPanel range={filters.range} />}
    />
  </>;
}

export function ReportRecoveryWorkspace() {
  const [repository] = useState(() => new ReportRecoveryRepository());
  return <DashboardDataProvider repository={repository}><RecoveryView repository={repository} /></DashboardDataProvider>;
}
