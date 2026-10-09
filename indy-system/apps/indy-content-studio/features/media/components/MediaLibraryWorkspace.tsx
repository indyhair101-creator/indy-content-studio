"use client";

import { useEffect, useMemo, useState } from "react";
import { useDashboardData } from "../../data/DashboardDataProvider";
import type { MediaAsset } from "../../domain/types";
import { createExternalMedia, createUploadedMedia, moveMediaToTrash, restoreMedia, updateMedia } from "../media-commands";
import { IndexedDbMediaBlobStore } from "../indexeddb-media-blob-store";
import type { MediaBlobStore } from "../media-blob-store";
import { uploadMediaToBlob } from "../blob-media-upload";
import { MediaPreviewDialog } from "./MediaPreviewDialog";
const activeProviderAttempts = new Map<string, symbol>();
const providerAttemptListeners = new Set<() => void>();

function notifyProviderAttemptListeners() {
  providerAttemptListeners.forEach((listener) => listener());
}

const remoteStatusLabels: Record<MediaAsset["remoteStatus"], string> = {
  "local-only": "เก็บไว้ในเครื่องนี้เท่านั้น",
  uploading: "กำลังอัปโหลดไป Vercel Blob…",
  ready: "พร้อมใช้ผ่าน Vercel Blob",
  failed: "อัปโหลดไป Vercel Blob ไม่สำเร็จ",
};

