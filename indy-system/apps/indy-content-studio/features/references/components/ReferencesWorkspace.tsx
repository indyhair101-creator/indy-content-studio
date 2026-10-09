"use client";

import { useMemo, useState } from "react";
import type { ReferenceIdea } from "../../domain/types";
import { useDashboardData } from "../../data/DashboardDataProvider";
import { AccessibleDialog } from "../../shared/components/AccessibleDialog";
import { addReference, deleteReference, updateReference } from "../reference-commands";

type ReferenceForm = Omit<Pick<ReferenceIdea, "title" | "url" | "platform" | "notes">, "tags"> & { tags: string };

const emptyForm: ReferenceForm = { title: "", url: "", platform: "", tags: "", notes: "" };

function makeReferenceId() {
  return `reference-${Date.now()}`;
}

function formFor(reference: ReferenceIdea): ReferenceForm {
  return { title: reference.title, url: reference.url, platform: reference.platform, tags: reference.tags.join(", "), notes: reference.notes };
}

export function ReferencesWorkspace() {
  const dashboard = useDashboardData();
  const [query, setQuery] = useState("");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [form, setForm] = useState<ReferenceForm>(emptyForm);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ReferenceIdea | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeReferences = useMemo(() => dashboard.state?.references.filter((item) => !item.deletedAt) ?? [], [dashboard.state]);
  const platformOptions = useMemo(() => [...new Set(activeReferences.map((item) => item.platform))].sort(), [activeReferences]);
  const references = activeReferences.filter((item) => {
    const haystack = [item.title, item.url, item.platform, item.tags.join(" "), item.notes].join(" ").toLowerCase();
    return haystack.includes(query.trim().toLowerCase()) && (platformFilter === "all" || item.platform === platformFilter);
  });

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  function changeForm(field: keyof ReferenceForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function saveReference() {
    const now = new Date().toISOString();
    try {
      await dashboard.mutate((state) => editingId
        ? updateReference(state, editingId, { ...form, tags: form.tags.split(",") }, now)
        : addReference(state, { id: makeReferenceId(), ...form, tags: form.tags.split(","), now }));
      setError(null);
      closeForm();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "บันทึก Reference ไม่สำเร็จ");
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await dashboard.mutate((state) => deleteReference(state, deleting.id, new Date().toISOString()));
      setError(null);
      setDeleting(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ลบ Reference ไม่สำเร็จ");
    }
  }

  if (!dashboard.state && dashboard.status === "loading") {
    return <section className="workspace-surface" aria-labelledby="references-heading"><h1 id="references-heading">Reference และไอเดีย</h1><p role="status">กำลังโหลดข้อมูล…</p></section>;
  }

  if (!dashboard.state) {
    return <section className="workspace-surface" aria-labelledby="references-heading"><h1 id="references-heading">Reference และไอเดีย</h1><p role="alert">{dashboard.error?.message ?? "โหลดข้อมูลไม่สำเร็จ"}</p><button type="button" onClick={() => void dashboard.reload()}>ลองใหม่</button></section>;
  }

  const state = dashboard.state;
  const attachmentCount = deleting ? state.contents.filter((item) => !item.deletedAt && item.referenceIds.includes(deleting.id)).length : 0;

  return <section className="workspace-surface" aria-labelledby="references-heading">
    <div className="workspace-heading-row">
      <div><p className="eyebrow">INDY / REFERENCES</p><h1 id="references-heading">Reference และไอเดีย</h1></div>
      <button type="button" onClick={() => { setError(null); setForm(emptyForm); setEditingId(null); setFormOpen(true); }}>เพิ่ม Reference</button>
    </div>
    {(error || dashboard.error) && <p role="alert" className="settings-notice error">{error ?? dashboard.error?.message}</p>}
    <div className="workspace-heading-row">
      <label className="workspace-search-inline">ค้นหาไอเดีย<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <label>กรองแพลตฟอร์ม<select value={platformFilter} onChange={(event) => setPlatformFilter(event.target.value)}><option value="all">ทั้งหมด</option>{platformOptions.map((platform) => <option key={platform} value={platform}>{platform}</option>)}</select></label>
    </div>
    {formOpen ? <ReferenceDialog form={form} editing={Boolean(editingId)} onChange={changeForm} onCancel={closeForm} onSave={() => void saveReference()} /> : null}
    <div className="reference-grid">
      {references.map((item) => {
        const attachments = state.contents.filter((content) => !content.deletedAt && content.referenceIds.includes(item.id)).length;
        return <article key={item.id} className="settings-item">
          <div className="settings-item-main"><strong>{item.title}</strong><span>{item.platform}</span><a href={item.url} target="_blank" rel="noreferrer" aria-label={`เปิดแหล่งอ้างอิง: ${item.title}`}>เปิดแหล่งอ้างอิง</a>{item.tags.length > 0 && <small>{item.tags.join(" · ")}</small>}{item.notes && <p>{item.notes}</p>}<span className="settings-meta">แนบกับคอนเทนต์ {attachments} ชิ้น</span></div>
          <div className="settings-item-actions"><button type="button" aria-label={`แก้ไข ${item.title}`} onClick={() => { setError(null); setEditingId(item.id); setForm(formFor(item)); setFormOpen(true); }}>แก้ไข</button><button type="button" aria-label={`ลบ ${item.title}`} onClick={() => setDeleting(item)}>ลบ Reference</button></div>
        </article>;
      })}
    </div>
    {activeReferences.length === 0 ? <p className="overview-state">ยังไม่มี Reference</p> : references.length === 0 ? <p className="overview-state">ไม่พบ Reference ที่ตรงกับการค้นหา</p> : null}
    {deleting && <AccessibleDialog labelledBy="delete-reference-heading" onClose={() => setDeleting(null)}><h2 id="delete-reference-heading">ยืนยันการลบ Reference</h2>{attachmentCount > 0 ? <p>Reference นี้ถูกแนบกับคอนเทนต์ {attachmentCount} ชิ้น</p> : <p>Reference นี้จะย้ายไปอยู่ในถังขยะและกู้คืนได้</p>}<div className="settings-dialog-actions"><button type="button" data-dialog-initial-focus onClick={() => setDeleting(null)}>ยกเลิก</button><button type="button" onClick={() => void confirmDelete()}>ยืนยันการลบ</button></div></AccessibleDialog>}
  </section>;
}

function ReferenceDialog({ form, editing, onChange, onCancel, onSave }: { form: ReferenceForm; editing: boolean; onChange: (field: keyof ReferenceForm, value: string) => void; onCancel: () => void; onSave: () => void }) {
  return <AccessibleDialog labelledBy="reference-dialog-heading" onClose={onCancel}><h2 id="reference-dialog-heading">{editing ? "แก้ไข Reference" : "เพิ่ม Reference"}</h2><label>ชื่อไอเดีย<input data-dialog-initial-focus value={form.title} onChange={(event) => onChange("title", event.target.value)} /></label><label>ลิงก์ HTTPS<input type="url" value={form.url} onChange={(event) => onChange("url", event.target.value)} /></label><label>แพลตฟอร์ม<input value={form.platform} onChange={(event) => onChange("platform", event.target.value)} /></label><label>แท็ก (คั่นด้วยจุลภาค)<input value={form.tags} onChange={(event) => onChange("tags", event.target.value)} /></label><label>โน้ต<textarea value={form.notes} onChange={(event) => onChange("notes", event.target.value)} /></label><div className="settings-dialog-actions"><button type="button" onClick={onCancel}>ยกเลิก</button><button type="button" onClick={onSave}>{editing ? "บันทึกการแก้ไข" : "บันทึก Reference"}</button></div></AccessibleDialog>;
}
