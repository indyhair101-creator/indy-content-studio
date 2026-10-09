// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import { createMediaUploadHandler } from "../features/media/server/media-upload-handler";
import { createMediaUploadAuthorizer } from "../features/media/server/media-upload-authorization";
import { createMediaProviderHandler } from "../features/media/server/media-provider-handler";
import {
  createGoogleDriveMediaClient,
  createGoogleDriveMediaClientFromEnvironment,
  type GoogleDriveMediaClient,
} from "../features/media/server/google-drive-media-client";
import {
  createMediaDeliveryUrl,
  createProviderMediaDeliveryUrls,
  verifyMediaDeliveryUrl,
} from "../features/media/server/media-delivery-url";
import { createVideoPoster } from "../features/media/video-poster";

const MAX_MEDIA_BYTES = 52_428_800;
const signingSecret = "test-signing-secret";
const nowSeconds = 1_800_000_000;

function formRequest(fields: {
  assetId?: string;
  file?: File;
  preview?: File;
}): Request {
  const form = new FormData();
  if (fields.assetId) form.set("assetId", fields.assetId);
  if (fields.file) form.set("file", fields.file);
  if (fields.preview) form.set("preview", fields.preview);
  return new Request("https://studio.example/api/media/upload", { method: "POST", body: form });
}

function fakeClient(overrides: Partial<GoogleDriveMediaClient> = {}): GoogleDriveMediaClient {
  return {
    uploadFile: vi.fn(async ({ name }) => ({ fileId: `drive-${name}` })),
    deleteFile: vi.fn(async () => undefined),
    streamFile: vi.fn(async () => new Response("provider-bytes", {
      status: 200,
      headers: { "Content-Type": "video/mp4", "Content-Length": "14", "Accept-Ranges": "bytes" },
    })),
    ...overrides,
  };
}

function testUploadHandler({
  getClient,
  allowedOrigin,
}: {
  getClient: () => GoogleDriveMediaClient | null | Promise<GoogleDriveMediaClient | null>;
  allowedOrigin?: string | null;
}) {
  return createMediaUploadHandler({
    getClient,
    allowedOrigin,
    authorizeUpload: async () => ({ authorized: true }),
  });
}

