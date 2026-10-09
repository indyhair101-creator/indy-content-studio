// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { createGoogleDriveMediaClient, type Fetcher } from "../features/media/server/google-drive-media-client";

const RESUMABLE_THRESHOLD = 5 * 1024 * 1024;
const uploadSessionUrl = "https://www.googleapis.com/upload/drive/v3/files?upload_id=test-session";

function driveClient(fetcher: Fetcher) {
  return createGoogleDriveMediaClient({
    folderId: "shared-drive-folder",
    authClient: { getAccessToken: async () => ({ token: "drive-access-token" }) },
    fetcher,
  });
}

describe("Google Drive production contract", () => {
  it("reports connected only when the target Shared Drive folder allows adding children", async () => {
    const fetcher = vi.fn<Fetcher>(async () => Response.json({
      id: "shared-drive-folder",
      mimeType: "application/vnd.google-apps.folder",
      capabilities: { canAddChildren: true },
    }));
    const client = driveClient(fetcher);

    await expect(client.probeStorage?.()).resolves.toBe("connected");

    const [input, init] = fetcher.mock.calls[0] ?? [];
    const url = new URL(String(input));
    expect(url.searchParams.get("supportsAllDrives")).toBe("true");
    expect(url.searchParams.get("fields")).toContain("capabilities(canAddChildren)");
    expect(init?.headers).toEqual(expect.objectContaining({ Authorization: "Bearer drive-access-token" }));
  });

  it("does not report success when the service account can read but cannot upload to the folder", async () => {
    const client = driveClient(async () => Response.json({
      id: "shared-drive-folder",
      mimeType: "application/vnd.google-apps.folder",
      capabilities: { canAddChildren: false },
    }));

    await expect(client.probeStorage?.()).resolves.toBe("storage_permission");
  });

  it("rejects a non-folder target instead of claiming the Drive destination is ready", async () => {
    const client = driveClient(async () => Response.json({
      id: "not-a-folder",
      mimeType: "image/jpeg",
      capabilities: { canAddChildren: false },
    }));

    await expect(client.probeStorage?.()).resolves.toBe("folder_not_found");
  });

  it.each([
    [401, undefined, "auth"],
    [404, undefined, "folder_not_found"],
    [403, { error: { errors: [{ reason: "insufficientFilePermissions" }] } }, "storage_permission"],
    [403, { error: { errors: [{ reason: "storageQuotaExceeded" }] } }, "quota"],
    [429, undefined, "quota"],
  ] as const)("maps Drive status %i to safe category %s", async (status, body, expected) => {
    const client = driveClient(async () => body
      ? Response.json(body, { status })
      : new Response(null, { status }));

    await expect(client.probeStorage?.()).resolves.toBe(expected);
  });

  it("keeps uploads at or below 5 MB on the multipart endpoint", async () => {
    const fetcher = vi.fn<Fetcher>(async () => Response.json({ id: "small-file" }));
    const client = driveClient(fetcher);

    await client.uploadFile({ name: "small.jpg", mimeType: "image/jpeg", bytes: new Uint8Array(RESUMABLE_THRESHOLD) });

    const [input] = fetcher.mock.calls[0] ?? [];
    expect(new URL(String(input)).searchParams.get("uploadType")).toBe("multipart");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("uses a resumable session for uploads larger than 5 MB", async () => {
    const fetcher = vi.fn<Fetcher>()
      .mockResolvedValueOnce(new Response(null, { status: 200, headers: { Location: uploadSessionUrl } }))
      .mockResolvedValueOnce(Response.json({ id: "large-file" }));
    const client = driveClient(fetcher);
    const bytes = new Uint8Array(RESUMABLE_THRESHOLD + 1);

    await expect(client.uploadFile({ name: "large.mp4", mimeType: "video/mp4", bytes })).resolves.toEqual({ fileId: "large-file" });

    expect(fetcher).toHaveBeenCalledTimes(2);
    const [sessionInput, sessionInit] = fetcher.mock.calls[0] ?? [];
    const sessionUrl = new URL(String(sessionInput));
    expect(sessionUrl.searchParams.get("uploadType")).toBe("resumable");
    expect(sessionUrl.searchParams.get("supportsAllDrives")).toBe("true");
    expect(sessionInit?.headers).toEqual(expect.objectContaining({
      Authorization: "Bearer drive-access-token",
      "X-Upload-Content-Type": "video/mp4",
      "X-Upload-Content-Length": String(bytes.length),
    }));

    const [uploadInput, uploadInit] = fetcher.mock.calls[1] ?? [];
    expect(String(uploadInput)).toBe(uploadSessionUrl);
    expect(uploadInit?.method).toBe("PUT");
    expect(uploadInit?.headers).toEqual(expect.objectContaining({
      "Content-Type": "video/mp4",
      "Content-Range": `bytes 0-${bytes.length - 1}/${bytes.length}`,
    }));
    expect(uploadInit?.body).toBeInstanceOf(ArrayBuffer);
    expect((uploadInit?.body as ArrayBuffer).byteLength).toBe(bytes.byteLength);
  });

  it("does not send the access token to an untrusted resumable session URL", async () => {
    const fetcher = vi.fn<Fetcher>()
      .mockResolvedValueOnce(new Response(null, { status: 200, headers: { Location: "https://attacker.example/upload" } }));
    const client = driveClient(fetcher);

    await expect(client.uploadFile({
      name: "large.mp4",
      mimeType: "video/mp4",
      bytes: new Uint8Array(RESUMABLE_THRESHOLD + 1),
    })).rejects.toThrow("Google Drive rejected the upload");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
