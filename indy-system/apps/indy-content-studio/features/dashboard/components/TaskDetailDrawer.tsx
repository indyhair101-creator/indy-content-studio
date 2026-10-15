import { useEffect, useState } from "react";
import type { DashboardTask } from "../dashboard-model";
import type { Platform, ProductionStatus } from "../../domain/types";

interface TaskDetailDrawerProps {
  task: DashboardTask | null;
  onClose: () => void;
  onEdit?: () => void;
  onChangeStatus?: (status: ProductionStatus) => Promise<void>;
  onToggleStep?: (stepId: string, done: boolean) => Promise<void>;
}

export const productionStatusOptions: Array<[ProductionStatus, string]> = [
  ["waiting-shoot", "รอถ่าย"],
  ["shot", "ถ่ายแล้ว"],
  ["editing", "ตัดต่อ"],
  ["review", "รอตรวจ"],
  ["needs-changes", "ต้องแก้"],
  ["ready", "พร้อมโพสต์"],
  ["published", "เผยแพร่แล้ว"],
];

const objectiveLabels: Record<string, string> = {
  branding: "สร้างแบรนด์",
  awareness: "เพิ่มการรับรู้",
  lead: "หาลูกค้าเป้าหมาย",
  engagement: "เพิ่มการมีส่วนร่วม",
  sales: "เพิ่มยอดขาย",
};

const platformLabels: Record<Platform, string> = { facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok", salon: "Salon" };

function scheduleSummary(task: DashboardTask): string[] {
  return Object.entries(task.platformSchedules ?? {})
    .filter(([, schedule]) => schedule?.enabled)
    .map(([platform, schedule]) => `${platformLabels[platform as Platform]} · ${schedule!.date || "ยังไม่กำหนดวัน"} ${schedule!.time}`);
}

export function TaskDetailDrawer({ task, onClose, onEdit, onChangeStatus, onToggleStep }: TaskDetailDrawerProps) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setError(null); }, [task?.id]);
  useEffect(() => {
    if (!task) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [task, onClose]);

  if (!task) return null;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try { await action(); } catch (caught) { setError(caught instanceof Error ? caught.message : "บันทึกไม่สำเร็จ ลองอีกครั้ง"); } finally { setBusy(false); }
  }

  const currentStatus = productionStatusOptions.find(([, label]) => label === task.workflowStage)?.[0];
  const schedules = scheduleSummary(task);
  const steps = [...(task.processSteps ?? [])].sort((left, right) => left.order - right.order);

  return (
    <aside className="task-drawer motion-material-surface motion-drawer" role="dialog" aria-modal="false" aria-label={`รายละเอียด ${task.title}`}>
      <div className="task-drawer-heading">
        <h2>{task.title}</h2>
        <button type="button" className="drawer-close-button" onClick={onClose} aria-label="ปิดรายละเอียดงาน">×</button>
      </div>

      {onChangeStatus && currentStatus
        ? <label className="drawer-status-field">สถานะการผลิต
          <select value={currentStatus} disabled={busy} onChange={(event) => void run(() => onChangeStatus(event.target.value as ProductionStatus))}>
            {productionStatusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        : <div className="drawer-stage"><span>ขั้นตอนปัจจุบัน</span><strong>{task.workflowStage ?? "กำลังเตรียมงาน"}</strong></div>}

      {steps.length > 0 && <section className="drawer-section" aria-labelledby="drawer-steps-heading">
        <h3 id="drawer-steps-heading">ขั้นตอนงาน</h3>
        <ul className="drawer-step-list">
          {steps.map((step) => <li key={step.id} className={step.status === "done" ? "is-done" : undefined}>
            <label>
              <input type="checkbox" checked={step.status === "done"} disabled={busy || !onToggleStep} onChange={(event) => { const done = event.target.checked; void run(() => onToggleStep!(step.id, done)); }} />
              <span>{step.name}</span>
              {step.scheduledDate && <small>{step.scheduledDate}</small>}
            </label>
          </li>)}
        </ul>
      </section>}

      {error && <p className="field-error" role="alert">{error}</p>}

      <section className="drawer-section" aria-labelledby="drawer-production-heading">
        <h3 id="drawer-production-heading">รายละเอียด</h3>
        <dl>
          <div><dt>ผู้รับผิดชอบ</dt><dd>{task.owner || "ยังไม่ระบุ"}</dd></div>
          <div><dt>ประเภท · รูปแบบ</dt><dd>{[task.category, task.format].filter(Boolean).join(" · ") || "ยังไม่ระบุ"}</dd></div>
          <div><dt>วันในปฏิทิน</dt><dd><time>{task.scheduledTime}</time></dd></div>
          <div><dt>ช่องทางที่ลง</dt><dd>{schedules.length ? schedules.map((line) => <span key={line} className="drawer-schedule-line">{line}</span>) : "ยังไม่ได้เลือกช่องทาง"}</dd></div>
          <div><dt>เป้าหมาย</dt><dd>{(task.objective && objectiveLabels[task.objective]) || task.objective || "ยังไม่ระบุ"}</dd></div>
          <div><dt>แคปชัน</dt><dd>{task.caption || "ยังไม่ได้เขียนแคปชัน"}</dd></div>
          {task.notes && <div><dt>โน้ต</dt><dd>{task.notes}</dd></div>}
        </dl>
        {task.assets?.length ? <div className="drawer-assets"><p className="panel-label">ไฟล์งาน</p><ul>{task.assets.map((asset) => <li key={`${asset.name}-${asset.size}`}>{asset.name}</li>)}</ul></div> : null}
      </section>

      {onEdit && <div className="drawer-actions"><button type="button" className="create-submit-button" onClick={onEdit}>แก้ไขรายละเอียดทั้งหมด</button></div>}
    </aside>
  );
}
