"use client";

import { useState } from "react";
import { useDashboardData } from "../../data/DashboardDataProvider";
import type { ContentItem } from "../../domain/types";
import { AccessibleDialog } from "../../shared/components/AccessibleDialog";
import { createRecurringCopiesInRange, getRecurringCopyDatesInRange, getSuggestedCopyStartDate, type CopyCadence } from "../content-recurrence";

function nextContentId(sourceId: string, index: number) {
  return `${sourceId}-copy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${index}`;
}

export function RecurringCopyDialog({ content, onClose, onCopied }: {
  content: ContentItem;
  onClose: () => void;
  onCopied: (count: number) => void;
}) {
  const dashboard = useDashboardData();
  const [startDate, setStartDate] = useState(() => getSuggestedCopyStartDate(content));
  const [endDate, setEndDate] = useState(() => getSuggestedCopyStartDate(content));
  const [cadence, setCadence] = useState<CopyCadence>("daily");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  let copyDates: string[] = [];
  let rangeError: string | null = null;
  if (startDate && endDate) {
    try { copyDates = getRecurringCopyDatesInRange(startDate, endDate, cadence); }
    catch (caught) { rangeError = caught instanceof Error ? caught.message : "ช่วงวันที่ไม่ถูกต้อง"; }
  }

  async function confirmCopy() {
    if (!content || !copyDates.length || isSaving) return;
    const now = new Date().toISOString();
    setIsSaving(true);
    setError(null);
    try {
      await dashboard.mutate((state) => createRecurringCopiesInRange(state, content.id, { startDate, endDate, cadence }, now, (index) => nextContentId(content.id, index)));
      onCopied(copyDates.length);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "สร้างสำเนาไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setIsSaving(false);
    }
  }

  return <AccessibleDialog labelledBy="recurring-copy-heading" onClose={onClose}>
    <div className="workspace-heading-row">
      <div><h2 id="recurring-copy-heading">คัดลอกสำเนา</h2></div>
      <button type="button" data-dialog-initial-focus aria-label="ปิดหน้าต่างคัดลอกสำเนา" onClick={onClose}>×</button>
    </div>
    <p>คอนเทนต์ต้นฉบับ: <strong>{content.title}</strong></p>
    <label>วันที่เริ่มคัดลอก<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
    <label>วันที่สิ้นสุด<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
    <label>รูปแบบการทำซ้ำ<select value={cadence} onChange={(event) => setCadence(event.target.value as CopyCadence)}><option value="daily">ทุกวัน</option><option value="every-other-day">วันเว้นวัน</option><option value="weekdays">จันทร์–ศุกร์</option></select></label>
    {error ? <p role="alert">{error}</p> : rangeError ? <p role="alert">{rangeError}</p> : copyDates.length ? <p role="status">จะสร้างสำเนา {copyDates.length} รายการ · {copyDates[0]} ถึง {copyDates.at(-1)}</p> : <p className="editor-helper">เลือกวันที่เริ่มต้นและสิ้นสุดเพื่อดูจำนวนสำเนา</p>}
    <div className="settings-dialog-actions"><button className="content-copy-confirm" type="button" onClick={() => void confirmCopy()} disabled={isSaving || copyDates.length === 0}>{isSaving ? "กำลังคัดลอก…" : "ยืนยันการคัดลอก"}</button></div>
  </AccessibleDialog>;
}
