"use client";

import { useEffect, useState } from "react";
import type { MediaAsset } from "../../domain/types";
import type { MediaBlobStore } from "../../media/media-blob-store";

export function ReferenceMediaThumbnail({ asset, blobStore, onOpen }: { asset: MediaAsset; blobStore: MediaBlobStore; onOpen: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const video = asset.mimeType.startsWith("video/");
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    setFailed(false);
    setUrl(null);
    if (asset.externalUrl) {
      setUrl(video ? asset.externalPreviewUrl : asset.externalUrl);
      return;
    }
    if (asset.remoteStatus === "ready" && asset.providerFileId) {
      setUrl(`/api/media/preview/${encodeURIComponent(asset.id)}?variant=thumbnail`);
      return;
    }
    void blobStore.get(asset.blobKey ?? asset.id).then((blob) => {
      if (!active || !blob || video || typeof URL.createObjectURL !== "function") return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [asset.id, asset.blobKey, asset.remoteStatus, asset.providerFileId, asset.externalUrl, asset.externalPreviewUrl, video, blobStore]);
  return <button type="button" className="reference-media-thumb" onClick={onOpen} aria-label={`ดู${video ? "วิดีโอ" : "ภาพ"} ${asset.name}`}>
    {url && !failed ? <img src={url} alt={asset.name} loading="lazy" onError={() => setFailed(true)} /> : <span aria-hidden="true">{video ? "▶" : "▧"}</span>}
    {video && url && !failed && <span className="reference-video-badge" aria-hidden="true">▶</span>}
    <small>{asset.name}</small>
  </button>;
}
