"use client";

import { useEffect, useState, type FormEvent } from "react";
import { MAX_MEDIA_BYTES } from "../../media/media-commands";
import type { Category, FormatDefinition } from "../../domain/types";

export interface LineSendDraft {
  file: File;
  caption: string;
  plannedDate: string;
  categoryId: string;
  formatId: string;
}

interface LineSendComposerProps {
  open: boolean;
  authenticatedAdmin: boolean;
  connectedRecipient: boolean;
  recipientMasked: string | null;
  storageStatus: "checking" | "ready" | "unavailable";
  storageReason?: string | null;
  categories?: Category[];
  formats?: FormatDefinition[];
  onCancel: () => void;
  onSubmit: (draft: LineSendDraft) => Promise<void>;
}

type FieldErrors = { file: string | null; caption: string | null; plannedDate: string | null; category: string | null; format: string | null };

const supportedMimeTypes = new Set(["image/jpeg", "image/png", "video/mp4"]);
const emptyErrors: FieldErrors = { file: null, caption: null, plannedDate: null, category: null, format: null };
const storageProblems: Record<string, string> = {
  configuration: "ยังไม่ได้ตั้งค่าที่เก็บไฟล์",
  permission: "บัญชีที่ใช้ไม่มีสิทธิ์เข้าถึงที่เก็บไฟล์",
  not_found: "ไม่พบโฟลเดอร์เก็บไฟล์",
  quota: "พื้นที่หรือโควตาไม่เพียงพอ",
  timeout: "ตรวจการเชื่อมต่อไม่ทันเวลา",
  provider: "ตรวจการเชื่อมต่อไม่สำเร็จ",
};