function signedRequest(fileId: string, expiresAt = nowSeconds + 60): Request {
  const url = createMediaDeliveryUrl({
    baseUrl: "https://studio.example",
    fileId,
    purpose: "original",
    expiresAt,
    secret: signingSecret,
  });
  return new Request(url);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/media/upload", () => {
  it("returns 503 without an upload authorization token", async () => {
    const client = fakeClient();
    const handler = createMediaUploadHandler({
      getClient: () => client,
      authorizeUpload: createMediaUploadAuthorizer({}),
    });

    const response = await handler(formRequest({
      assetId: "asset-unconfigured-auth",
      file: new File(["image"], "photo.jpg", { type: "image/jpeg" }),
    }));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "ยังไม่ได้ตั้งค่าการอนุญาตอัปโหลดสื่อ" });
    expect(client.uploadFile).not.toHaveBeenCalled();
  });

  it.each([
    ["missing credentials", {}],
    ["mismatched bearer token", { Authorization: "Bearer wrong-token" }],
    ["mismatched cookie token", { Cookie: "indy_media_upload_token=wrong-token" }],
  ])("returns 403 for %s", async (_label, headers) => {
    const client = fakeClient();
    const handler = createMediaUploadHandler({
      getClient: () => client,
      authorizeUpload: createMediaUploadAuthorizer({ INDY_MEDIA_UPLOAD_TOKEN: "upload-secret" }),
    });
    const request = formRequest({
      assetId: "asset-unauthorized",
      file: new File(["image"], "photo.jpg", { type: "image/jpeg" }),
    });
    for (const [name, value] of Object.entries(headers)) request.headers.set(name, value);

    const response = await handler(request);

    expect(response.status).toBe(403);
    expect(client.uploadFile).not.toHaveBeenCalled();
  });

  it.each([
    ["bearer token", { Authorization: "Bearer upload-secret" }],
    ["HttpOnly deployment cookie", { Cookie: "indy_media_upload_token=upload-secret" }],
  ])("accepts a matching %s", async (_label, headers) => {
    const handler = createMediaUploadHandler({
      getClient: () => fakeClient(),
      authorizeUpload: createMediaUploadAuthorizer({ INDY_MEDIA_UPLOAD_TOKEN: "upload-secret" }),
    });
    const request = formRequest({
      assetId: "asset-authorized",
      file: new File(["image"], "photo.jpg", { type: "image/jpeg" }),
    });
    for (const [name, value] of Object.entries(headers)) request.headers.set(name, value);

    expect((await handler(request)).status).toBe(200);
  });

  it.each([
    ["mismatched", "https://attacker.example"],
    ["missing", null],
  ])("rejects a %s request origin before contacting Drive", async (_label, origin) => {
    const client = fakeClient();
    const handler = testUploadHandler({
      getClient: () => client,
      allowedOrigin: "https://studio.example",
    });
    const request = formRequest({
      assetId: "asset-cross-origin",
      file: new File(["image"], "photo.jpg", { type: "image/jpeg" }),
    });
    if (origin) request.headers.set("Origin", origin);

    const response = await handler(request);

    expect(response.status).toBe(403);
    expect(client.uploadFile).not.toHaveBeenCalled();
  });

  it("returns 503 when Google Drive is disconnected", async () => {
    const handler = testUploadHandler({ getClient: () => null });

    const response = await handler(formRequest({
      assetId: "asset-1",
      file: new File(["image"], "photo.jpg", { type: "image/jpeg" }),
    }));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "ยังไม่ได้เชื่อมต่อ Google Drive" });
  });

  it("returns 400 when the request has no file", async () => {
    const handler = testUploadHandler({ getClient: () => fakeClient() });

    const response = await handler(formRequest({ assetId: "asset-1" }));

    expect(response.status).toBe(400);
  });

  it("returns 413 for a file over 50 MB", async () => {
    const handler = testUploadHandler({ getClient: () => fakeClient() });
    const file = new File([new Uint8Array(MAX_MEDIA_BYTES + 1)], "large.mp4", { type: "video/mp4" });

    const response = await handler(formRequest({ assetId: "asset-1", file }));

    expect(response.status).toBe(413);
  });

  it("returns 400 when a video has no JPEG preview", async () => {
    const handler = testUploadHandler({ getClient: () => fakeClient() });

    const response = await handler(formRequest({
      assetId: "asset-video",
      file: new File(["video"], "clip.mp4", { type: "video/mp4" }),
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "วิดีโอต้องมีภาพตัวอย่าง JPEG" });
  });

  it.each([
    ["blank MIME", ""],
    ["spoofed image MIME", "image/jpeg"],
  ])("requires a JPEG preview for a video filename with %s", async (_label, mimeType) => {
    const handler = testUploadHandler({ getClient: () => fakeClient() });

    const response = await handler(formRequest({
      assetId: "asset-spoofed-video",
      file: new File(["video"], "clip.MP4", { type: mimeType }),
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "วิดีโอต้องมีภาพตัวอย่าง JPEG" });
  });

  it("returns 413 when a video preview is over 50 MB", async () => {
    const handler = testUploadHandler({ getClient: () => fakeClient() });

    const response = await handler(formRequest({
      assetId: "asset-large-preview",
      file: new File(["video"], "clip.mp4", { type: "video/mp4" }),
      preview: new File([new Uint8Array(MAX_MEDIA_BYTES + 1)], "clip-poster.jpg", { type: "image/jpeg" }),
    }));

    expect(response.status).toBe(413);
  });

  it("returns a sanitized 502 when Drive rejects an upload", async () => {
    const client = fakeClient({
      uploadFile: vi.fn(async () => { throw new Error("provider secret-token rejected"); }),
    });
    const handler = testUploadHandler({ getClient: () => client });

    const response = await handler(formRequest({
      assetId: "asset-1",
      file: new File(["image"], "photo.jpg", { type: "image/jpeg" }),
    }));
    const json = await response.json();

    expect(response.status).toBe(502);
    expect(json).toEqual({ error: "อัปโหลดไป Google Drive ไม่สำเร็จ" });
    expect(JSON.stringify(json)).not.toContain("secret-token");
  });

  it("uploads an image privately and reuses it as its preview", async () => {
    const client = fakeClient();
    const handler = testUploadHandler({ getClient: () => client });

    const response = await handler(formRequest({
      assetId: "asset-image",
      file: new File(["image"], "ภาพงาน.jpg", { type: "image/jpeg" }),
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      assetId: "asset-image",
      providerFileId: "drive-ภาพงาน.jpg",
      previewProviderFileId: "drive-ภาพงาน.jpg",
      remoteStatus: "ready",
    });
    expect(client.uploadFile).toHaveBeenCalledTimes(1);
  });

  it("uploads a video and its JPEG preview as separate private files", async () => {
    const client = fakeClient();
    const handler = testUploadHandler({ getClient: () => client });

    const response = await handler(formRequest({
      assetId: "asset-video",
      file: new File(["video"], "clip.mp4", { type: "video/mp4" }),
      preview: new File(["jpeg"], "clip-poster.jpg", { type: "image/jpeg" }),
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      assetId: "asset-video",
      providerFileId: "drive-clip.mp4",
      previewProviderFileId: "drive-clip-poster.jpg",
      remoteStatus: "ready",
    });
    expect(client.uploadFile).toHaveBeenCalledTimes(2);
  });

  it("deletes the original Drive file when the video preview upload fails", async () => {
    const client = fakeClient({
      uploadFile: vi.fn()
        .mockResolvedValueOnce({ fileId: "drive-original" })
        .mockRejectedValueOnce(new Error("preview rejected")),
    });
    const handler = testUploadHandler({ getClient: () => client });

    const response = await handler(formRequest({
      assetId: "asset-video",
      file: new File(["video"], "clip.mp4", { type: "video/mp4" }),
      preview: new File(["jpeg"], "clip-poster.jpg", { type: "image/jpeg" }),
    }));

    expect(response.status).toBe(502);
    expect(client.deleteFile).toHaveBeenCalledWith({ fileId: "drive-original" });
    expect(client.deleteFile).toHaveBeenCalledTimes(1);
  });
});

describe("Google Drive client boundary", () => {
  it("uses injected auth and fetch while keeping uploaded files private", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({ id: "drive-file-1" }));
    const client = createGoogleDriveMediaClient({
      folderId: "private-folder",
      authClient: { getAccessToken: async () => ({ token: "access-token" }) },
      fetcher,
    });

    await expect(client.uploadFile({
      name: "photo.jpg",
      mimeType: "image/jpeg",
      bytes: new Uint8Array([1, 2, 3]),
    })).resolves.toEqual({ fileId: "drive-file-1" });

    const [input, init] = fetcher.mock.calls[0] ?? [];
    expect(new URL(String(input)).searchParams.get("supportsAllDrives")).toBe("true");
    expect(init?.headers).toEqual(expect.objectContaining({ Authorization: "Bearer access-token" }));
    expect(await (init?.body as Blob).text()).toContain('"parents":["private-folder"]');
    expect(await (init?.body as Blob).text()).not.toContain("permissions");
  });

  it("uses shared-drive support when streaming a file", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response("partial", { status: 206 }));
    const client = createGoogleDriveMediaClient({
      folderId: "private-folder",
      authClient: { getAccessToken: async () => "access-token" },
      fetcher,
    });

    await client.streamFile({ fileId: "drive-file-1", range: "bytes=10-16" });

    const [input, init] = fetcher.mock.calls[0] ?? [];
    const url = new URL(String(input));
    expect(url.searchParams.get("alt")).toBe("media");
    expect(url.searchParams.get("supportsAllDrives")).toBe("true");
    expect(init?.headers).toEqual(expect.objectContaining({ Range: "bytes=10-16" }));
  });

  it("uses shared-drive support when deleting a partial upload", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 204 }));
    const client = createGoogleDriveMediaClient({
      folderId: "private-folder",
      authClient: { getAccessToken: async () => "access-token" },
      fetcher,
    });

    await client.deleteFile({ fileId: "drive-file-1" });

    const [input, init] = fetcher.mock.calls[0] ?? [];
    expect(new URL(String(input)).searchParams.get("supportsAllDrives")).toBe("true");
    expect(init?.method).toBe("DELETE");
  });

  it("constructs the environment client through the injectable auth factory", () => {
    const authClient = { getAccessToken: async () => "access-token" };
    const createAuthClient = vi.fn(() => authClient);

    const client = createGoogleDriveMediaClientFromEnvironment({
      GOOGLE_SERVICE_ACCOUNT_EMAIL: "service@example.test",
      GOOGLE_PRIVATE_KEY: "line-1\\nline-2",
      GOOGLE_DRIVE_FOLDER_ID: "private-folder",
    }, fetch, createAuthClient);

    expect(client).not.toBeNull();
    expect(createAuthClient).toHaveBeenCalledWith({
      email: "service@example.test",
      key: "line-1\nline-2",
      scopes: ["https://www.googleapis.com/auth/drive.file"],
    });
  });
});

