import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MediaPreviewDialog } from "../features/media/components/MediaPreviewDialog";
import { createUploadedMedia } from "../features/media/media-commands";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";

describe("media preview across devices", () => {
  it("loads a ready remote image when the browser has no local copy", async () => {
    const state = createUploadedMedia(createEmptyDashboardState(), {
      id: "asset-remote", name: "photo.jpg", mimeType: "image/jpeg", size: 5, now: "2026-09-24T00:00:00.000Z",
    });
    const asset = { ...state.media[0], remoteStatus: "ready" as const, providerFileId: "blob:media/asset-remote/photo.jpg" };

    render(<MediaPreviewDialog asset={asset} blobStore={{ get: async () => null, put: async () => undefined, remove: async () => undefined }} onClose={() => undefined} />);

    expect(await screen.findByRole("img", { name: "photo.jpg" })).toHaveAttribute("src", "/api/media/preview/asset-remote");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
