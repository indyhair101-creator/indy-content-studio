"use client";

import { useRef, useState } from "react";
import type { MediaAsset, ReferenceIdea } from "../../domain/types";
import { useDashboardData } from "../../data/DashboardDataProvider";
import { AccessibleDialog } from "../../shared/components/AccessibleDialog";
import type { MediaBlobStore } from "../../media/media-blob-store";
import { addReference, updateReference } from "../reference-commands";
import { prepareReferenceFile, validateReferenceFiles } from "../reference-upload";

export function ReferenceEditorDialog({ reference, albumId, blobStore, onClose, onSaved }: { reference: ReferenceIdea | null; albumId: string | null; blobStore: MediaBlobStore; onClose: () => void; onSaved?: (albumId: string | null) => void }) {
  const dashboard = useDashboardData();
  const [title, setTitle] = useState(reference?.title ?? "");
  const [url, setUrl] = useState(reference?.url ?? "");
  const [includeLink, setIncludeLink] = useState(reference ? Boolean(reference.url) : true);
  const [album, setAlbum] = useState(reference?.albumId ?? albumId ?? "");
  const [platform, setPlatform] = useState(reference?.platform ?? "");
  const [tags, setTags] = useState(reference?.tags.join(", ") ?? "");
  const [notes, setNotes] = useState(reference?.notes ?? "");
  const [assetIds, setAssetIds] = useState(reference?.assetIds ?? []);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const prepared = useRef(new Map<File, MediaAsset>());
  const id = useRef(reference?.id ?? `reference-${crypto.randomUUID()}`);

  async function save() {
    if (saving || !dashboard.state) return;
    setError(null);
    setSaving(true);
    try {
      const fields = { title, url: includeLink ? url : "", platform, tags: tags.split(","), notes, albumId: album || null, assetIds };
      // Check metadata before uploading any bytes.
      if (reference) updateReference(dashboard.state, reference.id, fields);
      else addReference(dashboard.state, { ...fields, id: id.current, now: new Date().toISOString() });
      validateReferenceFiles(files);
      const assets: MediaAsset[] = [];
      for (const [index, file] of files.entries()) {
        setProgress(`กำลังอัปโหลด ${index + 1}/${files.length}: ${file.name}`);
        let asset = prepared.current.get(file);
        if (!asset) {
          asset = await prepareReferenceFile(file, blobStore);
          prepared.current.set(file, asset);
        }
        assets.push(asset);
      }
      setProgress("กำลังบันทึก Reference…");
      await dashboard.mutate((state) => {
        const existingIds = new Set(state.media.map((asset) => asset.id));
        const next = { ...state, media: [...state.media, ...assets.filter((asset) => !existingIds.has(asset.id))] };
        const patch = { ...fields, assetIds: [...assetIds, ...assets.map((asset) => asset.id)] };
        const now = new Date().toISOString();
        return reference ? updateReference(next, reference.id, patch, now) : addReference(next, { ...patch, id: id.current, now });
      });
      onSaved?.(album || null);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "บันทึก Reference ไม่สำเร็จ");
    } finally {
      setSaving(false);
      setProgress("");
    }
  }

  function chooseFiles(next: File[]) {
    try {
      validateReferenceFiles(next);
      setFiles((current) => [...current, ...next]);
      if (!title.trim() && next[0]) setTitle(next[0].name.replace(/\.[^.]+$/, ""));
      setError(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "เลือกไฟล์ไม่สำเร็จ"); }
  }

  return <AccessibleDialog labelledBy="reference-dialog-heading" onClose={() => { if (!saving) onClose(); }} className="settings-dialog reference-editor-dialog">
    <div className="workspace-heading-row"><h2 id="reference-dialog-heading">{reference ? "แก้ไข Reference" : "เพิ่ม Reference"}</h2><button type="button" disabled={saving} aria-label="ปิด Reference" onClick={onClose}>×</button></div>
    <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <fieldset disabled={saving} className="reference-form-fields">
        <label>ชื่อไอเดีย<input data-dialog-initial-focus value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label>อัลบั้ม<select value={album} onChange={(event) => setAlbum(event.target.value)}><option value="">ยังไม่จัดอัลบั้ม</option>{dashboard.state?.referenceAlbums?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="reference-link-toggle"><input type="checkbox" checked={includeLink} onChange={(event) => setIncludeLink(event.target.checked)} />ใส่ลิงก์อ้างอิง</label>
        {includeLink && <label>ลิงก์ HTTPS<input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://… (เว้นว่างได้)" /></label>}
        <label className="reference-upload-area"><strong>เพิ่มภาพหรือวิดีโอ</strong><span>เลือกหลายไฟล์พร้อมกันได้ · ไม่เกิน 1 GB ต่อไฟล์</span><input type="file" accept="image/*,video/*" multiple aria-label="เลือกภาพหรือวิดีโอ Reference" onChange={(event) => { chooseFiles(Array.from(event.target.files ?? [])); event.currentTarget.value = ""; }} /></label>
        {(files.length > 0 || assetIds.length > 0) && <ul className="reference-file-list">
          {assetIds.map((assetId) => <li key={assetId}><span>{dashboard.state?.media.find((asset) => asset.id === assetId)?.name ?? "ไฟล์ไม่พร้อมใช้งาน"}</span><button type="button" aria-label={`นำไฟล์แนบ ${assetId} ออก`} onClick={() => setAssetIds((current) => current.filter((id) => id !== assetId))}>นำออก</button></li>)}
          {files.map((file, index) => <li key={index}><span>{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</span><button type="button" aria-label={`นำ ${file.name} ออก`} onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}>นำออก</button></li>)}
        </ul>}
        <label>แพลตฟอร์ม<input value={platform} onChange={(event) => setPlatform(event.target.value)} placeholder="เช่น Instagram" /></label>
        <label>แท็ก (คั่นด้วยจุลภาค)<input value={tags} onChange={(event) => setTags(event.target.value)} /></label>
        <label>โน้ต<textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
      </fieldset>
      {error && <p role="alert" className="settings-notice error">{error}</p>}
      {saving && <p role="status">{progress || "กำลังบันทึก…"}</p>}
      <div className="settings-dialog-actions"><button type="button" disabled={saving} onClick={onClose}>ยกเลิก</button><button type="submit" disabled={saving}>{saving ? "กำลังบันทึก…" : reference ? "บันทึกการแก้ไข" : "บันทึก Reference"}</button></div>
    </form>
  </AccessibleDialog>;
}
