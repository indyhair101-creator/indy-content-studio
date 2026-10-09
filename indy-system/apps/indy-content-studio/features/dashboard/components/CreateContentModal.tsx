"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { Platform } from "../../domain/types";
import { DEFAULT_OWNER_OPTIONS } from "../../domain/create-empty-state";

export interface CreateContentInput {
  title: string;
  category: string;
  format: string;
  owner: string;
  objective: string;
  plannedDate: string;
  notes: string;
  platformSchedules: Record<Platform, { enabled: boolean; date: string; time: string }>;
}

interface CreateContentModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (input: CreateContentInput) => void | Promise<void>;
  categories: string[];
  formats: string[];
  ownerOptions?: string[];
  initialDate?: string;
  allowedPlatformsByFormat?: Record<string, Platform[]>;
}

const platforms: Array<{ value: Platform; label: string }> = [
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
];

function createPlatformSchedules(date = "") {
  return Object.fromEntries(platforms.map(({ value }) => [value, { enabled: false, date, time: "09:00" }])) as CreateContentInput["platformSchedules"];
}

const initialInput: CreateContentInput = {
  title: "",
  category: "",
  format: "",
  owner: "",
  objective: "",
  plannedDate: "",
  notes: "",
  platformSchedules: createPlatformSchedules(),
};

export function CreateContentModal({ open, onClose, onCreate, categories, formats, ownerOptions = [...DEFAULT_OWNER_OPTIONS], initialDate = "", allowedPlatformsByFormat = {} }: CreateContentModalProps) {
  const [input, setInput] = useState<CreateContentInput>(initialInput);
  const [titleError, setTitleError] = useState(false);
  const [ownerError, setOwnerError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  useEffect(() => {
    if (open) setInput({ ...initialInput, plannedDate: initialDate, platformSchedules: createPlatformSchedules(initialDate) });
  }, [open, initialDate]);

  if (!open) return null;

  const category = categories.includes(input.category) ? input.category : categories[0] ?? "";
  const format = formats.includes(input.format) ? input.format : formats[0] ?? "";
  const allowedPlatforms = allowedPlatformsByFormat[format] ?? ["facebook", "instagram", "tiktok"];

  function updateField(field: keyof CreateContentInput, value: string) {
    setInput((current) => ({ ...current, [field]: value }));
    if (field === "title" && value.trim()) setTitleError(false);
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
      await onCreate({ ...input, title: input.title.trim(), category, format });
    } catch {
      setSubmissionError("บันทึกงานไม่สำเร็จ ข้อมูลยังอยู่ในฟอร์ม ลองอีกครั้งได้");
    } finally {
      setIsSubmitting(false);
    }
  }

  function updatePlatform(platform: Platform, values: Partial<CreateContentInput["platformSchedules"][Platform]>) {
    setInput((current) => ({ ...current, platformSchedules: { ...current.platformSchedules, [platform]: { ...current.platformSchedules[platform], ...values } } }));
  }

  return (
    <div className="create-modal-backdrop">
      <section className="create-content-modal motion-material-surface motion-modal" role="dialog" aria-modal="true" aria-labelledby="create-content-heading">
        <div className="create-modal-heading">
          <div>
            <p className="eyebrow">เริ่มชิ้นงานใหม่</p>
            <h2 id="create-content-heading">สร้างคอนเทนต์</h2>
          </div>
          <button type="button" className="drawer-close-button" onClick={onClose} aria-label="ปิดการสร้างงาน">×</button>
        </div>

        <form onSubmit={submit}>
          <fieldset>
            <legend>1 · ตัวตนของชิ้นงาน</legend>
            <label>ชื่อชิ้นงาน<input value={input.title} onChange={(event) => updateField("title", event.target.value)} aria-invalid={titleError} /></label>
            {titleError && <p className="field-error" role="alert">กรุณาระบุชื่อชิ้นงาน</p>}
            <label>ประเภทคอนเทนต์<select value={category} onChange={(event) => updateField("category", event.target.value)} disabled={isSubmitting}><option value="" disabled>เพิ่มประเภทได้ในตั้งค่า</option>{categories.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
            <label>รูปแบบการนำเสนอ<select value={format} onChange={(event) => updateField("format", event.target.value)} disabled={isSubmitting}><option value="" disabled>เพิ่มรูปแบบได้ในตั้งค่า</option>{formats.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
            <p className="field-hint">ประเภทคอนเทนต์บอกว่าเนื้อหาเกี่ยวกับอะไร แยกจากรูปแบบการนำเสนอว่าเผยแพร่เป็นอะไร ทั้งสองรายการปรับเพิ่มหรือลบได้ในตั้งค่า</p>
            <label>ผู้รับผิดชอบ<select aria-label="ผู้รับผิดชอบ" value={input.owner} onChange={(event) => { updateField("owner", event.target.value); setOwnerError(false); }} disabled={isSubmitting}><option value="">เลือกผู้รับผิดชอบ</option>{ownerOptions.map((owner) => <option key={owner} value={owner}>{owner}</option>)}</select></label>
            {ownerError && <p className="field-error" role="alert">กรุณาเลือกผู้รับผิดชอบจากรายการ</p>}
          </fieldset>

          <fieldset>
            <legend>2 · การผลิต</legend>
            <label>เป้าหมาย<textarea value={input.objective} onChange={(event) => updateField("objective", event.target.value)} /></label>
          </fieldset>

          <fieldset>
            <legend>3 · วางแผนในปฏิทิน</legend>
            <label>วันที่ลงในปฏิทิน<input type="date" value={input.plannedDate} disabled={isSubmitting} onChange={(event) => updateField("plannedDate", event.target.value)} /></label>
            <p className="field-hint">เลือกช่องทางและกำหนดวันเวลาลงแยกกันได้ ระบบจะแสดงแต่ละช่องทางเป็นการ์ดในปฏิทิน</p>
            <div className="platform-schedule-fields" aria-label="กำหนดวันเวลารายช่องทาง">
              {platforms.map(({ value, label }) => {
                const schedule = input.platformSchedules[value];
                const supported = allowedPlatforms.includes(value);
                return <div className="platform-schedule-row" key={value}>
                  <label className="platform-schedule-toggle"><span className="platform-schedule-name">{label}</span><input type="checkbox" aria-label={`เปิด ${label}`} checked={schedule.enabled} disabled={isSubmitting || !supported} onChange={(event) => updatePlatform(value, { enabled: event.target.checked, date: event.target.checked && !schedule.date ? input.plannedDate : schedule.date })} /></label>
                  {!supported && <span className="field-hint">รูปแบบนี้ไม่รองรับช่องทาง {label}</span>}
                  <label>วันลง {label}<input type="date" aria-label={`วันลง ${label}`} value={schedule.date} disabled={isSubmitting || !schedule.enabled || !supported} onChange={(event) => updatePlatform(value, { date: event.target.value })} /></label>
                  <label>เวลาลง {label}<input type="time" aria-label={`เวลาลง ${label}`} value={schedule.time} disabled={isSubmitting || !schedule.enabled || !supported} onChange={(event) => updatePlatform(value, { time: event.target.value })} /></label>
                </div>;
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend>4 · บันทึกเพิ่มเติม</legend>
            <label>โน้ต<textarea value={input.notes} onChange={(event) => updateField("notes", event.target.value)} /></label>
          </fieldset>

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