function nextId() {
  return `asset-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function MediaLibraryWorkspace({ blobStore }: { blobStore?: MediaBlobStore } = {}) {
  const dashboard = useDashboardData();
  const activeBlobStore = useMemo(() => blobStore ?? new IndexedDbMediaBlobStore(), [blobStore]);
  const [tab, setTab] = useState<"all" | "trash">("all");
  const [query, setQuery] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);
  const [externalName, setExternalName] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [externalPreviewUrl, setExternalPreviewUrl] = useState("");
  const [externalKind, setExternalKind] = useState("video/mp4");
  const [preview, setPreview] = useState<MediaAsset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, setAttemptRevision] = useState(0);

  useEffect(() => {
    const listener = () => setAttemptRevision((revision) => revision + 1);
    providerAttemptListeners.add(listener);
    return () => { providerAttemptListeners.delete(listener); };
  }, []);

  if (!dashboard.state) {
    return <section aria-labelledby="media-heading"><h1 id="media-heading">คลังสื่อ</h1><p>กำลังโหลดข้อมูล…</p></section>;
  }

  const assets = dashboard.state.media
    .filter((asset) => (tab === "trash" ? Boolean(asset.deletedAt) : !asset.deletedAt))
    .filter((asset) => asset.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));

  async function setRemoteState(id: string, patch: Pick<MediaAsset, "remoteStatus" | "providerFileId" | "previewProviderFileId">) {
    await dashboard.mutate((state) => ({
      ...state,
      media: state.media.map((asset) => asset.id === id ? { ...asset, ...patch, updatedAt: new Date().toISOString() } : asset),
    }));
  }

  async function uploadToProvider(asset: MediaAsset, source: Blob) {
    if (activeProviderAttempts.has(asset.id)) return;
    const attempt = Symbol(asset.id);
    activeProviderAttempts.set(asset.id, attempt);
    notifyProviderAttemptListeners();
    const isCurrentAttempt = () => activeProviderAttempts.get(asset.id) === attempt;

    try {
      await setRemoteState(asset.id, { remoteStatus: "uploading", providerFileId: null, previewProviderFileId: null });
      if (!isCurrentAttempt()) return;
      const result = await uploadMediaToBlob({ assetId: asset.id, name: asset.name, mimeType: asset.mimeType, blob: source });
      if (!isCurrentAttempt()) return;
      if (result.remoteStatus === "local-only") {
        await setRemoteState(asset.id, { remoteStatus: "local-only", providerFileId: null, previewProviderFileId: null });
        return;
      }

      if (isCurrentAttempt()) {
        await setRemoteState(asset.id, {
          remoteStatus: "ready",
          providerFileId: result.providerFileId,
          previewProviderFileId: result.previewProviderFileId,
        });
      }
    } catch (caught) {
      if (!isCurrentAttempt()) return;
      await setRemoteState(asset.id, { remoteStatus: "failed", providerFileId: null, previewProviderFileId: null }).catch(() => undefined);
      if (caught instanceof Error && caught.message === "ไม่สามารถสร้างภาพตัวอย่างจากวิดีโอนี้ได้") {
        setError(caught.message);
      } else if (!(caught instanceof Error && caught.message === "provider-upload-failed")) {
        setError("อัปโหลดไป Vercel Blob ไม่สำเร็จ");
      }
    } finally {
      if (isCurrentAttempt()) {
        activeProviderAttempts.delete(asset.id);
        notifyProviderAttemptListeners();
      }
    }
  }

  async function upload(file: File) {
    const id = nextId();
    const now = new Date().toISOString();
    try {
      createUploadedMedia(dashboard.state!, { id, name: file.name, mimeType: file.type, size: file.size, now });
      await activeBlobStore.put(id, file);
      await dashboard.mutate((state) => createUploadedMedia(state, { id, name: file.name, mimeType: file.type, size: file.size, now }));
    } catch (caught) {
      await activeBlobStore.remove(id).catch(() => undefined);
      setError(caught instanceof Error ? caught.message : "อัปโหลดไม่สำเร็จ");
      return;
    }

    setError(null);
    try {
      await uploadToProvider({
        id,
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        source: "upload",
        externalUrl: null,
        externalPreviewUrl: null,
        blobKey: id,
        remoteStatus: "local-only",
        providerFileId: null,
        previewProviderFileId: null,
        tags: [],
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }, file);
    } catch {
      setError("อัปโหลดไป Vercel Blob ไม่สำเร็จ");
    }
  }

  async function retryProviderUpload(asset: MediaAsset) {
    const blob = await activeBlobStore.get(asset.blobKey ?? asset.id);
    if (!blob) {
      setError("ไม่พบไฟล์ต้นฉบับในเครื่องนี้");
      return;
    }
    setError(null);
    await uploadToProvider(asset, blob);
  }

  async function addExternal() {
    const id = nextId();
    const now = new Date().toISOString();
    try {
      await dashboard.mutate((state) => createExternalMedia(state, { id, name: externalName, mimeType: externalKind, externalUrl, externalPreviewUrl: externalPreviewUrl || undefined, now }));
      setExternalName("");
      setExternalUrl("");
      setExternalPreviewUrl("");
      setLinkOpen(false);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "เพิ่มลิงก์ไม่สำเร็จ");
    }
  }

  async function trash(asset: MediaAsset) {
    await dashboard.mutate((state) => moveMediaToTrash(state, asset.id, new Date().toISOString()));
  }

  async function restore(asset: MediaAsset) {
    await dashboard.mutate((state) => restoreMedia(state, asset.id));
  }

  async function editTags(asset: MediaAsset) {
    const tags = window.prompt("แท็ก (คั่นด้วย comma)", asset.tags.join(", "));
    if (tags !== null) {
      try {
        await dashboard.mutate((state) => updateMedia(state, asset.id, { tags: tags.split(",") }));
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "แก้แท็กไม่สำเร็จ");
      }
    }
  }

  return <section className="media-library-workspace" aria-labelledby="media-heading">
    <div className="workspace-heading-row">
      <div><p className="eyebrow">INDY / MEDIA</p><h1 id="media-heading">คลังสื่อ</h1><p>เก็บไฟล์ต้นฉบับและลิงก์อ้างอิงไว้ที่เดียว · อัปโหลดได้ไม่เกิน 1 GB ต่อไฟล์</p></div>
      <div className="media-actions">
        <label className="media-upload-button">เลือกไฟล์สื่อ<input type="file" aria-label="เลือกไฟล์สื่อ" accept="image/*,video/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.currentTarget.value = ""; }} /></label>
        <button type="button" onClick={() => setLinkOpen(true)}>เพิ่มลิงก์ภายนอก</button>
      </div>
    </div>
    {error && <p className="settings-notice error" role="alert">{error}</p>}
    <div className="media-toolbar">
      <div className="media-tabs" role="tablist"><button type="button" role="tab" aria-selected={tab === "all"} onClick={() => setTab("all")}>ทั้งหมด</button><button type="button" role="tab" aria-selected={tab === "trash"} onClick={() => setTab("trash")}>ถังขยะ</button></div>
      <label className="media-search">ค้นหาสื่อ<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
    </div>
    {assets.length === 0
      ? <p className="overview-state">{tab === "trash" ? "ถังขยะว่าง" : "ยังไม่มีสื่อในคลัง"}</p>
      : <div className="media-grid">{assets.map((asset) => <article className="media-card" key={asset.id}>
        <div className="media-card-preview" aria-hidden="true">{asset.mimeType.startsWith("video/") ? "▶" : "▧"}</div>
        <strong>{asset.name}</strong>
        <span>{asset.source === "external" ? "ลิงก์ภายนอก" : `${Math.round(asset.size / 1024)} KB`}</span>
        {asset.source === "upload" && <span className={`media-remote-status ${asset.remoteStatus}`} aria-live="polite">{remoteStatusLabels[asset.remoteStatus]}</span>}
        <div className="media-card-actions">
          {tab === "all" && <>
            <button type="button" onClick={() => setPreview(asset)}>ดูตัวอย่าง</button>
            <button type="button" onClick={() => void editTags(asset)}>แก้แท็ก</button>
            {(asset.remoteStatus === "local-only" || asset.remoteStatus === "failed" || asset.remoteStatus === "uploading") && !activeProviderAttempts.has(asset.id) && <button type="button" onClick={() => void retryProviderUpload(asset)} aria-label={`ลองอัปโหลด ${asset.name} อีกครั้ง`}>ลองอีกครั้ง</button>}
            <button type="button" onClick={() => void trash(asset)} aria-label={`ย้าย ${asset.name} ไปถังขยะ`}>ถังขยะ</button>
          </>}
          {tab === "trash" && <button type="button" onClick={() => void restore(asset)} aria-label={`กู้คืน ${asset.name}`}>กู้คืน</button>}
        </div>
        {asset.tags.length > 0 && <small>{asset.tags.join(" · ")}</small>}
      </article>)}</div>}
    {linkOpen && <div className="settings-dialog-backdrop"><section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="external-dialog-heading">
      <h2 id="external-dialog-heading">เพิ่มลิงก์ภายนอก</h2>
      <label>ชื่อสื่อภายนอก<input aria-label="ชื่อสื่อภายนอก" value={externalName} onChange={(event) => setExternalName(event.target.value)} /></label>
      <label>ลิงก์สื่อ<input aria-label="ลิงก์สื่อ" type="url" value={externalUrl} onChange={(event) => setExternalUrl(event.target.value)} /></label>
      <label>ลิงก์ภาพตัวอย่าง<input aria-label="ลิงก์ภาพตัวอย่าง" type="url" value={externalPreviewUrl} onChange={(event) => setExternalPreviewUrl(event.target.value)} /></label>
      <label>ชนิดสื่อ<select value={externalKind} onChange={(event) => setExternalKind(event.target.value)}><option value="video/mp4">วิดีโอ</option><option value="image/jpeg">ภาพ</option></select></label>
      <div className="settings-dialog-actions"><button type="button" onClick={() => setLinkOpen(false)}>ยกเลิก</button><button type="button" onClick={() => void addExternal()}>บันทึกลิงก์</button></div>
    </section></div>}
    <MediaPreviewDialog asset={preview} blobStore={activeBlobStore} onClose={() => setPreview(null)} />
  </section>;
}
