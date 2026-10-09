// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { uploadMediaToBlob } from "../features/media/blob-media-upload";

vi.mock("../features/media/video-poster", () => ({ createVideoPoster: vi.fn(async () => new Blob(["poster"], { type: "image/jpeg" })) }));

describe("Blob media upload", () => {
  it("uploads a 1 GB video with multipart and uploads its small poster separately", async () => {
    const file = new File(["video"], "large.mp4", { type: "video/mp4" });
    Object.defineProperty(file, "size", { value: 1_073_741_824 });
    const uploader = vi.fn(async (pathname: string) => ({ pathname }));
    const result = await uploadMediaToBlob({ assetId: "asset-large", name: file.name, mimeType: file.type, blob: file,
      fetcher: vi.fn(async () => Response.json({ integrations: [{ provider: "blob", status: "connected" }] })) as typeof fetch, uploader });
    expect(result.remoteStatus).toBe("ready");
    expect(uploader).toHaveBeenNthCalledWith(1, expect.stringMatching(/\.mp4$/), file, expect.objectContaining({ access: "private", multipart: true }));
    expect(uploader).toHaveBeenNthCalledWith(2, expect.stringMatching(/\.jpg$/), expect.any(File), expect.objectContaining({ multipart: false }));
  });

  it("rejects a video larger than 1 GB before generating a poster or requesting storage", async () => {
    const file = new File(["video"], "large.mp4", { type: "video/mp4" });
    Object.defineProperty(file, "size", { value: 1_073_741_825 });
    const uploader = vi.fn();
    await expect(uploadMediaToBlob({ assetId: "asset-large", name: file.name, mimeType: file.type, blob: file,
      fetcher: vi.fn(async () => Response.json({ integrations: [{ provider: "blob", status: "connected" }] })) as typeof fetch, uploader })).rejects.toThrow("invalid-media-size");
    expect(uploader).not.toHaveBeenCalled();
  });
  it("returns ready only after a private Blob upload returns a pathname", async () => {
    const uploader = vi.fn(async () => ({ pathname: "media/asset-1/photo-random.jpg" }));
    const fetcher = vi.fn(async () => Response.json({ integrations: [{ provider: "blob", status: "connected" }] }));
    const result = await uploadMediaToBlob({
      assetId: "asset-1",
      name: "photo.jpg",
      mimeType: "image/jpeg",
      blob: new File(["image"], "photo.jpg", { type: "image/jpeg" }),
      fetcher: fetcher as typeof fetch,
      uploader,
    });

    expect(result).toEqual({
      remoteStatus: "ready",
      providerFileId: "blob:media/asset-1/photo-random.jpg",
      previewProviderFileId: "blob:media/asset-1/photo-random.jpg",
    });
    expect(uploader).toHaveBeenCalledWith(
      expect.stringMatching(/^media\/asset-1\/.+\.jpg$/),
      expect.any(File),
      expect.objectContaining({ access: "private", handleUploadUrl: "/api/media/upload" }),
    );
  });

  it("keeps media local when Blob storage is disconnected", async () => {
    const uploader = vi.fn();
    const result = await uploadMediaToBlob({
      assetId: "asset-1",
      name: "photo.jpg",
      mimeType: "image/jpeg",
      blob: new File(["image"], "photo.jpg", { type: "image/jpeg" }),
      fetcher: vi.fn(async () => Response.json({ integrations: [{ provider: "blob", status: "disconnected" }] })) as typeof fetch,
      uploader,
    });

    expect(result).toEqual({ remoteStatus: "local-only" });
    expect(uploader).not.toHaveBeenCalled();
  });
});
