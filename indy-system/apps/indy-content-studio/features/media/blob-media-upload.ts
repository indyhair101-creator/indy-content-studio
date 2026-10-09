import { uploadPresigned } from "@vercel/blob/client";
import { MAX_MEDIA_BYTES } from "./media-commands";
import { createVideoPoster } from "./video-poster";

type BlobUploader = (pathname: string, file: File, options: {
  access: "private";
  handleUploadUrl: string;
  multipart: boolean;
}) => Promise<{ pathname: string }>;

export type BlobMediaUploadResult =
  | { remoteStatus: "local-only" }
  | { remoteStatus: "ready"; providerFileId: string; previewProviderFileId: string };

function asNamedFile(blob: Blob, name: string, mimeType: string): File {
  const extension = name.toLowerCase().match(/\.([a-z0-9]{1,8})$/)?.[1];
  const inferred = extension === "jpg" || extension === "jpeg" ? "image/jpeg"
    : extension === "png" ? "image/png"
      : extension === "mp4" ? "video/mp4" : "";
  const type = mimeType || blob.type || inferred;
  if (!type.startsWith("image/") && !type.startsWith("video/")) throw new Error("unsupported-media-type");
  if (blob instanceof File && blob.name === name && blob.type === type) return blob;
  return new File([blob], name, { type });
}

function extensionFor(file: File): string {
  const extension = file.name.toLowerCase().match(/\.([a-z0-9]{1,8})$/)?.[1];
  if (extension) return extension;
  if (file.type === "image/jpeg") return "jpg";
  if (file.type === "image/png") return "png";
  if (file.type === "video/mp4") return "mp4";
  throw new Error("unsupported-media-type");
}

function isVideo(file: File): boolean {
  return file.type.toLowerCase().startsWith("video/");
}

async function blobConnected(fetcher: typeof fetch): Promise<boolean> {
  try {
    const response = await fetcher("/api/integrations/health", { cache: "no-store" });
    if (!response.ok) return false;
    const payload: unknown = await response.json();
    const integrations = payload && typeof payload === "object" ? (payload as { integrations?: unknown }).integrations : null;
    return Array.isArray(integrations) && integrations.some((item) => (
      item && typeof item === "object"
      && (item as { provider?: unknown }).provider === "blob"
      && (item as { status?: unknown }).status === "connected"
    ));
  } catch {
    return false;
  }
}

export async function uploadMediaToBlob({
  assetId,
  name,
  mimeType,
  blob,
  fetcher = globalThis.fetch,
  uploader = uploadPresigned,
}: {
  assetId: string;
  name: string;
  mimeType: string;
  blob: Blob;
  fetcher?: typeof fetch;
  uploader?: BlobUploader;
}): Promise<BlobMediaUploadResult> {
  if (!await blobConnected(fetcher)) return { remoteStatus: "local-only" };
  if (!/^[a-zA-Z0-9_-]{1,120}$/.test(assetId)) throw new Error("invalid-asset-id");
  const file = asNamedFile(blob, name, mimeType);
  if (!file.size || file.size > MAX_MEDIA_BYTES) throw new Error("invalid-media-size");
  const options = { access: "private" as const, handleUploadUrl: "/api/media/upload" };
  const pathname = (extension: string) => `media/${assetId}/${crypto.randomUUID()}.${extension}`;

  let poster: File | null = null;
  if (isVideo(file)) {
    const preview = await createVideoPoster(file);
    poster = new File([preview], `${name.replace(/\.[^.]+$/, "") || "video"}-poster.jpg`, { type: "image/jpeg" });
  }

  const original = await uploader(pathname(extensionFor(file)), file, { ...options, multipart: file.size > 52_428_800 });
  const preview = poster ? await uploader(pathname("jpg"), poster, { ...options, multipart: false }) : original;
  if (!original.pathname.startsWith(`media/${assetId}/`) || !preview.pathname.startsWith(`media/${assetId}/`)) {
    throw new Error("provider-upload-failed");
  }
  return {
    remoteStatus: "ready",
    providerFileId: `blob:${original.pathname}`,
    previewProviderFileId: `blob:${preview.pathname}`,
  };
}
