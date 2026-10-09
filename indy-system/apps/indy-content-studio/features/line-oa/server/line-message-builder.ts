type ImageMedia = {
  kind: "image";
  originalUrl: string;
  previewUrl: string;
};

type DocumentMedia = {
  kind: "document";
  downloadUrl: string;
};

type VideoMedia = {
  kind: "video";
  originalUrl: string;
  previewUrl: string;
  sizeBytes: number;
  linkExpiresAt?: string;
};

export const MAX_LINE_VIDEO_BYTES = 200_000_000;

type LineMessage =
  | { type: "text"; text: string }
  | { type: "image"; originalContentUrl: string; previewImageUrl: string }
  | { type: "video"; originalContentUrl: string; previewImageUrl: string };

export function buildLineMessages({
  media,
  caption,
}: {
  media: ImageMedia | VideoMedia | DocumentMedia;
  caption: string;
}): LineMessage[] {
  if (media.kind === "document") {
    return [{ type: "text", text: `${caption}\nดาวน์โหลดไฟล์: ${media.downloadUrl}` }];
  }

  if (media.kind === "video" && (media.sizeBytes <= 0 || media.sizeBytes > MAX_LINE_VIDEO_BYTES)) {
    const expiry = media.linkExpiresAt
      ? `\nลิงก์หมดอายุ: ${new Date(media.linkExpiresAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}` : "";
    return [
      { type: "image", originalContentUrl: media.previewUrl, previewImageUrl: media.previewUrl },
      ...(caption.trim() ? [{ type: "text" as const, text: caption }] : []),
      { type: "text", text: `ดูคลิปต้นฉบับ: ${media.originalUrl}${expiry}` },
    ];
  }

  const visual = media.kind === "image"
    ? { type: "image" as const, originalContentUrl: media.originalUrl, previewImageUrl: media.previewUrl }
    : { type: "video" as const, originalContentUrl: media.originalUrl, previewImageUrl: media.previewUrl };

  return caption.trim() ? [visual, { type: "text", text: caption }] : [visual];
}
