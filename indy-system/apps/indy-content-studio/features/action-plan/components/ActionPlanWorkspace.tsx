"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useDashboardData } from "../../data/DashboardDataProvider";
import type { Platform, StepStatus } from "../../domain/types";
import { formatBangkokSchedule } from "../../calendar/schedule-time";
import { addStandaloneActionTask, deleteProcessStep, deleteStandaloneActionTask, rescheduleProcessStep, rescheduleStandaloneActionTask, setProcessStepStatus, setStandaloneActionTaskStatus, updateProcessStep, updateStandaloneActionTask } from "../action-plan-commands";
import { selectActionPlan, selectActionPlanEntries, type ActionPlanEntry } from "../action-plan-selectors";

const WEEKDAYS = ["จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์", "เสาร์", "อาทิตย์"];
const STATUS_LABELS: Record<StepStatus, string> = { todo: "รอทำ", doing: "กำลังทำ", done: "เสร็จแล้ว" };
const PLATFORM_LABELS: Record<Platform, string> = { facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok" };

type ActionStep = ActionPlanEntry;
type ActionDay = ReturnType<typeof selectActionPlan>["days"][number];

function stepKey(step: ActionStep): string {
  return step.kind === "standalone" ? `standalone:${step.id}` : `${step.contentId}:${step.id}`;
}

function publicationScheduleLabel(step: ActionStep): string {
  if (step.kind !== "content-step") return "";
  if (!step.publicationSchedules?.length) return "ยังไม่กำหนดวัน–เวลาโพสต์";

  return step.publicationSchedules.map(({ platform, publishAt }) => {
    try {
      const { date, time } = formatBangkokSchedule(publishAt);
      const dayMonth = new Intl.DateTimeFormat("th-TH", {
        day: "numeric",
        month: "short",
        timeZone: "Asia/Bangkok",
      }).format(new Date(`${date}T00:00:00+07:00`));
      return `${PLATFORM_LABELS[platform]} · ${dayMonth} ${time}`;
    } catch {
      return `${PLATFORM_LABELS[platform]} · ตรวจวันเวลา`;
    }
  }).join("  |  ");
}

function calendarRows(days: ActionDay[], mode: "week" | "month"): (ActionDay | null)[][] {
  const firstWeekday = mode === "month" && days.length
    ? (new Date(`${days[0].date}T00:00:00Z`).getUTCDay() + 6) % 7
    : 0;
  const cells: (ActionDay | null)[] = [...Array.from({ length: firstWeekday }, () => null), ...days];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7));
}

