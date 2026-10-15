import type { MediaAsset } from "../domain/types";
import type { MediaBlobStore } from "../media/media-blob-store";
import { createUploadedMedia, MAX_MEDIA_BYTES } from "../media/media-commands";
import { createEmptyDashboardState } from "../domain/create-empty-state";
import { uploadMediaToBlob } from "../media/blob-media-upload";

export function validateReferenceFiles(files: File[]) {
  for (const file of files) {
    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) throw new Error("เลือกได้เฉพาะภาพหรือวิดีโอ");
    if (!file.size || file.size > MAX_MEDIA_BYTES) throw new Error("ไฟล์ต้องมีขนาดมากกว่า 0 และไม่เกิน 1 GB");
  }
}

export async function prepareReferenceFile(file: File, blobStore: MediaBlobStore, uploader = uploadMediaToBlob): Promise<MediaAsset> {
  validateReferenceFiles([file]);
  const id = `ref-media-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const asset = createUploadedMedia(createEmptyDashboardState(), { id, name: file.name, mimeType: file.type, size: file.size, now }).media[0];
  await blobStore.put(id, file);
  try {
    const result = await uploader({ assetId: id, name: file.name, mimeType: file.type, blob: file });
    return { ...asset, ...result };
  } catch (error) {
    await blobStore.remove(id).catch(() => undefined);
    throw error;
  }
}
