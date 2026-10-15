"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { ContentObjective, Platform } from "../../domain/types";
import { DEFAULT_OWNER_OPTIONS } from "../../domain/create-empty-state";

export interface CreateContentInput {
  title: string;
  category: string;
  format: string;
  owner: string;
  objective: ContentObjective;
  plannedDate: string;
  notes: string;
  caption: string;
  platformSchedules: Partial<Record<Platform, { enabled: boolean; date: string; time: string }>>;
}

interface CreateContentModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (input: CreateContentInput) => void | Promise<void>;
  categories: string[];
  formats: string[];
  ownerOptions?: string[];
  /** Pre-selected owner, usually the last one used on this device. */
  defaultOwner?: string;
  initialDate?: string;
  allowedPlatformsByFormat?: Record<string, Platform[]>;
}

const platforms: Array<{ value: Platform; label: string }> = [
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "salon", label: "Salon" },
];

const objectiveOptions: Array<[ContentObjective, string]> = [
  ["awareness", "เพิ่มการรับรู้"],
  ["branding", "สร้างแบรนด์"],
  ["lead", "หาลูกค้าเป้าหมาย"],
  ["engagement", "เพิ่มการมีส่วนร่วม"],
  ["sales", "เพิ่มยอดขาย"],
];

type Schedule = { enabled: boolean; date: string; time: string };

function createPlatformSchedules(date = "") {
  return Object.fromEntries(platforms.map(({ value }) => [value, { enabled: false, date, time: "09:00" }])) as Record<Platform, Schedule>;
}

function emptyInput(initialDate: string, owner: string): CreateContentInput {
  return { title: "", category: "", format: "", owner, objective: "awareness", plannedDate: initialDate, notes: "", caption: "", platformSchedules: createPlatformSchedules(initialDate) };
}