export function ActionPlanWorkspace() {
  const dashboard = useDashboardData();
  const [mode, setMode] = useState<"today" | "week" | "month">("today");
  const [anchor, setAnchor] = useState(new Date().toISOString().slice(0, 10));
  const [selectedDate, setSelectedDate] = useState(anchor);
  const [quickTitle, setQuickTitle] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [pendingSuggestion, setPendingSuggestion] = useState<string | null>(null);
  const [optimisticStatuses, setOptimisticStatuses] = useState<Record<string, StepStatus>>({});
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [selectedOwner, setSelectedOwner] = useState("");
  const [quickOwner, setQuickOwner] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editSavingKey, setEditSavingKey] = useState<string | null>(null);
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const ownerOptions = dashboard.state?.ownerOptions ?? [];
  const ownerFilter = ownerOptions.includes(selectedOwner) ? selectedOwner : "";
  const filters = ownerFilter ? { owner: ownerFilter } : undefined;
  const view = useMemo(
    () => dashboard.state ? selectActionPlan(dashboard.state, { mode: mode === "today" ? "week" : mode, anchorDate: anchor, filters }) : null,
    [dashboard.state, mode, anchor, ownerFilter],
  );

  const allEntries = useMemo(() => dashboard.state ? selectActionPlanEntries(dashboard.state, filters) : [], [dashboard.state, ownerFilter]);

  if (!view) return <section><h1>Action Plan</h1><p>กำลังโหลดข้อมูล…</p></section>;

  const selectedDay = view.days.find((day) => day.date === selectedDate) ?? view.days[0];
  const rows = calendarRows(view.days, mode === "month" ? "month" : "week");
  const effectiveStatus = (step: ActionStep) => optimisticStatuses[stepKey(step)] ?? step.status;
  const todaySteps = allEntries.filter((step) => step.scheduledDate === anchor);
  const suggestions = allEntries.filter((step) => step.scheduledDate !== anchor && effectiveStatus(step) !== "done");
  const overdue = suggestions.filter((step) => step.scheduledDate && step.scheduledDate < anchor);
  const unscheduled = suggestions.filter((step) => !step.scheduledDate);
  const upcoming = suggestions.filter((step) => step.scheduledDate && step.scheduledDate > anchor);

  async function addQuickTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!quickTitle.trim() || !quickOwner || isAdding) return;
    setIsAdding(true);
    setSaveError(null);
    try {
      await dashboard.mutate((state) => addStandaloneActionTask(state, {
        title: quickTitle, date: anchor, owner: quickOwner, id: `content-${crypto.randomUUID()}`, now: new Date().toISOString(),
      }));
      setQuickTitle("");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "เพิ่มงานไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally {
      setIsAdding(false);
    }
  }

  async function addSuggestion(step: ActionStep) {
    const key = stepKey(step);
    setPendingSuggestion(key);
    setSaveError(null);
    try {
      await dashboard.mutate((state) => step.kind === "standalone"
        ? rescheduleStandaloneActionTask(state, step.id, anchor, new Date().toISOString())
        : rescheduleProcessStep(state, step.contentId!, step.id, anchor, new Date().toISOString()));
    } catch {
      setSaveError("เพิ่มงานเข้าวันนี้ไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally {
      setPendingSuggestion(null);
    }
  }

  async function updateStatus(step: ActionStep, status: StepStatus) {
    const key = stepKey(step);
    setPendingKey(key);
    setSaveError(null);
    setOptimisticStatuses((current) => ({ ...current, [key]: status }));
    try {
      await dashboard.mutate((state) => step.kind === "standalone"
        ? setStandaloneActionTaskStatus(state, step.id, status, new Date().toISOString())
        : setProcessStepStatus(state, step.contentId!, step.id, status, new Date().toISOString()));
    } catch {
      setSaveError("บันทึกสถานะไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally {
      setOptimisticStatuses((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      setPendingKey(null);
    }
  }

  function displayName(step: ActionStep): string {
    return step.kind === "standalone" ? step.name : `${step.name} — ${step.contentTitle}`;
  }

  function startEditing(step: ActionStep) {
    setEditingKey(stepKey(step));
    setEditName(step.name);
    setEditDate(step.scheduledDate ?? "");
    setConfirmDeleteKey(null);
    setSaveError(null);
  }

  function cancelEditing() {
    setEditingKey(null);
    setEditName("");
    setEditDate("");
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>, step: ActionStep) {
    event.preventDefault();
    const key = stepKey(step);
    if (editSavingKey === key) return;
    setEditSavingKey(key);
    setSaveError(null);
    try {
      await dashboard.mutate((state) => step.kind === "standalone"
        ? updateStandaloneActionTask(state, step.id, { title: editName, scheduledDate: editDate, now: new Date().toISOString() })
        : updateProcessStep(state, step.contentId!, step.id, { name: editName, scheduledDate: editDate || null, now: new Date().toISOString() }));
      cancelEditing();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "แก้ไขงานไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally {
      setEditSavingKey(null);
    }
  }

  async function deleteStep(step: ActionStep) {
    const key = stepKey(step);
    if (deletingKey === key) return;
    setDeletingKey(key);
    setSaveError(null);
    try {
      await dashboard.mutate((state) => step.kind === "standalone"
        ? deleteStandaloneActionTask(state, step.id)
        : deleteProcessStep(state, step.contentId!, step.id));
      setConfirmDeleteKey(null);
      if (editingKey === key) cancelEditing();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "ลบงานไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally {
      setDeletingKey(null);
    }
  }

  function renderStep(step: ActionStep) {
    const key = stepKey(step);
    const status = effectiveStatus(step);
    const label = displayName(step);
    const isEditing = editingKey === key;
    const isConfirmingDelete = confirmDeleteKey === key;
    return (
      <li key={key} className={`action-step-row is-${status}`}>
        <div className="action-step-main">
          <label>
            <input
              type="checkbox"
              aria-label={step.kind === "standalone" ? `ทำเสร็จ ${step.name}` : `ทำเสร็จ ${step.name} — ${step.contentTitle}`}
              checked={status === "done"}
              disabled={pendingKey === key}
              onChange={(event) => void updateStatus(step, event.target.checked ? "done" : "todo")}
            />
            <span><strong>{step.name}</strong>{step.kind === "content-step" && <><small>{step.contentTitle}</small><small className="action-step-schedule">{publicationScheduleLabel(step)}</small></>}</span>
          </label>
          <span className="action-step-status">{STATUS_LABELS[status]}</span>
          {status === "todo" && <button type="button" disabled={pendingKey === key} onClick={() => void updateStatus(step, "doing")}>เริ่มทำ</button>}
          <div className="action-step-actions" aria-label={`จัดการ ${label}`}>
            <button type="button" className="action-step-edit-button" aria-label={`แก้ไข ${label}`} onClick={() => startEditing(step)}>แก้ไข</button>
            <button type="button" className="action-step-delete-button" aria-label={`ลบ ${label}`} onClick={() => { setConfirmDeleteKey(key); setEditingKey(null); }}>ลบ</button>
          </div>
        </div>
        {isEditing && <form className="action-step-editor" onSubmit={(event) => void saveEdit(event, step)}>
          <label><span>{step.kind === "standalone" ? "ชื่องาน" : "ชื่อขั้นตอน"}</span><input type="text" aria-label={`${step.kind === "standalone" ? "แก้ไขชื่องาน" : "แก้ไขชื่อขั้นตอน"} ${label}`} value={editName} onChange={(event) => setEditName(event.target.value)} /></label>
          <label><span>วันที่</span><input type="date" aria-label={`${step.kind === "standalone" ? "แก้ไขวันที่งาน" : "แก้ไขวันที่ขั้นตอน"} ${label}`} value={editDate} onChange={(event) => setEditDate(event.target.value)} /></label>
          <div className="action-step-editor-actions"><button type="submit" className="action-step-save-button" disabled={editSavingKey === key}>{editSavingKey === key ? "กำลังบันทึก…" : `บันทึก${step.kind === "standalone" ? "งาน" : "ขั้นตอน"} ${label}`}</button><button type="button" className="action-step-cancel-button" onClick={cancelEditing}>ยกเลิก</button></div>
        </form>}
        {isConfirmingDelete && <div className="action-step-delete-confirmation" role="group" aria-label={`ยืนยันการลบ ${label}`}><span>ลบ “{label}” ใช่ไหม?</span><button type="button" className="action-step-confirm-delete-button" aria-label={`ยืนยันลบ ${label}`} disabled={deletingKey === key} onClick={() => void deleteStep(step)}>ยืนยันลบ</button><button type="button" className="action-step-cancel-button" onClick={() => setConfirmDeleteKey(null)}>ยกเลิก</button></div>}
      </li>
    );
  }

  function renderSuggestions(title: string, steps: ActionStep[]) {
    if (!steps.length) return null;
    return <section className="action-suggestion-group" aria-label={title} key={title}>
      <h3>{title}</h3>
      <ul>{steps.map((step) => <li key={stepKey(step)}>
        <span className="action-suggestion-circle" aria-hidden="true" />
        <span className="action-suggestion-copy"><strong>{step.name}</strong><small>{step.kind === "standalone" ? "งานทั่วไป" : step.contentTitle}{step.scheduledDate ? ` · ${step.scheduledDate}` : ""}</small>{step.kind === "content-step" && <small className="action-step-schedule">{publicationScheduleLabel(step)}</small>}</span>
        <button type="button" aria-label={`เพิ่มเข้าวันนี้ ${step.name}${step.kind === "content-step" ? ` — ${step.contentTitle}` : ""}`} disabled={pendingSuggestion === stepKey(step)} onClick={() => void addSuggestion(step)}>+</button>
      </li>)}</ul>
    </section>;
  }

  return (
    <section className="action-plan-workspace" aria-labelledby="action-plan-heading">
      <div className="workspace-heading-row">
        <div><p className="eyebrow">INDY / ACTION PLAN</p><h1 id="action-plan-heading">Action Plan</h1></div>
        <div className="action-plan-view-toggle" role="group" aria-label="มุมมอง Action Plan">
          <button type="button" aria-pressed={mode === "today"} onClick={() => setMode("today")}>วันนี้</button>
          <button type="button" aria-pressed={mode === "week"} onClick={() => setMode("week")}>สัปดาห์</button>
          <button type="button" aria-pressed={mode === "month"} onClick={() => setMode("month")}>เดือน</button>
        </div>
      </div>

      <div className="action-plan-toolbar">
        <label>วันที่อ้างอิง<input type="date" value={anchor} onChange={(event) => {
          if (!event.target.value) return;
          setAnchor(event.target.value);
          setSelectedDate(event.target.value);
        }} /></label>
        <label className="action-plan-owner-filter">ผู้รับผิดชอบ<select aria-label="กรองผู้รับผิดชอบ" value={ownerFilter} onChange={(event) => { setSelectedOwner(event.target.value); setQuickOwner(event.target.value); }}>
          <option value="">รวมทุกคน</option>
          {ownerOptions.map((owner) => <option key={owner} value={owner}>{owner}</option>)}
        </select></label>
        <div className="action-summary" aria-label="สรุปสถานะขั้นตอน">
          <span>รอทำ <strong>{view.summary.todo}</strong></span>
          <span>กำลังทำ <strong>{view.summary.doing}</strong></span>
          <span>เสร็จแล้ว <strong>{view.summary.done}</strong></span>
        </div>
      </div>

      {mode === "today" ? <div className="action-today-layout">
        <section className="action-today-main" role="region" aria-label="งานของวันที่เลือก">
          <div className="action-today-heading"><div><p className="eyebrow">MY DAY / ACTION PLAN</p><h2>วันของฉัน</h2><p>เลือกงานที่ต้องโฟกัส แล้วติ๊กเมื่อทำเสร็จ</p></div><span>{anchor}</span></div>
          <form className="action-quick-add" onSubmit={(event) => void addQuickTask(event)}>
            <span aria-hidden="true">○</span>
            <input type="text" aria-label="เพิ่มงานทั่วไป" placeholder="เพิ่มงานทั่วไป เช่น ถ่ายรูป หรือซื้อของ" value={quickTitle} onChange={(event) => setQuickTitle(event.target.value)} disabled={isAdding} />
            <label className="action-quick-add-owner">สร้างในชื่อ<select aria-label="ผู้รับผิดชอบงานใหม่" value={quickOwner} onChange={(event) => setQuickOwner(event.target.value)} disabled={isAdding}>
              <option value="">เลือกชื่อ</option>
              {ownerOptions.map((owner) => <option key={owner} value={owner}>{owner}</option>)}
            </select></label>
            <button type="submit" disabled={isAdding || !quickTitle.trim() || !quickOwner}>{isAdding ? "กำลังเพิ่ม…" : "เพิ่มงาน"}</button>
          </form>
          {todaySteps.length > 0
            ? <ul className="action-step-list action-today-list">{todaySteps.map(renderStep)}</ul>
            : <p className="action-plan-empty">ยังไม่มีงานในวันนี้ เพิ่มงานหรือเลือกจากคำแนะนำได้เลย</p>}
        </section>
        <aside className="action-today-suggestions" role="region" aria-label="คำแนะนำ">
          <div className="action-suggestions-heading"><div><p className="eyebrow">NEXT UP</p><h2>คำแนะนำ</h2></div><span>{suggestions.length} งาน</span></div>
          {renderSuggestions("ค้างจากวันก่อน", overdue)}
          {renderSuggestions("ยังไม่กำหนดวัน", unscheduled)}
          {renderSuggestions("วันถัดไป", upcoming)}
          {suggestions.length === 0 && <p className="action-plan-empty">ไม่มีงานค้างให้เพิ่มในวันนี้</p>}
        </aside>
      </div> : <>
      <div className={`action-calendar action-calendar--${mode}`} role="grid" aria-label="ปฏิทิน Action Plan">
        <div className="action-calendar-row action-calendar-weekdays" role="row">
          {WEEKDAYS.map((weekday) => <span key={weekday} role="columnheader">{weekday}</span>)}
        </div>
        {rows.map((row, rowIndex) => (
          <div key={rowIndex} className="action-calendar-row" role="row">
            {row.map((day, columnIndex) => (
              <div key={day?.date ?? `empty-${columnIndex}`} role="gridcell" className="action-calendar-cell">
                {day && <button
                  type="button"
                  aria-label={`เลือกวันที่ ${day.date}`}
                  aria-pressed={selectedDay?.date === day.date}
                  className={`action-calendar-day${day.steps.some((step) => effectiveStatus(step) === "done") ? " has-done" : ""}`}
                  onClick={() => setSelectedDate(day.date)}
                >
                  <span className="action-calendar-day-number">{day.date.slice(-2)}</span>
                  {day.steps.length > 0 && <span className="action-calendar-count">{day.steps.length} งาน</span>}
                  {mode === "week" && day.steps.slice(0, 2).map((step) => <span key={stepKey(step)} className={`action-calendar-step is-${effectiveStatus(step)}`}>{step.name}</span>)}
                  {mode === "week" && day.steps.length > 2 && <small>+{day.steps.length - 2} งาน</small>}
                </button>}
              </div>
            ))}
          </div>
        ))}
      </div>

      <section className="action-day-detail" aria-labelledby="action-selected-day-heading">
        <div className="action-day-detail-heading">
          <div><p className="eyebrow">เช็กลิสต์ประจำวัน</p><h2 id="action-selected-day-heading">{selectedDay?.date ?? anchor}</h2></div>
          <span>{selectedDay?.steps.length ?? 0} ขั้นตอน</span>
        </div>
        {selectedDay?.steps.length
          ? <ul className="action-step-list">{selectedDay.steps.map(renderStep)}</ul>
          : <p className="action-plan-empty">วันนี้ยังไม่มีขั้นตอนงาน</p>}
      </section>

      <section className="action-unscheduled" aria-labelledby="action-unscheduled-heading">
        <div className="action-day-detail-heading"><h2 id="action-unscheduled-heading">ยังไม่กำหนดวัน</h2><span>{view.unscheduled.length} ขั้นตอน</span></div>
        {view.unscheduled.length > 0 && <ul className="action-step-list">{view.unscheduled.map(renderStep)}</ul>}
      </section>
      </>}
      {saveError && <p className="action-plan-error" role="alert">{saveError}</p>}
    </section>
  );
}
