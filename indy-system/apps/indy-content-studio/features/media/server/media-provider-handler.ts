import type { GoogleDriveMediaClient } from "./google-drive-media-client";
import { createPrivateBlobReadUrl, streamPrivateBlob } from "./blob-media-client";
import { verifyMediaDeliveryUrl } from "./media-delivery-url";

export type ProviderRouteContext = { params: Promise<{ fileId: string }> };

type MediaProviderDependencies = {
  getClient: () => GoogleDriveMediaClient | null | Promise<GoogleDriveMediaClient | null>;
  streamBlob?: (input: { pathname: string; range?: string }) => Promise<Response>;
  getBlobUrl?: typeof createPrivateBlobReadUrl;
  signingSecret: string;
  now?: () => number;
};

const SAFE_PROVIDER_HEADERS = [
  "accept-ranges",
  "content-length",
  "content-range",
  "content-type",
  "etag",
  "last-modified",
] as const;

function copySafeProviderHeaders(source: Headers): Headers {
  const result = new Headers({ "Cache-Control": "private, no-store" });
  for (const name of SAFE_PROVIDER_HEADERS) {
    const value = source.get(name);
    if (value) result.set(name, value);
  }
  return result;
}

export function createMediaProviderHandler({
  getClient,
  streamBlob = streamPrivateBlob,
  getBlobUrl = createPrivateBlobReadUrl,
  signingSecret,
  now = () => Math.floor(Date.now() / 1_000),
}: MediaProviderDependencies) {
  return async function handleMediaProvider(request: Request, context: ProviderRouteContext): Promise<Response> {
    const { fileId } = await context.params;
    if (!verifyMediaDeliveryUrl({
      url: request.url,
      expectedFileId: fileId,
      secret: signingSecret,
      now: now(),
    })) {
      return Response.json({ error: "ลิงก์สื่อไม่ถูกต้องหรือหมดอายุ" }, { status: 401 });
    }

    try {
      const range = request.headers.get("range") ?? undefined;
      let providerResponse: Response;
      if (fileId.startsWith("blob:")) {
        const pathname = fileId.slice(5);
        if (!/^media\/[a-zA-Z0-9_-]{1,120}\/[0-9a-f-]{36}\.[a-z0-9]{1,8}$/.test(pathname)) {
          return Response.json({ error: "ไฟล์สื่อไม่ถูกต้อง" }, { status: 400 });
        }
        const url = new URL(request.url);
        if (url.searchParams.get("purpose") === "original-link") {
          const location = await getBlobUrl({ pathname, validUntil: Number(url.searchParams.get("expiresAt")) * 1_000 });
          return new Response(null, { status: 307, headers: { Location: location, "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
        }
        providerResponse = await streamBlob({ pathname, range });
      } else {
        const client = await getClient();
        if (!client) return Response.json({ error: "ยังไม่ได้เชื่อมต่อ Google Drive" }, { status: 503 });
        providerResponse = await client.streamFile({ fileId, range });
      }
      return new Response(providerResponse.body, {
        status: providerResponse.status,
        headers: copySafeProviderHeaders(providerResponse.headers),
      });
    } catch {
      return Response.json({ error: "อ่านไฟล์จากที่เก็บสื่อไม่สำเร็จ" }, { status: 502 });
    }
  };
}
