import { describe, expect, it } from "vitest";
import { buildLineMessages } from "../features/line-oa/server/line-message-builder";

describe("buildLineMessages", () => {
  it.each([200_000_001, 1_073_741_824, 0])("sends a poster and original link for a video of %i bytes instead of an unsupported native video", (sizeBytes) => {
    const messages = buildLineMessages({ media: { kind: "video", originalUrl: "https://example.test/clip.mp4?signature=scoped", previewUrl: "https://example.test/poster.jpg", sizeBytes }, caption: "คลิปต้นฉบับ" });
    expect(messages[0]).toEqual({ type: "image", originalContentUrl: "https://example.test/poster.jpg", previewImageUrl: "https://example.test/poster.jpg" });
    expect(messages).toContainEqual({ type: "text", text: "คลิปต้นฉบับ" });
    expect(messages).toContainEqual({ type: "text", text: "ดูคลิปต้นฉบับ: https://example.test/clip.mp4?signature=scoped" });
    expect(messages.some(message => message.type === "video")).toBe(false);
  });

  it("keeps a video at the LINE size boundary playable directly in the chat", () => {
    const messages = buildLineMessages({ media: { kind: "video", originalUrl: "https://example.test/clip.mp4", previewUrl: "https://example.test/poster.jpg", sizeBytes: 200_000_000 }, caption: "คลิป" });
    expect(messages[0]).toEqual({ type: "video", originalContentUrl: "https://example.test/clip.mp4", previewImageUrl: "https://example.test/poster.jpg" });
  });

  it("shows the expiry of a signed large-video review link", () => {
    const messages = buildLineMessages({ media: { kind: "video", originalUrl: "https://example.test/clip.mp4", previewUrl: "https://example.test/poster.jpg", sizeBytes: 300_000_000, linkExpiresAt: "2026-10-02T05:00:00.000Z" }, caption: "คลิป" });
    expect(messages).toContainEqual({ type: "text", text: expect.stringContaining("ลิงก์หมดอายุ:") });
  });
  it("builds an image message followed by its caption", () => {
    expect(
      buildLineMessages({
        media: { kind: "image", originalUrl: "https://example.test/image.jpg", previewUrl: "https://example.test/image.jpg" },
        caption: "พร้อมโพสต์",
      }),
    ).toEqual([
      { type: "image", originalContentUrl: "https://example.test/image.jpg", previewImageUrl: "https://example.test/image.jpg" },
      { type: "text", text: "พร้อมโพสต์" },
    ]);
  });

  it("builds a secure download message for a document", () => {
    expect(
      buildLineMessages({
        media: { kind: "document", downloadUrl: "https://example.test/download" },
        caption: "ไฟล์งาน",
      }),
    ).toEqual([{ type: "text", text: "ไฟล์งาน\nดาวน์โหลดไฟล์: https://example.test/download" }]);
  });
});
