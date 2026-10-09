import type { DashboardState, MediaAsset } from "../domain/types";

export const MAX_MEDIA_BYTES = 1_073_741_824;

function tagsOf(tags: string[] = []): string[] {
  const clean = tags.map((tag) => tag.trim()).filter(Boolean);
  if (new Set(clean.map((tag) => tag.toLocaleLowerCase())).size !== clean.length) throw new Error("แท็กซ้ำกัน");
  return clean;
}

function nameOf(name: string): string {
  const clean = name.trim();
  if (!clean) throw new Error("กรุณาระบุชื่อไฟล์");
  return clean;
}

function httpsUrl(url: string, message = "ต้องเป็นลิงก์ https"): string {
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error(message); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error(message);
  return parsed.toString();
}

function baseAsset(input: { id: string; name: string; mimeType: string; size: number; now: string; tags?: string[]; source: MediaAsset["source"] }): MediaAsset {
  return { id: input.id, name: nameOf(input.name), mimeType: input.mimeType || "application/octet-stream", size: input.size, source: input.source, externalUrl: null, externalPreviewUrl: null, blobKey: input.source === "upload" ? input.id : null, remoteStatus: "local-only", providerFileId: null, previewProviderFileId: null, tags: tagsOf(input.tags), createdAt: input.now, updatedAt: input.now, deletedAt: null };
}

export function createUploadedMedia(state: DashboardState, input: { id: string; name: string; mimeType: string; size: number; now: string; tags?: string[] }): DashboardState {
  if (input.size > MAX_MEDIA_BYTES) throw new Error("ไฟล์มีขนาดเกิน 1 GB");
  return { ...state, media: [...state.media, baseAsset({ ...input, source: "upload" })] };
}

export function createExternalMedia(state: DashboardState, input: { id: string; name: string; mimeType: string; externalUrl: string; externalPreviewUrl?: string; now: string; tags?: string[] }): DashboardState {
  const externalUrl = httpsUrl(input.externalUrl);
  const isVideo = input.mimeType.toLowerCase().startsWith("video/");
  if (isVideo && !input.externalPreviewUrl) throw new Error("วิดีโอต้องมีลิงก์ภาพตัวอย่าง https");
  const externalPreviewUrl = input.externalPreviewUrl ? httpsUrl(input.externalPreviewUrl, "วิดีโอต้องมีลิงก์ภาพตัวอย่าง https") : null;
  const asset = { ...baseAsset({ id: input.id, name: input.name, mimeType: input.mimeType, size: 0, now: input.now, tags: input.tags, source: "external" }), externalUrl, externalPreviewUrl, blobKey: null, remoteStatus: "ready" as const };
  return { ...state, media: [...state.media, asset] };
}

export function updateMedia(state: DashboardState, id: string, patch: Partial<Pick<MediaAsset, "name" | "tags" | "externalUrl" | "externalPreviewUrl">>): DashboardState {
  return { ...state, media: state.media.map((asset) => {
    if (asset.id !== id) return asset;
    const next = { ...asset, ...patch, name: patch.name === undefined ? asset.name : nameOf(patch.name), tags: patch.tags === undefined ? asset.tags : tagsOf(patch.tags), updatedAt: new Date().toISOString() };
    if (next.externalUrl) next.externalUrl = httpsUrl(next.externalUrl);
    if (next.externalPreviewUrl) next.externalPreviewUrl = httpsUrl(next.externalPreviewUrl, "วิดีโอต้องมีลิงก์ภาพตัวอย่าง https");
    return next;
  }) };
}

export function moveMediaToTrash(state: DashboardState, id: string, now: string): DashboardState {
  return { ...state, media: state.media.map((asset) => asset.id === id ? { ...asset, deletedAt: now, updatedAt: now } : asset) };
}

export function restoreMedia(state: DashboardState, id: string): DashboardState {
  return { ...state, media: state.media.map((asset) => asset.id === id ? { ...asset, deletedAt: null, updatedAt: new Date().toISOString() } : asset) };
}
