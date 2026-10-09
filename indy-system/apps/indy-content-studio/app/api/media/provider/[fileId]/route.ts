import { createGoogleDriveMediaClientFromEnvironment } from "../../../../../features/media/server/google-drive-media-client";
import { createMediaProviderHandler } from "../../../../../features/media/server/media-provider-handler";

export const GET = createMediaProviderHandler({
  getClient: () => createGoogleDriveMediaClientFromEnvironment(),
  signingSecret: process.env.INDY_MEDIA_SIGNING_SECRET ?? "",
});