export function CreateContentModal({ open, onClose, onCreate, categories, formats, ownerOptions = [...DEFAULT_OWNER_OPTIONS], defaultOwner = "", initialDate = "", allowedPlatformsByFormat = {} }: CreateContentModalProps) {
  const startingOwner = ownerOptions.includes(defaultOwner) ? defaultOwner : "";
  const [input, setInput] = useState<CreateContentInput>(() => emptyInput(initialDate, startingOwner));
  const [sharedTime, setSharedTime] = useState("09:00");
  const [separateSchedules, setSeparateSchedules] = useState(false);
  const [titleError, setTitleError] = useState(false);
  const [ownerError, setOwnerError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setInput(emptyInput(initialDate, startingOwner));
    setSharedTime("09:00");
    setSeparateSchedules(false);
    setTitleError(false);
    setOwnerError(false);
    setSubmissionError(null);
    // Reset only when the form opens; owner defaults are filled in separately so typing is never wiped.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialDate]);

  useEffect(() => {
    if (open && startingOwner) setInput((current) => current.owner ? current : { ...current, owner: startingOwner });
  }, [open, startingOwner]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape" && !isSubmitting) onClose(); };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open, isSubmitting, onClose]);

  if (!open) return null;

  const category = categories.includes(input.category) ? input.category : categories[0] ?? "";
  const format = formats.includes(input.format) ? input.format : formats[0] ?? "";
  const allowedPlatforms = allowedPlatformsByFormat[format] ?? ["facebook", "instagram", "tiktok"];
  const schedules = input.platformSchedules as Record<Platform, Schedule>;
  const enabledPlatforms = platforms.filter(({ value }) => schedules[value]?.enabled);

  function updateField<K extends keyof CreateContentInput>(field: K, value: CreateContentInput[K]) {
    setInput((current) => ({ ...current, [field]: value }));
    if (field === "title" && String(value).trim()) setTitleError(false);
  }

  function updatePlatform(platform: Platform, values: Partial<Schedule>) {
    setInput((current) => ({ ...current, platformSchedules: { ...current.platformSchedules, [platform]: { ...(current.platformSchedules[platform] ?? { enabled: false, date: current.plannedDate, time: sharedTime }), ...values } } }));
  }

  /** Enabled channels follow the calendar date and shared time unless the user splits them. */
  function resolvedSchedules(): CreateContentInput["platformSchedules"] {
    if (separateSchedules) return input.platformSchedules;
    return Object.fromEntries(Object.entries(input.platformSchedules).map(([platform, schedule]) => [platform,
      schedule?.enabled ? { enabled: true, date: input.plannedDate || schedule.date, time: sharedTime } : schedule,
    ])) as CreateContentInput["platformSchedules"];
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    if (!input.title.trim()) {
      setTitleError(true);
      return;
    }
    if (!ownerOptions.includes(input.owner)) {
      setOwnerError(true);
      return;
    }

    setIsSubmitting(true);
    setSubmissionError(null);
    try {
      await onCreate({ ...input, title: input.title.trim(), caption: input.caption.trim(), category, format, platformSchedules: resolvedSchedules() });
    } catch {
      setSubmissionError("บันทึกงานไม่สำเร็จ ข้อมูลยังอยู่ในฟอร์ม ลองอีกครั้งได้");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="create-modal-backdrop">
      <section className="create-content-modal motion-material-surface motion-modal" role="dialog" aria-modal="true" aria-labelledby="create-content-heading">
        <div className="create-modal-heading">
          <h2 id="create-content-heading">สร้างคอนเทนต์</h2>
          <button type="button" className="drawer-close-button" onClick={onClose} aria-label="ปิดการสร้างงาน">×</button>
        </div>

        <form onSubmit={submit} className="create-form">
          <label>ชื่อชิ้นงาน<input value={input.title} onChange={(event) => updateField("title", event.target.value)} aria-invalid={titleError} autoFocus /></label>
          {titleError && <p className="field-error" role="alert">กรุณาระบุชื่อชิ้นงาน</p>}

          <div className="create-form-row">
            <label>ผู้รับผิดชอบ<select aria-label="ผู้รับผิดชอบ" value={input.owner} aria-invalid={ownerError} onChange={(event) => { updateField("owner", event.target.value); setOwnerError(false); }} disabled={isSubmitting}><option value="">เลือกผู้รับผิดชอบ</option>{ownerOptions.map((owner) => <option key={owner} value={owner}>{owner}</option>)}</select></label>
            <label>วันที่ลงในปฏิทิน<input type="date" value={input.plannedDate} disabled={isSubmitting} onChange={(event) => updateField("plannedDate", event.target.value)} /></label>
          </div>
          {ownerError && <p className="field-error" role="alert">กรุณาเลือกผู้รับผิดชอบจากรายการ</p>}

          <fieldset className="create-channels">
            <legend>ช่องทางที่จะลง</legend>
            <div className="channel-chips">
              {platforms.map(({ value, label }) => {
                const supported = value === "salon" || allowedPlatforms.includes(value);
                return <label key={value} className="channel-chip" title={supported ? undefined : `รูปแบบนี้ไม่รองรับ ${label}`}>
                  <input type="checkbox" aria-label={`เปิด ${label}`} checked={schedules[value]?.enabled ?? false} disabled={isSubmitting || !supported}
                    onChange={(event) => updatePlatform(value, { enabled: event.target.checked, date: event.target.checked && !schedules[value]?.date ? input.plannedDate : schedules[value]?.date ?? "" })} />
                  <span>{label}</span>
                </label>;
              })}
            </div>
            {enabledPlatforms.length > 0 && !separateSchedules && <label className="channel-time">เวลาโพสต์<input type="time" value={sharedTime} disabled={isSubmitting} onChange={(event) => setSharedTime(event.target.value)} /></label>}
            {enabledPlatforms.length > 0 && <label className="channel-split"><input type="checkbox" checked={separateSchedules} disabled={isSubmitting} onChange={(event) => {
              const split = event.target.checked;
              if (split) enabledPlatforms.forEach(({ value }) => updatePlatform(value, { date: input.plannedDate || schedules[value].date, time: sharedTime }));
              setSeparateSchedules(split);
            }} />ตั้งวันเวลาโพสต์แยกรายช่องทาง</label>}
            {separateSchedules && <div className="platform-schedule-fields" aria-label="กำหนดวันเวลารายช่องทาง">
              {enabledPlatforms.map(({ value, label }) => <div className="platform-schedule-row" key={value}>
                <strong>{label}</strong>
                <label>วันลง {label}<input type="date" aria-label={`วันลง ${label}`} value={schedules[value].date} disabled={isSubmitting} onChange={(event) => updatePlatform(value, { date: event.target.value })} /></label>
                <label>เวลาลง {label}<input type="time" aria-label={`เวลาลง ${label}`} value={schedules[value].time} disabled={isSubmitting} onChange={(event) => updatePlatform(value, { time: event.target.value })} /></label>
              </div>)}
            </div>}
            {schedules.salon?.enabled && <p className="field-hint">Salon ลงในปฏิทินและ Action Plan เท่านั้น ไม่ส่งไปโพสต์อัตโนมัติ</p>}
          </fieldset>

          <label>แคปชัน<textarea value={input.caption} rows={3} onChange={(event) => updateField("caption", event.target.value)} placeholder="เขียนตอนนี้หรือเพิ่มทีหลังก็ได้" /></label>

          <details className="create-more">
            <summary>รายละเอียดเพิ่มเติม</summary>
            <div className="create-form-row">
              <label>ประเภทคอนเทนต์<select value={category} onChange={(event) => updateField("category", event.target.value)} disabled={isSubmitting}><option value="" disabled>เพิ่มประเภทได้ในตั้งค่า</option>{categories.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
              <label>รูปแบบการนำเสนอ<select value={format} onChange={(event) => updateField("format", event.target.value)} disabled={isSubmitting}><option value="" disabled>เพิ่มรูปแบบได้ในตั้งค่า</option>{formats.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
            </div>
            <label>เป้าหมาย<select value={input.objective} onChange={(event) => updateField("objective", event.target.value as ContentObjective)} disabled={isSubmitting}>{objectiveOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label>โน้ต<textarea value={input.notes} rows={2} onChange={(event) => updateField("notes", event.target.value)} /></label>
          </details>

          <div className="create-modal-actions">
            {submissionError && <p role="alert">{submissionError}</p>}
            <button type="button" className="drawer-secondary-button" onClick={onClose} disabled={isSubmitting}>ยกเลิก</button>
            <button type="submit" className="create-submit-button" disabled={isSubmitting}>{isSubmitting ? "กำลังบันทึก…" : "สร้างงาน"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
