"use client";

import { useMemo, useState } from "react";
import type { MediaAsset, ReferenceIdea } from "../../domain/types";
import { useDashboardData } from "../../data/DashboardDataProvider";
import { AccessibleDialog } from "../../shared/components/AccessibleDialog";
import { IndexedDbMediaBlobStore } from "../../media/indexeddb-media-blob-store";
import type { MediaBlobStore } from "../../media/media-blob-store";
import { MediaPreviewDialog } from "../../media/components/MediaPreviewDialog";
import { deleteReference, saveReferenceAlbum } from "../reference-commands";
import { ReferenceEditorDialog } from "./ReferenceEditorDialog";
import { ReferenceMediaThumbnail } from "./ReferenceMediaThumbnail";

export function ReferencesWorkspace({ blobStore }: { blobStore?: MediaBlobStore } = {}) {
  const dashboard = useDashboardData();
  const activeBlobStore = useMemo(() => blobStore ?? new IndexedDbMediaBlobStore(), [blobStore]);
  const [query, setQuery] = useState("");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [editor, setEditor] = useState<{ reference: ReferenceIdea | null; albumId: string | null } | null>(null);
  const [albumEditor, setAlbumEditor] = useState<{ id: string; name: string } | null>(null);
  const [albumSaving, setAlbumSaving] = useState(false);
  const [openAlbums, setOpenAlbums] = useState(new Set(["ungrouped"]));
  const [deleting, setDeleting] = useState<ReferenceIdea | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [preview, setPreview] = useState<MediaAsset | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeReferences = useMemo(() => dashboard.state?.references.filter((item) => !item.deletedAt) ?? [], [dashboard.state]);
  const platformOptions = useMemo(() => [...new Set(activeReferences.map((item) => item.platform))].sort(), [activeReferences]);
  const references = activeReferences.filter((item) => {
    const albumName = dashboard.state?.referenceAlbums?.find((album) => album.id === item.albumId)?.name ?? "";
    const haystack = [item.title, item.url, item.platform, item.tags.join(" "), item.notes, albumName].join(" ").toLowerCase();
    return haystack.includes(query.trim().toLowerCase()) && (platformFilter === "all" || item.platform === platformFilter);
  });

  async function saveAlbum() {
    if (!albumEditor || albumSaving) return;
    setAlbumSaving(true);
    try {
      await dashboard.mutate((state) => saveReferenceAlbum(state, albumEditor.id, albumEditor.name, new Date().toISOString()));
      setOpenAlbums((current) => new Set([...current, albumEditor.id]));
      setAlbumEditor(null);
      setError(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "บันทึกอัลบั้มไม่สำเร็จ"); }
    finally { setAlbumSaving(false); }
  }

  async function confirmDelete() {
    if (!deleting || deleteSaving) return;
    setDeleteSaving(true);
    try {
      await dashboard.mutate((state) => deleteReference(state, deleting.id, new Date().toISOString()));
      setError(null);
      setDeleting(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "ลบ Reference ไม่สำเร็จ"); }
    finally { setDeleteSaving(false); }
  }

  if (!dashboard.state && dashboard.status === "loading") return <section className="workspace-surface" aria-labelledby="references-heading"><h1 id="references-heading">Reference และไอเดีย</h1><p role="status">กำลังโหลดข้อมูล…</p></section>;
  if (!dashboard.state) return <section className="workspace-surface" aria-labelledby="references-heading"><h1 id="references-heading">Reference และไอเดีย</h1><p role="alert">{dashboard.error?.message ?? "โหลดข้อมูลไม่สำเร็จ"}</p><button type="button" onClick={() => void dashboard.reload()}>ลองใหม่</button></section>;

  const state = dashboard.state;
  const attachmentCount = deleting ? state.contents.filter((item) => !item.deletedAt && item.referenceIds.includes(deleting.id)).length : 0;
  const albums = [...(state.referenceAlbums ?? []).map((album) => ({ ...album, albumId: album.id })), { id: "ungrouped", albumId: null, name: "ยังไม่จัดอัลบั้ม" }];

  function renderReference(item: ReferenceIdea) {
    const attachments = state.contents.filter((content) => !content.deletedAt && content.referenceIds.includes(item.id)).length;
    const assets = (item.assetIds ?? []).map((id) => state.media.find((asset) => asset.id === id && !asset.deletedAt)).filter((asset): asset is MediaAsset => Boolean(asset));
    return <article key={item.id} className="reference-card">
      {assets.length > 0 && <div className="reference-card-media">{assets.map((asset) => <ReferenceMediaThumbnail key={asset.id} asset={asset} blobStore={activeBlobStore} onOpen={() => setPreview(asset)} />)}</div>}
      <div className="settings-item-main"><strong>{item.title}</strong><span>{item.platform}</span>{item.url && <a href={item.url} target="_blank" rel="noreferrer" aria-label={`เปิดแหล่งอ้างอิง: ${item.title}`}>เปิดแหล่งอ้างอิง ↗</a>}{item.tags.length > 0 && <small>{item.tags.join(" · ")}</small>}{item.notes && <p>{item.notes}</p>}<span className="settings-meta">แนบกับคอนเทนต์ {attachments} ชิ้น</span>
        {assets.some((asset) => asset.source === "upload" && asset.remoteStatus !== "ready") && <small className="reference-local-notice">ไฟล์บางรายการเก็บในเครื่องนี้เท่านั้น ยังไม่พร้อมเปิดจากเครื่องอื่น</small>}
        {(item.assetIds?.length ?? 0) > assets.length && <small>ไฟล์บางรายการอยู่ในถังขยะ</small>}
      </div>
      <div className="settings-item-actions"><button type="button" aria-label={`แก้ไข ${item.title}`} onClick={() => { setError(null); setEditor({ reference: item, albumId: item.albumId ?? null }); }}>แก้ไข</button><button type="button" aria-label={`ลบ ${item.title}`} onClick={() => { setError(null); setDeleting(item); }}>ลบ Reference</button></div>
    </article>;
  }

  return <section className="workspace-surface references-workspace" aria-labelledby="references-heading">
    <div className="workspace-heading-row">
      <div><h1 id="references-heading">Reference และไอเดีย</h1></div>
      <div className="reference-toolbar-actions">
        <button type="button" onClick={() => { setError(null); setAlbumEditor({ id: `ref-album-${crypto.randomUUID()}`, name: "" }); }}>สร้างอัลบั้ม</button>
        <button type="button" onClick={() => { setError(null); setEditor({ reference: null, albumId: null }); }}>เพิ่ม Reference</button>
      </div>
    </div>
    {(error || dashboard.error) && !albumEditor && !deleting && <p role="alert" className="settings-notice error">{error ?? dashboard.error?.message}</p>}
    <div className="reference-filters">
      <label className="workspace-search-inline">ค้นหาไอเดีย<input type="search" value={query} placeholder="ชื่อไอเดีย อัลบั้ม หรือแท็ก" onChange={(event) => { setQuery(event.target.value); if (event.target.value.trim()) setOpenAlbums(new Set(albums.map((album) => album.id))); }} /></label>
      <label>กรองแพลตฟอร์ม<select value={platformFilter} onChange={(event) => setPlatformFilter(event.target.value)}><option value="all">ทั้งหมด</option>{platformOptions.map((platform) => <option key={platform} value={platform}>{platform}</option>)}</select></label>
    </div>
    <div className="reference-albums">{albums.map((album) => {
      const items = references.filter((reference) => (reference.albumId ?? null) === album.albumId);
      const total = activeReferences.filter((reference) => (reference.albumId ?? null) === album.albumId).length;
      const expanded = openAlbums.has(album.id);
      if (album.id === "ungrouped" && total === 0 && (state.referenceAlbums?.length ?? 0) > 0) return null;
      return <section className="reference-album" key={album.id} aria-label={`อัลบั้ม ${album.name}`}>
        <div className="reference-album-header">
          <button type="button" className="reference-album-toggle" aria-expanded={expanded} aria-controls={`album-${album.id}`} onClick={() => setOpenAlbums((current) => { const next = new Set(current); if (next.has(album.id)) next.delete(album.id); else next.add(album.id); return next; })}>
            <span aria-hidden="true" className="reference-album-icon">▧</span><span><strong>{album.name}</strong><small>{query.trim() || platformFilter !== "all" ? `${items.length} จาก ${total}` : total} รายการ</small></span><span className="reference-album-chevron">{expanded ? "ซ่อน ▴" : "เปิดอัลบั้ม ▾"}</span>
          </button>
          <div className="reference-album-actions">
            {album.albumId && <button type="button" aria-label={`เปลี่ยนชื่ออัลบั้ม ${album.name}`} onClick={() => { setError(null); setAlbumEditor({ id: album.id, name: album.name }); }}>เปลี่ยนชื่อ</button>}
            <button type="button" aria-label={`เพิ่ม Reference ใน ${album.name}`} onClick={() => { setError(null); setEditor({ reference: null, albumId: album.albumId }); }}>เพิ่มในอัลบั้ม</button>
          </div>
        </div>
        {expanded && <div id={`album-${album.id}`} className="reference-album-content">{items.length > 0 ? <div className="reference-grid">{items.map(renderReference)}</div> : <p className="overview-state">{total > 0 ? "ไม่มีรายการที่ตรงกับตัวกรองในอัลบั้มนี้" : "ยังไม่มี Reference ในอัลบั้มนี้ · เพิ่มลิงก์ ภาพ หรือวิดีโอได้เลย"}</p>}</div>}
      </section>;
    })}</div>
    {activeReferences.length === 0 && <p className="overview-state">ยังไม่มี Reference</p>}
    {activeReferences.length > 0 && references.length === 0 && <p className="overview-state">ไม่พบ Reference ที่ตรงกับการค้นหา</p>}
    {editor && <ReferenceEditorDialog key={editor.reference?.id ?? editor.albumId ?? "new"} reference={editor.reference} albumId={editor.albumId} blobStore={activeBlobStore} onClose={() => setEditor(null)} onSaved={(albumId) => setOpenAlbums((current) => new Set([...current, albumId ?? "ungrouped"]))} />}
    {albumEditor && <AccessibleDialog labelledBy="reference-album-dialog-heading" onClose={() => { if (!albumSaving) setAlbumEditor(null); }}>
      <h2 id="reference-album-dialog-heading">{state.referenceAlbums?.some((album) => album.id === albumEditor.id) ? "เปลี่ยนชื่ออัลบั้ม" : "สร้างอัลบั้ม Reference"}</h2>
      <form onSubmit={(event) => { event.preventDefault(); void saveAlbum(); }}><label>ชื่ออัลบั้ม<input data-dialog-initial-focus disabled={albumSaving} value={albumEditor.name} placeholder="เช่น Poster ตารางเรียน" onChange={(event) => setAlbumEditor({ ...albumEditor, name: event.target.value })} /></label>{error && <p role="alert">{error}</p>}<div className="settings-dialog-actions"><button type="button" disabled={albumSaving} onClick={() => setAlbumEditor(null)}>ยกเลิก</button><button type="submit" disabled={albumSaving}>{albumSaving ? "กำลังบันทึก…" : "บันทึกอัลบั้ม"}</button></div></form>
    </AccessibleDialog>}
    {deleting && <AccessibleDialog labelledBy="delete-reference-heading" onClose={() => { if (!deleteSaving) setDeleting(null); }}><h2 id="delete-reference-heading">ยืนยันการลบ Reference</h2>{attachmentCount > 0 ? <p>Reference นี้ถูกแนบกับคอนเทนต์ {attachmentCount} ชิ้น</p> : <p>Reference นี้จะย้ายไปอยู่ในถังขยะและกู้คืนได้</p>}{error && <p role="alert">{error}</p>}<div className="settings-dialog-actions"><button type="button" data-dialog-initial-focus disabled={deleteSaving} onClick={() => setDeleting(null)}>ยกเลิก</button><button type="button" disabled={deleteSaving} onClick={() => void confirmDelete()}>ยืนยันการลบ</button></div></AccessibleDialog>}
    {preview && <MediaPreviewDialog asset={preview} blobStore={activeBlobStore} onClose={() => setPreview(null)} />}
  </section>;
}
