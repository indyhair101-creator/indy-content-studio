"use client";

import { useState } from "react";
import type { CaptionTemplate, CaptionTemplateVersion } from "../../domain/types";
import { useDashboardData } from "../../data/DashboardDataProvider";
import { contentToDraft, saveContentDraft } from "../../content/content-commands";
import { AccessibleDialog } from "../../shared/components/AccessibleDialog";
import { addCaptionTemplate, addCaptionTemplateVersion, renameCaptionTemplate } from "../template-commands";
import { TemplatePreviewDialog } from "./TemplatePreviewDialog";

type PreviewTarget = { template: CaptionTemplate; version: CaptionTemplateVersion };

function activeVersion(template: CaptionTemplate) {
  return template.versions.find((version) => version.id === template.activeVersionId) ?? template.versions.at(-1)!;
}

export function CaptionTemplatesWorkspace() {
  const dashboard = useDashboardData();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [renameTarget, setRenameTarget] = useState<CaptionTemplate | null>(null);
  const [versionTarget, setVersionTarget] = useState<CaptionTemplate | null>(null);
  const [preview, setPreview] = useState<PreviewTarget | null>(null);
  const [error, setError] = useState<string | null>(null);

  function closeCreate() {
    setCreateOpen(false);
    setName("");
    setBody("");
  }

  async function createTemplate() {
    try {
      await dashboard.mutate((state) => addCaptionTemplate(state, { id: `template-${Date.now()}`, name, body, now: new Date().toISOString() }));
      setError(null);
      closeCreate();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "บันทึกแม่แบบไม่สำเร็จ");
    }
  }

  async function renameTemplate() {
    if (!renameTarget) return;
    try {
      await dashboard.mutate((state) => renameCaptionTemplate(state, renameTarget.id, name, new Date().toISOString()));
      setError(null);
      setRenameTarget(null);
      setName("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "เปลี่ยนชื่อแม่แบบไม่สำเร็จ");
    }
  }

  async function addVersion() {
    if (!versionTarget) return;
    try {
      await dashboard.mutate((state) => ({
        ...state,
        captionTemplates: state.captionTemplates.map((template) => template.id === versionTarget.id
          ? addCaptionTemplateVersion(template, { id: `${template.id}-v${Math.max(0, ...template.versions.map((item) => item.version)) + 1}`, body, now: new Date().toISOString() })
          : template),
      }));
      setError(null);
      setVersionTarget(null);
      setBody("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "บันทึกเวอร์ชันใหม่ไม่สำเร็จ");
    }
  }

  async function applyCaption(contentId: string, caption: string, values: Record<string, string>) {
    if (!preview) return;
    const source = { templateId: preview.template.id, versionId: preview.version.id, values: { ...values } };
    const now = new Date().toISOString();
    await dashboard.mutate((state) => ({
      ...state,
      contents: state.contents.map((content) => {
        if (content.id !== contentId) return content;
        return { ...saveContentDraft(content, { ...contentToDraft(content), caption }, now), captionSource: source };
      }),
    }));
  }

  if (!dashboard.state && dashboard.status === "loading") {
    return <section className="workspace-surface" aria-labelledby="templates-heading"><h1 id="templates-heading">แม่แบบแคปชั่น</h1><p role="status">กำลังโหลดข้อมูล…</p></section>;
  }
  if (!dashboard.state) {
    return <section className="workspace-surface" aria-labelledby="templates-heading"><h1 id="templates-heading">แม่แบบแคปชั่น</h1><p role="alert">{dashboard.error?.message ?? "โหลดข้อมูลไม่สำเร็จ"}</p><button type="button" onClick={() => void dashboard.reload()}>ลองใหม่</button></section>;
  }

  const templates = dashboard.state.captionTemplates.filter((template) => !template.deletedAt);
  const contents = dashboard.state.contents.filter((content) => !content.deletedAt);
  return <section className="workspace-surface" aria-labelledby="templates-heading">
    <div className="workspace-heading-row"><div><p className="eyebrow">INDY / CAPTIONS</p><h1 id="templates-heading">แม่แบบแคปชั่น</h1></div><button type="button" onClick={() => { setError(null); setCreateOpen(true); }}>เพิ่มแม่แบบ</button></div>
    {(error || dashboard.error) && <p role="alert" className="settings-notice error">{error ?? dashboard.error?.message}</p>}
    {templates.length === 0 ? <p className="overview-state">ยังไม่มีแม่แบบแคปชั่น</p> : <div className="template-grid">{templates.map((template) => {
      const version = activeVersion(template);
      return <article key={template.id} className="settings-item"><div className="settings-item-main"><strong>{template.name}</strong><span>เวอร์ชันปัจจุบัน {version.version}</span><span className="settings-meta">ตัวแปร: {version.variables.length ? version.variables.join(", ") : "ไม่มี"}</span><time className="settings-meta" dateTime={template.updatedAt}>อัปเดตล่าสุด: {template.updatedAt}</time><code>{version.body}</code><details open><summary>ประวัติเวอร์ชัน</summary>{template.versions.map((item) => <div key={item.id}><strong>เวอร์ชัน {item.version}</strong><p>{item.body}</p></div>)}</details></div><div className="settings-item-actions"><button type="button" aria-label={`ดูตัวอย่าง ${template.name}`} onClick={() => setPreview({ template, version })}>ดูตัวอย่าง</button><button type="button" aria-label={`เปลี่ยนชื่อ ${template.name}`} onClick={() => { setError(null); setRenameTarget(template); setName(template.name); }}>เปลี่ยนชื่อ</button><button type="button" aria-label={`สร้างเวอร์ชันใหม่ ${template.name}`} onClick={() => { setError(null); setVersionTarget(template); setBody(version.body); }}>สร้างเวอร์ชันใหม่</button></div></article>;
    })}</div>}
    {createOpen && <TemplateFormDialog title="เพิ่มแม่แบบแคปชั่น" name={name} body={body} onName={setName} onBody={setBody} onCancel={closeCreate} onSave={() => void createTemplate()} saveLabel="บันทึกแม่แบบ" />}
    {renameTarget && <AccessibleDialog labelledBy="rename-template-heading" onClose={() => setRenameTarget(null)}><h2 id="rename-template-heading">เปลี่ยนชื่อแม่แบบ</h2><label>ชื่อแม่แบบ<input data-dialog-initial-focus value={name} onChange={(event) => setName(event.target.value)} /></label><div className="settings-dialog-actions"><button type="button" onClick={() => setRenameTarget(null)}>ยกเลิก</button><button type="button" onClick={() => void renameTemplate()}>บันทึกชื่อ</button></div></AccessibleDialog>}
    {versionTarget && <TemplateFormDialog title="สร้างเวอร์ชันใหม่" name={versionTarget.name} body={body} onName={() => undefined} onBody={setBody} onCancel={() => setVersionTarget(null)} onSave={() => void addVersion()} saveLabel="บันทึกเวอร์ชันใหม่" versionOnly />}
    {preview && <TemplatePreviewDialog key={preview.version.id} template={preview.template} version={preview.version} contents={contents} onApply={applyCaption} onClose={() => setPreview(null)} />}
  </section>;
}

function TemplateFormDialog({ title, name, body, onName, onBody, onCancel, onSave, saveLabel, versionOnly = false }: { title: string; name: string; body: string; onName: (value: string) => void; onBody: (value: string) => void; onCancel: () => void; onSave: () => void; saveLabel: string; versionOnly?: boolean }) {
  return <AccessibleDialog labelledBy="template-dialog-heading" onClose={onCancel}><h2 id="template-dialog-heading">{title}</h2>{!versionOnly && <label>ชื่อแม่แบบ<input data-dialog-initial-focus value={name} onChange={(event) => onName(event.target.value)} /></label>}<label>{versionOnly ? "เนื้อหาเวอร์ชันใหม่" : "เนื้อหาแม่แบบ"}<textarea data-dialog-initial-focus={versionOnly || undefined} value={body} onChange={(event) => onBody(event.target.value)} /></label><div className="settings-dialog-actions"><button type="button" onClick={onCancel}>ยกเลิก</button><button type="button" onClick={onSave}>{saveLabel}</button></div></AccessibleDialog>;
}
