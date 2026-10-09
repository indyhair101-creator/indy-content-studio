import { createVideoPoster } from "./video-poster";

export type ProviderMediaUploadResult =
  | { remoteStatus: "local-only" }
  | { remoteStatus: "ready"; providerFileId: string; previewProviderFileId: string };

type ProviderUploadPayload = {
  assetId?: unknown;
  providerFileId?: unknown;
  previewProviderFileId?: unknown;
  remoteStatus?: unknown;
};

const videoFileExtensions = new Set(["3gp", "avi", "m4v", "mkv", "mov", "mp4", "mpeg", "mpg", "ogv", "webm"]);

function asNamedFile(blob: Blob, name: string, mimeType: string): File {
  if (blob instanceof File && blob.name === name) return blob;
  return new File([blob], name, { type: mimeType || blob.type });
}

function isVideoFile(file: File): boolean {
  if (file.type.trim().toLowerCase().startsWith("video/")) return true;
  const extension = file.name.trim().toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  return extension ? videoFileExtensions.has(extension) : false;
}

async function googleDriveConnected(fetcher: typeof fetch): Promise<boolean> {
  try {
    const response = await fetcher("/api/integrations/health", { cache: "no-store" });
    if (!response.ok) return false;
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object") return false;
    const integrations = (payload as { integrations?: unknown }).integrations;
    return Array.isArray(integrations) && integrations.some((integration) => (
      integration
      && typeof integration === "object"
      && (integration as { provider?: unknown }).provider === "google-drive"
      && (integration as { status?: unknown }).status === "connected"
    ));
  } catch {
    return false;
  }
}

function validUploadResult(value: unknown, assetId: string): value is ProviderUploadPayload {
  if (!value || typeof value !== "object") return false;
  const result = value as ProviderUploadPayload;
  return result.assetId === assetId
    && result.remoteStatus === "ready"
    && typeof result.providerFileId === "string"
    && result.providerFileId.length > 0
    && typeof result.previewProviderFileId === "string"
    && result.previewProviderFileId.length > 0;
}

export async function uploadMediaToGoogleDrive({
  assetId,
  name,
  mimeType,
  blob,
  fetcher = globalThis.fetch,
}: {
  assetId: string;
  name: string;
  mimeType: string;
  blob: Blob;
  fetcher?: typeof fetch;
}): Promise<ProviderMediaUploadResult> {
  if (!await googleDriveConnected(fetcher)) return { remoteStatus: "local-only" };

  const file = asNamedFile(blob, name, mimeType);
  const form = new FormData();
  form.set("assetId", assetId);
  form.set("file", file);

  if (isVideoFile(file)) {
    try {
      const poster = await createVideoPoster(file);
      const baseName = file.name.replace(/\.[^.]+$/, "") || "video";
      form.set("preview", new File([poster], `${baseName}-poster.jpg`, { type: "image/jpeg" }));
    } catch {
      throw new Error("ไม่สามารถสร้างภาพตัวอย่างจากวิดีโอนี้ได้");
    }
  }

  const response = await fetcher("/api/media/upload", { method: "POST", body: form });
  const result: unknown = await response.json().catch(() => null);
  if (response.status === 503) return { remoteStatus: "local-only" };
  if (!response.ok || !validUploadResult(result, assetId)) throw new Error("provider-upload-failed");
  return {
    remoteStatus: "ready",
    providerFileId: result.providerFileId as string,
    previewProviderFileId: result.previewProviderFileId as string,
  };
}
