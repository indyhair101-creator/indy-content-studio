import { issueSignedToken } from "@vercel/blob";
import { handleUploadPresigned, type HandleUploadPresignedBody, type HandleUploadPresignedOptions } from "@vercel/blob/client";
import type { AuthorizeMediaUpload } from "./media-upload-authorization";
import { MAX_MEDIA_BYTES } from "../media-commands";

type BlobUploadDependencies = {
  handlePresignedUploadRequest?: (options: HandleUploadPresignedOptions) => Promise<unknown>;
  issueUploadToken?: typeof issueSignedToken;
  authorizeUpload: AuthorizeMediaUpload;
  environment?: Readonly<Record<string, string | undefined>>;
  allowedOrigin?: string | null;
};

const MEDIA_PATH = /^media\/[a-zA-Z0-9_-]{1,120}\/[0-9a-f-]{36}\.[a-z0-9]{1,8}$/;

function allowedOrigin(request: Request, configured: string | null | undefined): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return origin === new URL(request.url).origin || (Boolean(configured) && origin === new URL(configured!).origin);
  } catch {
    return false;
  }
}

export function createBlobUploadHandler({
  handlePresignedUploadRequest = handleUploadPresigned,
  issueUploadToken = issueSignedToken,
  authorizeUpload,
  environment = process.env,
  allowedOrigin: configuredOrigin,
}: BlobUploadDependencies) {
  return async (request: Request): Promise<Response> => {
    let body: HandleUploadPresignedBody;
    try {
      body = await request.json() as HandleUploadPresignedBody;
    } catch {
      return Response.json({ error: "รูปแบบคำขอไม่ถูกต้อง" }, { status: 400 });
    }
    if (!body || (body.type !== "blob.generate-presigned-url" && body.type !== "blob.upload-completed")) {
      return Response.json({ error: "รูปแบบคำขอไม่ถูกต้อง" }, { status: 400 });
    }

    if (body.type === "blob.generate-presigned-url") {
      const authorization = await authorizeUpload(request);
      if (!authorization.authorized) {
        return Response.json({ error: authorization.error }, { status: authorization.status });
      }
      if (!allowedOrigin(request, configuredOrigin)) {
        return Response.json({ error: "ไม่อนุญาตให้อัปโหลดจากต้นทางนี้" }, { status: 403 });
      }
      if ((!environment.BLOB_STORE_ID && !environment.BLOB_READ_WRITE_TOKEN) || !environment.BLOB_WEBHOOK_PUBLIC_KEY) {
        return Response.json({ error: "ยังไม่ได้เชื่อมต่อ Vercel Blob" }, { status: 503 });
      }
    }

    try {
      const result = await handlePresignedUploadRequest({
        body,
        request,
        webhookPublicKey: environment.BLOB_WEBHOOK_PUBLIC_KEY,
        getSignedToken: async (pathname, _clientPayload, multipart) => {
          if (!MEDIA_PATH.test(pathname)) throw new Error("invalid-media-path");
          const validUntil = Date.now() + (multipart ? 60 : 5) * 60_000;
          return {
            token: await issueUploadToken({
              pathname,
              operations: ["put"],
              allowedContentTypes: ["image/*", "video/*"],
              maximumSizeInBytes: MAX_MEDIA_BYTES,
              validUntil,
            }),
            urlOptions: {
              access: "private",
              allowedContentTypes: ["image/*", "video/*"],
              maximumSizeInBytes: MAX_MEDIA_BYTES,
              addRandomSuffix: false,
              validUntil,
            },
          };
        },
      });
      return Response.json(result, { headers: { "Cache-Control": "no-store" } });
    } catch {
      return Response.json({ error: "ไม่สามารถเตรียมหรือยืนยันการอัปโหลดสื่อ" }, { status: 502 });
    }
  };
}
