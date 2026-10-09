"use client";

import { useMemo, useState } from "react";
import type { CaptionTemplate, CaptionTemplateVersion, ContentItem } from "../../domain/types";
import { AccessibleDialog } from "../../shared/components/AccessibleDialog";
import { renderCaptionTemplate } from "../render-template";

export function TemplatePreviewDialog({ template, version, contents, onApply, onClose }: { template: CaptionTemplate; version: CaptionTemplateVersion; contents: ContentItem[]; onApply: (contentId: string, text: string, values: Record<string, string>) => Promise<void>; onClose: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [contentId, setContentId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const rendered = useMemo(() => renderCaptionTemplate(version.body, values), [values, version.body]);

  async function copy() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("ไม่สามารถคัดลอกแคปชั่นได้");
      await navigator.clipboard.writeText(rendered.text);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ไม่สามารถคัดลอกแคปชั่นได้");
    }
  }

  async function apply() {
    if (!contentId) {
      setError("กรุณาเลือกคอนเทนต์");
      return;
    }
    try {
      await onApply(contentId, rendered.text, values);
      setError(null);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ใช้แม่แบบกับคอนเทนต์ไม่สำเร็จ");
    }
  }

  return <AccessibleDialog labelledBy="template-preview-heading" onClose={onClose}><div className="workspace-heading-row"><h2 id="template-preview-heading">ตัวอย่างแคปชั่น</h2><button type="button" data-dialog-initial-focus aria-label="ปิดตัวอย่างแคปชั่น" onClick={onClose}>×</button></div><p className="settings-meta">{template.name} · เวอร์ชัน {version.version}</p>{version.variables.map((name) => <label key={name}>{name}<input value={values[name] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [name]: event.target.value }))} /></label>)}{rendered.missing.length > 0 && <p>ยังขาดค่า: {rendered.missing.join(", ")}</p>}<p className="caption-preview-text">{rendered.text}</p>{error && <p role="alert">{error}</p>}<label>เลือกคอนเทนต์ที่จะใช้<select value={contentId} onChange={(event) => setContentId(event.target.value)}><option value="">เลือกคอนเทนต์</option>{contents.map((content) => <option key={content.id} value={content.id}>{content.title}</option>)}</select></label><div className="settings-dialog-actions"><button type="button" onClick={() => void copy()}>คัดลอกแคปชั่น</button><button type="button" onClick={() => void apply()}>ใช้กับคอนเทนต์</button><button type="button" onClick={onClose}>ปิด</button></div></AccessibleDialog>;
}