describe("environment-backed media delivery URLs", () => {
  it("creates short-lived HTTPS URLs for provider IDs without adding them to stored metadata", () => {
    const delivery = createProviderMediaDeliveryUrls({
      providerFileId: "drive-original",
      previewProviderFileId: "drive-preview",
      environment: {
        APP_PUBLIC_BASE_URL: "https://studio.example",
        INDY_MEDIA_SIGNING_SECRET: signingSecret,
      },
      now: () => nowSeconds,
    });

    const original = new URL(delivery.originalContentUrl);
    const preview = new URL(delivery.previewImageUrl);
    expect(original.protocol).toBe("https:");
    expect(original.searchParams.get("expiresAt")).toBe(String(nowSeconds + 300));
    expect(preview.searchParams.get("purpose")).toBe("preview");
    expect(verifyMediaDeliveryUrl({
      url: delivery.originalContentUrl,
      expectedFileId: "drive-original",
      secret: signingSecret,
      now: nowSeconds,
    })).toBe(true);
  });

  it("rejects a non-HTTPS public base URL", () => {
    expect(() => createProviderMediaDeliveryUrls({
      providerFileId: "drive-original",
      previewProviderFileId: "drive-preview",
      environment: {
        APP_PUBLIC_BASE_URL: "http://studio.example",
        INDY_MEDIA_SIGNING_SECRET: signingSecret,
      },
      now: () => nowSeconds,
    })).toThrow("APP_PUBLIC_BASE_URL must be an absolute HTTPS URL");
  });

  it.each([1_800, 3_600])("accepts an explicit %i-second integration TTL", (ttlSeconds) => {
    const delivery = createProviderMediaDeliveryUrls({
      providerFileId: "drive-original",
      previewProviderFileId: "drive-preview",
      environment: {
        APP_PUBLIC_BASE_URL: "https://studio.example",
        INDY_MEDIA_SIGNING_SECRET: signingSecret,
      },
      now: () => nowSeconds,
      ttlSeconds,
    });

    expect(new URL(delivery.originalContentUrl).searchParams.get("expiresAt"))
      .toBe(String(nowSeconds + ttlSeconds));
  });
});

