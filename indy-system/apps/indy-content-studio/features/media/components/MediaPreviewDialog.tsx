"use client";

import { useEffect, useState } from "react";
import type { MediaAsset } from "../../domain/types";
import type { MediaBlobStore } from "../media-blob-store";

export function MediaPreviewDialog({ asset, blobStore, onClose }: { asset: MediaAsset | null; blobStore: MediaBlobStore; onClose: () => void }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    setPreviewUrl(null); setError(null);
    if (!asset) return () => undefined;
    if (asset.externalUrl) { setPreviewUrl(asset.externalUrl); return () => undefined; }
    void blobStore.get(asset.id).then((blob) => {
      if (!active) return;
      if (!blob) {
        if (asset.remoteStatus === "ready" && asset.providerFileId) {
          setPreviewUrl(`/api/media/preview/${encodeURIComponent(asset.id)}`);
        } else {
          setError("เปิดตัวอย่างสื่อไม่สำเร็จ");
        }
        return;
      }
      if (typeof URL.createObjectURL !== "function") { setError("เปิดตัวอย่างสื่อไม่สำเร็จ"); return; }
      objectUrl = URL.createObjectURL(blob); setPreviewUrl(objectUrl);
    }).catch(() => { if (active) setError("เปิดตัวอย่างสื่อไม่สำเร็จ"); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [asset, blobStore]);
  if (!asset) return null;
  return <div className="media-preview-backdrop"><section className="media-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="media-preview-heading"><div className="settings-panel-heading"><h2 id="media-preview-heading">{asset.name}</h2><button type="button" onClick={onClose} aria-label="ปิดตัวอย่างสื่อ">×</button></div>{error && <p role="alert">{error}</p>}{previewUrl && asset.mimeType.startsWith("image/") && <img src={previewUrl} alt={asset.name} onError={() => setError("เปิดตัวอย่างสื่อไม่สำเร็จ")} />}{previewUrl && asset.mimeType.startsWith("video/") && <video src={previewUrl} controls onError={() => setError("เปิดตัวอย่างสื่อไม่สำเร็จ")} />}{asset.externalUrl && <a href={asset.externalUrl} target="_blank" rel="noreferrer">เปิดลิงก์ต้นทาง</a>}<button type="button" onClick={onClose}>ปิด</button></section></div>;
}
