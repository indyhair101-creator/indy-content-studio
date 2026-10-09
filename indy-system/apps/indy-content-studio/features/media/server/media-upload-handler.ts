import type { GoogleDriveMediaClient } from "./google-drive-media-client";
import type { AuthorizeMediaUpload } from "./media-upload-authorization";

const MAX_MEDIA_BYTES = 52_428_800;
const VIDEO_FILE_EXTENSIONS = new Set([
  "3gp",
  "avi",
  "m4v",
  "mkv",
  "mov",
  "mp4",
  "mpeg",
  "mpg",
  "ogv",
  "webm",
]);

type MediaUploadDependencies = {
  getClient: () => GoogleDriveMediaClient | null | Promise<GoogleDriveMediaClient | null>;
  authorizeUpload: AuthorizeMediaUpload;
  allowedOrigin?: string | null;
};

function isUploadedFile(value: FormDataEntryValue | null): value is File {
  return value instanceof Blob && typeof (value as File).name === "string";
}

function isVideoFile(file: File): boolean {
  if (file.type.trim().toLowerCase().startsWith("video/")) return true;
  const extension = file.name.trim().toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  return extension ? VIDEO_FILE_EXTENSIONS.has(extension) : false;
}

function hasAllowedOrigin(request: Request, allowedOrigin: string | null | undefined): boolean {
  if (!allowedOrigin) return true;
  try {
    return request.headers.get("origin") === new URL(allowedOrigin).origin;
  } catch {
    return false;
  }
}

export function createMediaUploadHandler({ getClient, authorizeUpload, allowedOrigin }: MediaUploadDependencies) {
  return async function handleMediaUpload(request: Request): Promise<Response> {
    let authorization;
    try {
      authorization = await authorizeUpload(request);
    } catch {
      return Response.json({ error: "ไม่สามารถตรวจสอบสิทธิ์อัปโหลดสื่อ" }, { status: 503 });
    }
    if (!authorization.authorized) {
      return Response.json({ error: authorization.error }, { status: authorization.status });
    }

    if (!hasAllowedOrigin(request, allowedOrigin)) {
      return Response.json({ error: "ไม่อนุญาตให้อัปโหลดจากต้นทางนี้" }, { status: 403 });
    }

    const client = await getClient();
    if (!client) {
      return Response.json({ error: "ยังไม่ได้เชื่อมต่อ Google Drive" }, { status: 503 });
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return Response.json({ error: "รูปแบบคำขอไม่ถูกต้อง" }, { status: 400 });
    }

    const assetId = form.get("assetId");
    const file = form.get("file");
    if (typeof assetId !== "string" || !assetId.trim() || !isUploadedFile(file)) {
      return Response.json({ error: "ข้อมูลไฟล์ไม่ครบ" }, { status: 400 });
    }
    if (file.size > MAX_MEDIA_BYTES) {
      return Response.json({ error: "ไฟล์มีขนาดเกิน 50 MB" }, { status: 413 });
    }

    const isVideo = isVideoFile(file);
    const preview = form.get("preview");
    if (isVideo && (!isUploadedFile(preview) || preview.type.trim().toLowerCase() !== "image/jpeg")) {
      return Response.json({ error: "วิดีโอต้องมีภาพตัวอย่าง JPEG" }, { status: 400 });
    }
    if (isVideo && (preview as File).size > MAX_MEDIA_BYTES) {
      return Response.json({ error: "ไฟล์มีขนาดเกิน 50 MB" }, { status: 413 });
    }

    let originalFileId: string | null = null;
    try {
      const uploaded = await client.uploadFile({
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        bytes: new Uint8Array(await file.arrayBuffer()),
      });
      originalFileId = uploaded.fileId;

      let uploadedPreview = uploaded;
      if (isVideo) {
        try {
          uploadedPreview = await client.uploadFile({
            name: (preview as File).name,
            mimeType: "image/jpeg",
            bytes: new Uint8Array(await (preview as File).arrayBuffer()),
          });
        } catch (error) {
          await client.deleteFile({ fileId: uploaded.fileId }).catch(() => undefined);
          originalFileId = null;
          throw error;
        }
      }

      return Response.json({
        assetId: assetId.trim(),
        providerFileId: uploaded.fileId,
        previewProviderFileId: uploadedPreview.fileId,
        remoteStatus: "ready",
      });
    } catch {
      // originalFileId remains non-null only when a future post-upload step is
      // added without its own compensation. Keep this guard as the safe default.
      if (originalFileId) await client.deleteFile({ fileId: originalFileId }).catch(() => undefined);
      return Response.json({ error: "อัปโหลดไป Google Drive ไม่สำเร็จ" }, { status: 502 });
    }
  };
}
