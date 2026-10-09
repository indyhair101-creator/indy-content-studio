// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import { createUploadedMedia } from "../features/media/media-commands";

const FILE_ID = "blob:media/asset-remote/123e4567-e89b-12d3-a456-426614174000.jpg";
const state = createUploadedMedia(createEmptyDashboardState(), {
  id: "asset-remote", name: "photo.jpg", mimeType: "image/jpeg", size: 5, now: "2026-09-24T00:00:00.000Z",
});
state.media[0] = { ...state.media[0], remoteStatus: "ready", providerFileId: FILE_ID, previewProviderFileId: FILE_ID };

describe("authenticated remote media preview", () => {
  it("streams a stored private Blob with range support, without requiring a local browser copy", async () => {
    const { createMediaPreviewHandler } = await import("../features/media/server/media-preview-handler");
    const streamBlob = vi.fn(async () => new Response("bytes", { status: 206, headers: { "Content-Type": "image/jpeg", "Content-Range": "bytes 0-4/5" } }));
    const handler = createMediaPreviewHandler({
      authorize: async () => true,
      loadState: async () => state,
      getClient: () => null,
      streamBlob,
      signingSecret: "test-preview-secret",
    });

    const response = await handler(new Request("https://studio.example/api/media/preview/asset-remote", { headers: { Range: "bytes=0-4" } }), { params: Promise.resolve({ assetId: "asset-remote" }) });

    expect(response.status).toBe(206);
    expect(await response.text()).toBe("bytes");
    expect(response.headers.get("content-range")).toBe("bytes 0-4/5");
    expect(streamBlob).toHaveBeenCalledWith({ pathname: "media/asset-remote/123e4567-e89b-12d3-a456-426614174000.jpg", range: "bytes=0-4" });
  });

  it("rejects unauthenticated requests before reading dashboard data", async () => {
    const { createMediaPreviewHandler } = await import("../features/media/server/media-preview-handler");
    const loadState = vi.fn(async () => state);
    const handler = createMediaPreviewHandler({ authorize: async () => false, loadState, getClient: () => null, signingSecret: "test-preview-secret" });

    const response = await handler(new Request("https://studio.example/api/media/preview/asset-remote"), { params: Promise.resolve({ assetId: "asset-remote" }) });

    expect(response.status).toBe(401);
    expect(loadState).not.toHaveBeenCalled();
  });

  it("does not stream an asset absent from the saved dashboard", async () => {
    const { createMediaPreviewHandler } = await import("../features/media/server/media-preview-handler");
    const streamBlob = vi.fn();
    const handler = createMediaPreviewHandler({ authorize: async () => true, loadState: async () => state, getClient: () => null, streamBlob, signingSecret: "test-preview-secret" });

    const response = await handler(new Request("https://studio.example/api/media/preview/not-saved"), { params: Promise.resolve({ assetId: "not-saved" }) });

    expect(response.status).toBe(404);
    expect(streamBlob).not.toHaveBeenCalled();
  });
});
