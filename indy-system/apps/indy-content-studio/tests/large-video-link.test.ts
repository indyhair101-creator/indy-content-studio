// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createMediaProviderHandler } from "../features/media/server/media-provider-handler";
import { createMediaDeliveryUrl } from "../features/media/server/media-delivery-url";

const fileId = "blob:media/asset-1/123e4567-e89b-12d3-a456-426614174000.mp4";
const secret = "test-media-signing-secret";
const expiresAt = 1_790_916_000;

describe("large video review links", () => {
  it("redirects an authenticated link to private storage without streaming a gigabyte through the application", async () => {
    const url = createMediaDeliveryUrl({ baseUrl: "https://studio.example", secret, fileId, purpose: "original-link", expiresAt });
    const getBlobUrl = vi.fn(async () => "https://private.blob.vercel-storage.com/video.mp4?signature=scoped");
    const streamBlob = vi.fn();
    const handler = createMediaProviderHandler({ getClient: () => null, getBlobUrl, streamBlob, signingSecret: secret, now: () => expiresAt - 60 });
    const response = await handler(new Request(url), { params: Promise.resolve({ fileId }) });
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://private.blob.vercel-storage.com/video.mp4?signature=scoped");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(getBlobUrl).toHaveBeenCalledWith({ pathname: fileId.slice(5), validUntil: expiresAt * 1_000 });
    expect(streamBlob).not.toHaveBeenCalled();
  });

  it.each(["expired", "tampered"])("does not issue a storage URL for an %s review link", async (kind) => {
    const url = new URL(createMediaDeliveryUrl({ baseUrl: "https://studio.example", secret, fileId, purpose: "original-link", expiresAt }));
    if (kind === "tampered") url.searchParams.set("signature", "invalid");
    const getBlobUrl = vi.fn();
    const handler = createMediaProviderHandler({ getClient: () => null, getBlobUrl, signingSecret: secret, now: () => kind === "expired" ? expiresAt : expiresAt - 60 });
    const response = await handler(new Request(url), { params: Promise.resolve({ fileId }) });
    expect(response.status).toBe(401);
    expect(getBlobUrl).not.toHaveBeenCalled();
  });
});
