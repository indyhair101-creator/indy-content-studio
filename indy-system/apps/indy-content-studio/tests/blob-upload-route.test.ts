// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import type { HandleUploadPresignedOptions } from "@vercel/blob/client";
import { createBlobUploadHandler } from "../features/media/server/blob-upload-handler";

function tokenRequest(origin = "https://studio.example"): Request {
  return new Request("https://studio.example/api/media/upload", {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "blob.generate-presigned-url", payload: { pathname: "media/asset-1/123e4567-e89b-12d3-a456-426614174000.jpg" } }),
  });
}

describe("Blob upload token route", () => {
  it("refuses to issue upload tokens without admin authorization", async () => {
    const sdkHandler = vi.fn();
    const handler = createBlobUploadHandler({
      handlePresignedUploadRequest: sdkHandler,
      authorizeUpload: () => ({ authorized: false, status: 403, error: "ไม่มีสิทธิ์อัปโหลดสื่อ" }),
      environment: { BLOB_STORE_ID: "store-test" },
      allowedOrigin: "https://studio.example",
    });

    const response = await handler(tokenRequest());

    expect(response.status).toBe(403);
    expect(sdkHandler).not.toHaveBeenCalled();
  });

  it("constrains token to media paths, image/video types, and 1 GB", async () => {
    const sdkHandler = vi.fn(async (options: HandleUploadPresignedOptions) => {
      await expect(options.getSignedToken("documents/private.txt", null, false)).rejects.toThrow();
      const result = await options.getSignedToken("media/asset-1/123e4567-e89b-12d3-a456-426614174000.mp4", null, false);
      expect(result.urlOptions).toMatchObject({ maximumSizeInBytes: 1_073_741_824, allowedContentTypes: ["image/*", "video/*"] });
      return { type: "blob.generate-presigned-url", presignedUrlPayload: { presignedUrl: "https://blob.example/upload" } };
    });
    const signer = vi.fn(async () => ({ delegationToken: "delegated", clientSigningToken: "secret", validUntil: Date.now() + 60_000 }));
    const handler = createBlobUploadHandler({
      handlePresignedUploadRequest: sdkHandler,
      issueUploadToken: signer,
      authorizeUpload: () => ({ authorized: true }),
      environment: { BLOB_STORE_ID: "store-test", BLOB_WEBHOOK_PUBLIC_KEY: "public-key" },
      allowedOrigin: "https://studio.example",
    });

    const response = await handler(tokenRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ type: "blob.generate-presigned-url", presignedUrlPayload: { presignedUrl: "https://blob.example/upload" } });
    expect(signer).toHaveBeenCalledWith({
      pathname: "media/asset-1/123e4567-e89b-12d3-a456-426614174000.mp4",
      operations: ["put"],
      allowedContentTypes: ["image/*", "video/*"],
      maximumSizeInBytes: 1_073_741_824,
      validUntil: expect.any(Number),
    });
  });

  it("allows an hour to start a scoped multipart upload on a slow connection", async () => {
    const before = Date.now();
    const sdkHandler = vi.fn(async (options: HandleUploadPresignedOptions) => {
      const result = await options.getSignedToken("media/asset-1/123e4567-e89b-12d3-a456-426614174000.mp4", null, true);
      expect(result.urlOptions?.validUntil).toBeGreaterThanOrEqual(before + 3_600_000);
      expect(result.urlOptions?.maximumSizeInBytes).toBe(1_073_741_824);
      return { type: "blob.generate-presigned-url" };
    });
    const handler = createBlobUploadHandler({
      handlePresignedUploadRequest: sdkHandler,
      issueUploadToken: vi.fn(async () => ({ delegationToken: "delegated", clientSigningToken: "secret", validUntil: Date.now() + 3_600_000 })),
      authorizeUpload: () => ({ authorized: true }),
      environment: { BLOB_STORE_ID: "store-test", BLOB_WEBHOOK_PUBLIC_KEY: "public-key" },
    });
    expect((await handler(tokenRequest())).status).toBe(200);
  });

  it("rejects token requests from another origin", async () => {
    const sdkHandler = vi.fn();
    const handler = createBlobUploadHandler({
      handlePresignedUploadRequest: sdkHandler,
      authorizeUpload: () => ({ authorized: true }),
      environment: { BLOB_STORE_ID: "store-test" },
      allowedOrigin: "https://studio.example",
    });

    const response = await handler(tokenRequest("https://other.example"));

    expect(response.status).toBe(403);
    expect(sdkHandler).not.toHaveBeenCalled();
  });
});