describe("signed provider streaming", () => {
  it("streams a signed private Blob file without exposing storage credentials", async () => {
    const pathname = "media/asset-1/123e4567-e89b-12d3-a456-426614174000.png";
    const fileId = `blob:${pathname}`;
    const streamBlob = vi.fn(async () => new Response("private-bytes", { headers: { "Content-Type": "image/png", "X-Provider-Secret": "hidden" } }));
    const handler = createMediaProviderHandler({ getClient: () => null, streamBlob, signingSecret, now: () => nowSeconds });

    const response = await handler(signedRequest(fileId), { params: Promise.resolve({ fileId }) });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("private-bytes");
    expect(response.headers.get("x-provider-secret")).toBeNull();
    expect(streamBlob).toHaveBeenCalledWith({ pathname, range: undefined });
  });

  it("rejects invalid and expired signatures before contacting Drive", async () => {
    const client = fakeClient();
    const handler = createMediaProviderHandler({
      getClient: () => client,
      signingSecret,
      now: () => nowSeconds,
    });
    const invalid = new Request(`${signedRequest("file-1").url.replace(/signature=[^&]+/, "signature=modified")}`);

    expect((await handler(invalid, { params: Promise.resolve({ fileId: "file-1" }) })).status).toBe(401);
    expect((await handler(signedRequest("file-1", nowSeconds - 1), { params: Promise.resolve({ fileId: "file-1" }) })).status).toBe(401);
    expect(client.streamFile).not.toHaveBeenCalled();
  });

  it("streams the full provider file with safe response headers", async () => {
    const client = fakeClient();
    const handler = createMediaProviderHandler({ getClient: () => client, signingSecret, now: () => nowSeconds });

    const response = await handler(signedRequest("file-1"), { params: Promise.resolve({ fileId: "file-1" }) });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("provider-bytes");
    expect(response.headers.get("content-type")).toBe("video/mp4");
    expect(response.headers.get("accept-ranges")).toBe("bytes");
  });

  it("forwards a video byte range and returns the provider 206 response", async () => {
    const client = fakeClient({
      streamFile: vi.fn(async ({ range }) => new Response("partial", {
        status: 206,
        headers: {
          "Content-Type": "video/mp4",
          "Content-Length": "7",
          "Content-Range": "bytes 10-16/100",
          "Accept-Ranges": "bytes",
          "X-Provider-Secret": "do-not-forward",
        },
      })),
    });
    const handler = createMediaProviderHandler({ getClient: () => client, signingSecret, now: () => nowSeconds });
    const request = new Request(signedRequest("video-1").url, { headers: { Range: "bytes=10-16" } });

    const response = await handler(request, { params: Promise.resolve({ fileId: "video-1" }) });

    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 10-16/100");
    expect(response.headers.get("x-provider-secret")).toBeNull();
    expect(client.streamFile).toHaveBeenCalledWith({ fileId: "video-1", range: "bytes=10-16" });
  });
});

describe("video poster", () => {
  it("uses the injected decoder and JPEG encoder boundary", async () => {
    const poster = await createVideoPoster(
      new File(["video"], "clip.mp4", { type: "video/mp4" }),
      {
        decodeFirstFrame: async () => ({ source: {} as CanvasImageSource, width: 640, height: 360 }),
        encodeJpeg: async ({ width, height }) => new Blob([`${width}x${height}`], { type: "image/jpeg" }),
      },
    );

    expect(poster.type).toBe("image/jpeg");
    expect(await poster.text()).toBe("640x360");
  });
});
