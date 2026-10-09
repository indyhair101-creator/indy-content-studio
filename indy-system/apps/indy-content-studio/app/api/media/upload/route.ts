import { createMediaUploadAuthorizer } from "../../../../features/media/server/media-upload-authorization";
import { createBlobUploadHandler } from "../../../../features/media/server/blob-upload-handler";

export const POST = createBlobUploadHandler({
  authorizeUpload: createMediaUploadAuthorizer(),
  allowedOrigin: process.env.APP_PUBLIC_BASE_URL,
});
