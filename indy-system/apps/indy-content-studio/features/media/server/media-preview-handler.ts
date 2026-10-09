import { getAdminActor } from "../../auth/server/admin-session";
import { NeonDashboardRepository } from "../../data/server/neon-dashboard-repository";
import type { DashboardState } from "../../domain/types";
import { createGoogleDriveMediaClientFromEnvironment, type GoogleDriveMediaClient } from "./google-drive-media-client";
import { streamPrivateBlob } from "./blob-media-client";
import { createMediaDeliveryUrl } from "./media-delivery-url";
import { createMediaProviderHandler } from "./media-provider-handler";

type PreviewContext = { params: Promise<{ assetId: string }> };
type PreviewDependencies = {
  authorize?: (request: Request) => Promise<boolean>;
  loadState?: () => Promise<DashboardState>;
  getClient?: () => GoogleDriveMediaClient | null | Promise<GoogleDriveMediaClient | null>;
  streamBlob?: (input: { pathname: string; range?: string }) => Promise<Response>;
  signingSecret?: string;
  now?: () => number;
};

export function createMediaPreviewHandler({
  authorize = async (request) => Boolean(await getAdminActor(request)),
  loadState = async () => (await new NeonDashboardRepository().loadDashboardState()).state,
  getClient = () => createGoogleDriveMediaClientFromEnvironment(),
  streamBlob = streamPrivateBlob,
  signingSecret = process.env.INDY_MEDIA_SIGNING_SECRET ?? "",
  now = () => Math.floor(Date.now() / 1_000),
}: PreviewDependencies = {}) {
  const providerHandler = createMediaProviderHandler({ getClient, streamBlob, signingSecret, now });
  return async (request: Request, context: PreviewContext): Promise<Response> => {
    if (!await authorize(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
    const { assetId } = await context.params;
    if (!/^[a-zA-Z0-9_-]{1,120}$/.test(assetId)) return Response.json({ error: "not_found" }, { status: 404 });
    if (!signingSecret) return Response.json({ error: "media_unavailable" }, { status: 503 });

    try {
      const state = await loadState();
      const asset = state.media.find((item) => item.id === assetId && !item.deletedAt);
      if (!asset || asset.remoteStatus !== "ready" || !asset.providerFileId) {
        return Response.json({ error: "not_found" }, { status: 404 });
      }
      const signedUrl = createMediaDeliveryUrl({
        baseUrl: new URL(request.url).origin,
        secret: signingSecret,
        fileId: asset.providerFileId,
        purpose: "original",
        expiresAt: now() + 60,
      });
      const signedRequest = new Request(signedUrl, { headers: request.headers.get("range") ? { Range: request.headers.get("range")! } : undefined });
      return providerHandler(signedRequest, { params: Promise.resolve({ fileId: asset.providerFileId }) });
    } catch {
      return Response.json({ error: "media_unavailable" }, { status: 503 });
    }
  };
}
