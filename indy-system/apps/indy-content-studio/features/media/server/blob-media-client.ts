import { issueSignedToken, presignUrl } from "@vercel/blob";

export async function createPrivateBlobReadUrl({ pathname, validUntil }: { pathname: string; validUntil: number }): Promise<string> {
  const token = await issueSignedToken({ pathname, operations: ["get"], validUntil });
  const { presignedUrl } = await presignUrl(token, { operation: "get", access: "private", pathname, validUntil });
  return presignedUrl;
}

export async function streamPrivateBlob({ pathname, range }: { pathname: string; range?: string }): Promise<Response> {
  const validUntil = Date.now() + 60_000;
  const presignedUrl = await createPrivateBlobReadUrl({ pathname, validUntil });
  return fetch(presignedUrl, {
    headers: range ? { Range: range } : undefined,
    cache: "no-store",
  });
}
