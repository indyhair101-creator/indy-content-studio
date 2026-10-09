import type { DashboardTask } from "../dashboard-model";

interface TaskDetailDrawerProps {
  task: DashboardTask | null;
  onClose: () => void;
}

export function TaskDetailDrawer({ task, onClose }: TaskDetailDrawerProps) {
  if (!task) return null;

  return (
    <aside className="task-drawer motion-material-surface motion-drawer" role="dialog" aria-modal="false" aria-label={`รายละเอียด ${task.title}`}>
      <div className="task-drawer-heading">
        <div>
          <p className="eyebrow">รายละเอียดงาน</p>
          <h2>{task.title}</h2>
        </div>
        <button type="button" className="drawer-close-button" onClick={onClose} aria-label="ปิดรายละเอียดงาน">×</button>
      </div>

      <div className="drawer-stage">
        <span>ขั้นตอนปัจจุบัน</span>
        <strong>{task.workflowStage ?? "กำลังเตรียมงาน"}</strong>
      </div>

      <section className="drawer-section" aria-labelledby="drawer-production-heading">
        <h3 id="drawer-production-heading">การผลิต</h3>
        <dl>
          <div><dt>รูปแบบ</dt><dd>{[task.owner, task.format, task.category].filter(Boolean).join(" · ") || "ยังไม่ระบุ"}</dd></div>
          <div><dt>เป้าหมาย</dt><dd>{task.objective || "ยังไม่ระบุ"}</dd></div>
          <div><dt>แคปชัน</dt><dd>{task.caption || "ยังไม่ได้เขียนแคปชัน"}</dd></div>
          <div><dt>โน้ต</dt><dd>{task.notes || "ไม่มีโน้ตเพิ่มเติม"}</dd></div>
        </dl>
        <div className="drawer-assets">
          <p className="panel-label">ไฟล์งาน</p>
          {task.assets?.length ? <ul>{task.assets.map((asset) => <li key={`${asset.name}-${asset.size}`}>{asset.name}</li>)}</ul> : <p>ยังไม่ได้แนบไฟล์</p>}
        </div>
      </section>

      <section className="drawer-section" aria-labelledby="drawer-schedule-heading">
        <h3 id="drawer-schedule-heading">กำหนดเผยแพร่</h3>
        <p><time>{task.scheduledTime}</time> · เลือกแพลตฟอร์มเมื่อชิ้นงานพร้อม</p>
      </section>
    </aside>
  );
}
