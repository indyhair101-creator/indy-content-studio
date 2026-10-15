"use client";

import type { RecentCorrection } from "../../line-oa/server/correction-feed";

function timeLabel(iso: string): string {
  return new Intl.DateTimeFormat("th-TH-u-ca-gregory", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export function CorrectionToasts({ alerts, onOpen, onDismiss }: { alerts: RecentCorrection[]; onOpen: (alert: RecentCorrection) => void; onDismiss: (id: string) => void }) {
  if (!alerts.length) return null;
  return (
    <div className="correction-toasts" role="region" aria-label="การแจ้งเตือนงานแก้">
      {alerts.map((alert) => (
        <article key={alert.id} className="correction-toast" role="alert">
          <header>
            <span className="correction-toast-ribbon">มีงานแก้ส่งมา!</span>
            <button type="button" className="correction-toast-close" aria-label="ปิดการแจ้งเตือน" onClick={() => onDismiss(alert.id)}>×</button>
          </header>
          <strong>{alert.contentTitle ?? "งานที่ไม่ได้ระบุชิ้นงาน"}</strong>
          {alert.comment && <p>“{alert.comment}”</p>}
          <footer>
            <time dateTime={alert.receivedAt}>{timeLabel(alert.receivedAt)} น.</time>
            <button type="button" className="correction-toast-open" onClick={() => onOpen(alert)}>ดูงานที่ต้องแก้</button>
          </footer>
        </article>
      ))}
    </div>
  );
}