export function LineSendComposer({ open, authenticatedAdmin, connectedRecipient, recipientMasked, storageStatus, storageReason, categories = [], formats = [], onCancel, onSubmit }: LineSendComposerProps) {
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [plannedDate, setPlannedDate] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [formatId, setFormatId] = useState("");
  const [formatWasSelected, setFormatWasSelected] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>(emptyErrors);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const recipientReady = authenticatedAdmin && connectedRecipient;

  useEffect(() => {
    if (!open) {
      setFile(null);
      setCaption("");
      setPlannedDate("");
      setCategoryId("");
      setFormatId("");
      setFormatWasSelected(false);
      setFieldErrors(emptyErrors);
      setFormError(null);
      setIsSubmitting(false);
    }
  }, [open]);

  if (!open) return null;

  const selectedCategoryId = categories.some((category) => category.id === categoryId) ? categoryId : categories[0]?.id ?? "";
  const selectedFormatId = formats.some((format) => format.id === formatId) ? formatId : formats[0]?.id ?? "";

  function selectFile(selected: File | null) {
    setFile(selected);
    setFieldErrors((current) => ({ ...current, file: null }));
    setFormError(null);
    if (selected && !formatWasSelected) {
      const mediaKind = selected.type === "video/mp4" ? "video" : "image";
      setFormatId(formats.find((format) => format.mediaKind === mediaKind)?.id ?? formats[0]?.id ?? "");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const errors: FieldErrors = { file: null, caption: null, plannedDate: null, category: null, format: null };
    if (!file) errors.file = "เลือกไฟล์รูปหรือคลิปก่อนส่ง";
    else if (!supportedMimeTypes.has(file.type.toLowerCase())) errors.file = "รองรับไฟล์ JPG, PNG หรือ MP4 เท่านั้น";
    else if (file.size > MAX_MEDIA_BYTES) errors.file = "ไฟล์มีขนาดเกิน 1 GB";
    if (!caption.trim()) errors.caption = "กรอกแคปชันก่อนส่ง";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(plannedDate)) errors.plannedDate = "เลือกวันที่ลงก่อนส่ง";
    if (categories.length > 0 && !selectedCategoryId) errors.category = "เลือกประเภทคอนเทนต์ก่อนส่ง";
    if (formats.length > 0 && !selectedFormatId) errors.format = "เลือกรูปแบบการนำเสนอก่อนส่ง";

    setFieldErrors(errors);
    setFormError(null);
    if (Object.values(errors).some(Boolean) || !file) return;
    if (!recipientReady || storageStatus !== "ready") {
      setFormError(storageStatus !== "ready" ? "Vercel Blob ยังไม่พร้อมรับไฟล์" : "กรุณาเข้าสู่ระบบและจับคู่บัญชี LINE OA ก่อนส่ง");
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({ file, caption: caption.trim(), plannedDate, categoryId: selectedCategoryId, formatId: selectedFormatId });
    } catch (error) {
      setFormError(error instanceof Error && error.message === "media-storage-unavailable"
        ? "ที่เก็บไฟล์ Vercel Blob ยังไม่เชื่อมต่อ กรุณาตั้งค่าการเชื่อมต่อก่อนส่ง"
        : "บันทึกหรืออัปโหลดไม่สำเร็จ ข้อมูลยังอยู่ในฟอร์ม ลองอีกครั้งได้");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="create-modal-backdrop">
      <section className="line-send-composer motion-material-surface motion-modal" role="dialog" aria-modal="true" aria-labelledby="line-composer-heading">
        <div className="create-modal-heading">
          <div>
            <p className="eyebrow">LINE OA · INDY OS Alerts</p>
            <h2 id="line-composer-heading">ส่งงานใน LINE</h2>
          </div>
          <button type="button" className="drawer-close-button" onClick={onCancel} aria-label="ปิดการส่ง LINE" disabled={isSubmitting}>×</button>
        </div>

        <p className="line-composer-guidance">วันที่ใช้วางแผนในปฏิทินเท่านั้น เมื่อกดยืนยันในขั้นถัดไป ระบบจะส่ง LINE ทันที</p>
        <p className="line-composer-recipient" role="status">
          {authenticatedAdmin
            ? connectedRecipient
              ? `ผู้รับที่จับคู่ไว้: ${recipientMasked ?? "พร้อมส่ง"}`
              : "ยังไม่ได้จับคู่บัญชี LINE OA กับแชตปลายทาง"
            : "เข้าสู่ระบบผู้ดูแลและจับคู่แชต LINE ก่อนส่ง"}
        </p>
        <p className={`line-composer-storage ${storageStatus}`} role="status">
          {storageStatus === "checking"
            ? "กำลังตรวจ Vercel Blob ก่อนอัปโหลดไฟล์…"
            : storageStatus === "ready"
              ? "Vercel Blob พร้อมรับไฟล์ ระบบจะอัปโหลดเมื่อกดปุ่มด้านล่าง"
              : `Vercel Blob ยังไม่พร้อม: ${storageProblems[storageReason ?? ""] ?? "ตรวจสอบการเชื่อมต่อในหน้าตั้งค่า"}`}
        </p>

        <form onSubmit={(event) => void submit(event)} noValidate>
          <label>
            ไฟล์รูปหรือคลิป
            <input
              type="file"
              aria-label="ไฟล์รูปหรือคลิป"
              accept="image/jpeg,image/png,video/mp4,.jpg,.jpeg,.png,.mp4"
              disabled={isSubmitting}
              onChange={(event) => selectFile(event.currentTarget.files?.[0] ?? null)}
              aria-invalid={Boolean(fieldErrors.file)}
              aria-describedby={fieldErrors.file ? "line-file-error" : "line-file-help"}
            />
            {fieldErrors.file
              ? <span id="line-file-error" className="field-error" role="alert">{fieldErrors.file}</span>
              : <span id="line-file-help" className="line-composer-help">รองรับ JPG, PNG หรือ MP4 ขนาดไม่เกิน 1 GB</span>}
            {file && <span className="line-composer-file-name">เลือกแล้ว: {file.name} · ยังไม่อัปโหลด</span>}
            {file && file.type === "video/mp4" && file.size > 200_000_000 && <span className="line-composer-help">คลิปเกิน 200 MB จะส่งภาพตัวอย่างพร้อมลิงก์ดูต้นฉบับใน LINE โดยคงคุณภาพเดิม ลิงก์มีอายุ 1 ชั่วโมง</span>}
          </label>

          <label>
            ประเภทคอนเทนต์
            <select aria-label="ประเภทคอนเทนต์" value={selectedCategoryId} onChange={(event) => setCategoryId(event.target.value)} disabled={isSubmitting || categories.length === 0}>
              {categories.length === 0 && <option value="">ไม่มีประเภทที่ตั้งค่าไว้</option>}
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
            {fieldErrors.category && <span className="field-error" role="alert">{fieldErrors.category}</span>}
          </label>

          <label>
            รูปแบบการนำเสนอ
            <select aria-label="รูปแบบการนำเสนอ" value={selectedFormatId} onChange={(event) => { setFormatWasSelected(true); setFormatId(event.target.value); }} disabled={isSubmitting || formats.length === 0}>
              {formats.length === 0 && <option value="">ไม่มีรูปแบบที่ตั้งค่าไว้</option>}
              {formats.map((format) => <option key={format.id} value={format.id}>{format.name}</option>)}
            </select>
            <span className="line-composer-help">ค่าเริ่มต้นจะจับคู่กับชนิดไฟล์ และเปลี่ยนได้เอง</span>
            {fieldErrors.format && <span className="field-error" role="alert">{fieldErrors.format}</span>}
          </label>

          <label>
            แคปชัน
            <textarea value={caption} onChange={(event) => { setCaption(event.target.value); setFieldErrors((current) => ({ ...current, caption: null })); setFormError(null); }} disabled={isSubmitting} aria-invalid={Boolean(fieldErrors.caption)} aria-describedby={fieldErrors.caption ? "line-caption-error" : undefined} />
            {fieldErrors.caption && <span id="line-caption-error" className="field-error" role="alert">{fieldErrors.caption}</span>}
          </label>

          <label>
            วันที่ลง
            <input type="date" value={plannedDate} onChange={(event) => { setPlannedDate(event.target.value); setFieldErrors((current) => ({ ...current, plannedDate: null })); setFormError(null); }} disabled={isSubmitting} aria-invalid={Boolean(fieldErrors.plannedDate)} aria-describedby={fieldErrors.plannedDate ? "line-date-error" : undefined} />
            {fieldErrors.plannedDate && <span id="line-date-error" className="field-error" role="alert">{fieldErrors.plannedDate}</span>}
          </label>

          {formError && <p className="line-send-error" role="alert">{formError}</p>}
          <div className="create-modal-actions">
            <button type="button" className="drawer-secondary-button" onClick={onCancel} disabled={isSubmitting}>ยกเลิก</button>
            <button type="submit" className="drawer-delivery-button" disabled={isSubmitting || !recipientReady || storageStatus !== "ready"}>{isSubmitting ? "กำลังอัปโหลดไฟล์…" : "อัปโหลดไฟล์และตรวจสอบก่อนส่ง"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
