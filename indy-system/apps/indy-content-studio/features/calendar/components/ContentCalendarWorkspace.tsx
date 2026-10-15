"use client";

import { useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import type { ContentItem, Platform } from "../../domain/types";
import { useDashboardData } from "../../data/DashboardDataProvider";
import { buildCalendarMonth, type CalendarEvent, type CalendarPlatformFilter } from "../calendar-selectors";
import { moveContentSchedules, movePlatformSchedule, setCalendarContentStatus } from "../calendar-commands";
import { ContentEditorDialog } from "../../content/components/ContentEditorDialog";
import { RecurringCopyDialog } from "../../content/components/RecurringCopyDialog";
import { softDeleteContent } from "../../content/content-trash-commands";

type CalendarItemStatus = "not-started" | "in-progress" | "sent";
type DraggedCalendarItem = { contentId: string; platform: Platform | null };

const CALENDAR_STATUS_LABELS: Record<CalendarItemStatus, string> = {
  "not-started": "ยังไม่ได้ทำ",
  "in-progress": "กำลังทำ",
  sent: "ส่งแล้ว",
};
const platformLabels: Record<Platform, string> = { facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok", salon: "Salon" };
const platformShortLabels: Record<Platform, string> = { facebook: "FB", instagram: "IG", tiktok: "TIKTOK", salon: "SALON" };

function getCalendarItemStatus(item: ContentItem): CalendarItemStatus {
  if (item.productionStatus === "published" || item.schedules.some((schedule) => Boolean(schedule.manualEvidence))) return "sent";
  return item.productionStatus === "waiting-shoot" ? "not-started" : "in-progress";
}

function eventStatus(event: CalendarEvent): CalendarItemStatus {
  if (event.status === "published") return "sent";
  return event.status === "not-started" ? "not-started" : "in-progress";
}

function getCalendarStatusLabel(content: ContentItem, event: CalendarEvent | undefined, status: CalendarItemStatus): string {
  if (content.productionStatus === "published") return "ทำเสร็จแล้ว / ลงเองแล้ว";
  if (event?.status === "published") return "โพสต์แล้ว";
  if (content.lineReview.status === "correction-requested" || content.productionStatus === "needs-changes") return "ต้องแก้ไข";
  if (content.lineReview.status === "sent") return "ส่งตรวจ LINE แล้ว";
  if (content.lineReview.status === "approved" && content.productionStatus === "ready") return "Final พร้อมส่ง Make";
  if (content.productionStatus === "ready") return "พร้อม Final";
  return CALENDAR_STATUS_LABELS[status];
}

function shiftMonth(month: string, offset: number) {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return new Date().toISOString().slice(0, 7);
  const absoluteMonth = Number(match[1]) * 12 + Number(match[2]) - 1 + offset;
  const year = Math.floor(absoluteMonth / 12);
  const monthNumber = ((absoluteMonth % 12) + 12) % 12 + 1;
  return `${year}-${String(monthNumber).padStart(2, "0")}`;
}

export function ContentCalendarWorkspace({ onCreateTask }: { onCreateTask: (date?: string) => void }) {
  const dashboard = useDashboardData();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [platform, setPlatform] = useState<CalendarPlatformFilter>("all");
  const [owner, setOwner] = useState("");
  const [selectionBusy, setSelectionBusy] = useState(false);
  const [selectionMessage, setSelectionMessage] = useState<string | null>(null);
  const selectionLock = useRef(false);
  const [draggedItem, setDraggedItem] = useState<DraggedCalendarItem | null>(null);
  const [editingContentId, setEditingContentId] = useState<string | null>(null);
  const [selectedContentIds, setSelectedContentIds] = useState<Set<string>>(() => new Set());
  const [copySourceContentId, setCopySourceContentId] = useState<string | null>(null);
  const [dropTargetDate, setDropTargetDate] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const lastDragEndAt = useRef(0);
  const view = useMemo(() => dashboard.state ? buildCalendarMonth(dashboard.state, { month, platform, owner }) : null, [dashboard.state, month, platform, owner]);
  const ownerOptions = useMemo(() => dashboard.state ? [...new Set([
    ...dashboard.state.ownerOptions,
    ...dashboard.state.contents.filter((item) => !item.deletedAt).map((item) => item.owner),
  ])].filter((name) => name.trim()).sort((left, right) => left.localeCompare(right, "th")) : [], [dashboard.state]);
  const copySourceContent = copySourceContentId ? dashboard.state?.contents.find((item) => item.id === copySourceContentId && !item.deletedAt) ?? null : null;

  if (!view) return <section><h1>ปฏิทินคอนเทนต์</h1><p>กำลังโหลดข้อมูล…</p></section>;

  async function moveItemToDate(item: DraggedCalendarItem, date: string) {
    setMoveError(null);
    try {
      await dashboard.mutate((state) => item.platform
        ? movePlatformSchedule(state, item.contentId, item.platform, date, new Date().toISOString())
        : moveContentSchedules(state, item.contentId, date, ["facebook", "instagram", "tiktok", "salon"], new Date().toISOString()));
    } catch {
      setMoveError("ย้ายวันไม่สำเร็จ กรุณาตรวจว่าคิวที่ส่ง Make แล้วถูกยกเลิกก่อนหรือยัง");
    } finally {
      setDraggedItem(null);
      setDropTargetDate(null);
    }
  }

  function startDragging(event: DragEvent<HTMLElement>, item: DraggedCalendarItem) {
    event.dataTransfer.setData("text/plain", `${item.contentId}|${item.platform ?? ""}`);
    event.dataTransfer.effectAllowed = "move";
    setDraggedItem(item);
  }

  function dropOnDate(event: DragEvent<HTMLDivElement>, date: string) {
    event.preventDefault();
    const [contentId, selectedPlatform] = (event.dataTransfer.getData("text/plain") || "|").split("|");
    const item = contentId ? { contentId, platform: (selectedPlatform || null) as Platform | null } : draggedItem;
    if (item) void moveItemToDate(item, date);
  }

  function openEditor(contentId: string) {
    setEditingContentId(contentId);
    setMoveError(null);
  }

  function handleCardKeyDown(event: KeyboardEvent<HTMLElement>, contentId: string) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openEditor(contentId);
  }

  function setContentSelection(contentId: string, selected: boolean) {
    if (selectionLock.current) return;
    setSelectedContentIds((current) => {
      const next = new Set(current);
      if (selected) next.add(contentId);
      else next.delete(contentId);
      return next;
    });
  }

  async function deleteSelectedContent() {
    if (selectedContentIds.size === 0 || selectionLock.current) return;
    const count = selectedContentIds.size;
    if (!window.confirm(`ลบคอนเทนต์ที่เลือก ${count} รายการหรือไม่`)) return;

    const ids = [...selectedContentIds];
    selectionLock.current = true;
    setSelectionBusy(true);
    setMoveError(null);
    setSelectionMessage(null);
    try {
      await dashboard.mutate((state) => ids.reduce((nextState, contentId) => softDeleteContent(nextState, contentId, new Date().toISOString()), state));
      setSelectedContentIds(new Set());
    } catch {
      setMoveError("ลบรายการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      selectionLock.current = false;
      setSelectionBusy(false);
    }
  }

  function changeCalendarFilter(change: () => void) {
    change();
    setSelectedContentIds(new Set());
    setSelectionMessage(null);
    setMoveError(null);
  }

  async function changeSelectedStatus(status: "editing" | "published") {
    if (selectedContentIds.size === 0 || selectionLock.current) return;
    const ids = [...selectedContentIds];
    selectionLock.current = true;
    setSelectionBusy(true);
    setMoveError(null);
    setSelectionMessage(null);
    try {
      await dashboard.mutate((state) => setCalendarContentStatus(state, ids, status, new Date().toISOString()));
      setSelectedContentIds(new Set());
      setSelectionMessage(`บันทึก ${ids.length} รายการ: ${status === "editing" ? "กำลังทำ" : "ทำเสร็จแล้ว / ลงเองแล้ว"}`);
    } catch (error) {
      setMoveError(error instanceof Error ? error.message : "เปลี่ยนสถานะไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      selectionLock.current = false;
      setSelectionBusy(false);
    }
  }

  function renderCard(content: ContentItem, event?: CalendarEvent) {
    const status = event ? eventStatus(event) : getCalendarItemStatus(content);
    const statusLabel = getCalendarStatusLabel(content, event, status);
    const channelText = event ? event.channelTimes.map((channel) => `${platformLabels[channel.platform]} · ${channel.time}`).join(" · ") : "งานวางแผน";
    const scheduledTime = event?.time ?? "ไม่ระบุเวลา";
    const dragItem = { contentId: content.id, platform: platform === "all" ? null : event?.platform ?? null };
    const isSelected = selectedContentIds.has(content.id);
    return <article key={event?.id ?? content.id} className={`calendar-item calendar-item--${status}${isSelected ? " is-selected" : ""}`} draggable role="button"
      aria-label={`${content.title} · ${channelText} · ${statusLabel} · กดเพื่อแก้ไข หรือลากเพื่อย้ายวัน`}
      onDragStart={(dragEvent) => startDragging(dragEvent, dragItem)}
      onDragEnd={() => { lastDragEndAt.current = Date.now(); setDraggedItem(null); setDropTargetDate(null); }}
      onClick={() => { if (Date.now() - lastDragEndAt.current < 350) return; openEditor(content.id); }}
      onKeyDown={(keyboardEvent) => handleCardKeyDown(keyboardEvent, content.id)} tabIndex={0}>
      <span className="calendar-item-selection"><input type="checkbox" aria-label={`เลือก ${content.title}`} checked={isSelected} disabled={selectionBusy}
        onChange={(event) => setContentSelection(content.id, event.target.checked)} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()} /></span>
      {event && <span className="calendar-item-channels" aria-label={channelText} title={channelText}>{event.channelTimes.map((channel) => `${platformShortLabels[channel.platform]} ${channel.time}`).join(" · ")}</span>}
      <span className="calendar-item-title">{content.title}</span>
      {!event && <span className="calendar-item-time" aria-label={`เวลาลง ${scheduledTime}`}>{scheduledTime}</span>}
      <span className="calendar-item-preview">
        <span className="calendar-item-meta">{channelText}</span>
        <span className="calendar-item-status">{statusLabel}</span>
      </span>
    </article>;
  }

  return <section className="calendar-workspace" aria-labelledby="calendar-heading">
    <div className="workspace-heading-row">
      <div><p className="eyebrow">INDY / CALENDAR</p><h1 id="calendar-heading">ปฏิทินคอนเทนต์</h1></div>
      <div className="calendar-header-actions">
        <div className="calendar-month-navigation" aria-label="เลื่อนเดือนปฏิทิน">
          <button type="button" aria-label="เดือนก่อนหน้า" disabled={selectionBusy} onClick={() => changeCalendarFilter(() => setMonth((current) => shiftMonth(current, -1)))}>‹</button>
          <input type="month" aria-label="เดือนปฏิทิน" value={month} disabled={selectionBusy} onChange={(event) => changeCalendarFilter(() => setMonth(event.target.value))} />
          <button type="button" aria-label="เดือนถัดไป" disabled={selectionBusy} onClick={() => changeCalendarFilter(() => setMonth((current) => shiftMonth(current, 1)))}>›</button>
        </div>
<label className="calendar-platform-filter"><span>กรองช่องทาง</span><span className="calendar-platform-select"><select aria-label="กรองช่องทาง" value={platform} disabled={selectionBusy} onChange={(event) => changeCalendarFilter(() => setPlatform(event.target.value as CalendarPlatformFilter))}><option value="all">รวมทุกช่องทาง</option><option value="facebook">Facebook</option><option value="instagram">Instagram</option><option value="tiktok">TikTok</option><option value="salon">Salon</option></select><svg aria-hidden="true" viewBox="0 0 12 12"><path d="m3 4.5 3 3 3-3" /></svg></span></label>
        <label className="calendar-platform-filter"><span>กรองผู้รับผิดชอบ</span><span className="calendar-platform-select"><select aria-label="กรองผู้รับผิดชอบ" value={owner} disabled={selectionBusy} onChange={(event) => changeCalendarFilter(() => setOwner(event.target.value))}><option value="">ทุกคน</option>{ownerOptions.map((name) => <option key={name} value={name}>{name}</option>)}</select><svg aria-hidden="true" viewBox="0 0 12 12"><path d="m3 4.5 3 3 3-3" /></svg></span></label>
        <button type="button" className="create-task-button" onClick={() => onCreateTask()}>สร้างชิ้นงานใหม่</button>
      </div>
    </div>
    {moveError && <p className="calendar-move-error" role="alert">{moveError}</p>}
    {selectionMessage && <p role="status">{selectionMessage}</p>}
    {selectedContentIds.size > 0 && <div className="calendar-selection-toolbar" role="region" aria-label="การเลือกหลายรายการ">
      <strong>เลือกแล้ว {selectedContentIds.size} รายการ</strong>
      <div>
        <button type="button" disabled={selectionBusy} onClick={() => setSelectedContentIds(new Set())}>ยกเลิกการเลือก</button>
        <button type="button" disabled={selectionBusy} onClick={() => void changeSelectedStatus("editing")}>กำลังทำ</button>
        <button type="button" disabled={selectionBusy} onClick={() => void changeSelectedStatus("published")}>ทำเสร็จแล้ว / ลงเองแล้ว</button>
        <button type="button" disabled={selectionBusy || selectedContentIds.size !== 1} onClick={() => setCopySourceContentId([...selectedContentIds][0] ?? null)}>คัดลอกสำเนา</button>
        <button type="button" disabled={selectionBusy} className="calendar-delete-button" onClick={() => void deleteSelectedContent()}>ลบรายการที่เลือก</button>
      </div>
      <small>{selectionBusy ? "กำลังบันทึก…" : `${selectedContentIds.size > 1 ? "คัดลอกสำเนาต้องเลือกครั้งละ 1 รายการ · " : ""}เปลี่ยนสถานะทั้งชิ้นงาน ไม่สั่งโพสต์ผ่าน LINE หรือ Make`}</small>
    </div>}
    <div className="calendar-grid" role="grid" aria-label="ปฏิทินคอนเทนต์">
      {["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"].map((day) => <div key={day} className="calendar-weekday-heading" role="columnheader">{day}</div>)}
      {view.cells.map((cell) => {
        const scheduledIds = new Set(cell.events.map((event) => event.content.id));
        const workItems = cell.items.filter((item) => !scheduledIds.has(item.id));
        return <div key={cell.date} className={`${cell.inMonth ? "calendar-cell" : "calendar-cell muted"}${dropTargetDate === cell.date ? " calendar-cell-drop-target" : ""}`} aria-label={cell.date} role="gridcell" tabIndex={-1}
          onDragOver={(event) => { if (!event.dataTransfer.types.includes("text/plain") && !draggedItem) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDropTargetDate(cell.date); }}
          onDrop={(event) => dropOnDate(event, cell.date)} onClick={(event) => { if ((event.target as HTMLElement).closest(".calendar-item")) return; onCreateTask(cell.date); }}>
          <div className="calendar-date-heading"><strong>{cell.date.slice(-2)}</strong><span>{["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"][new Date(`${cell.date}T00:00:00Z`).getUTCDay()]}</span></div>
          {cell.events.map((event) => renderCard(event.content, event))}
          {workItems.map((item) => renderCard(item))}
        </div>;
      })}
    </div>
    <section aria-labelledby="unscheduled-heading"><h2 id="unscheduled-heading">ยังไม่กำหนดวัน</h2>{view.unscheduled.map((item) => renderCard(item))}</section>
    <ContentEditorDialog mode="edit" contentId={editingContentId} open={Boolean(editingContentId)} onClose={() => setEditingContentId(null)} />
    {copySourceContentId && copySourceContent && <RecurringCopyDialog key={copySourceContent.id} content={copySourceContent} onClose={() => setCopySourceContentId(null)} onCopied={(count) => { setSelectedContentIds(new Set()); setSelectionMessage(`สร้างสำเนา ${count} รายการแล้ว โดยสำเนาจะเริ่มกระบวนการใหม่และยังไม่ส่งเข้า Make`); setCopySourceContentId(null); }} />}
  </section>;
}
