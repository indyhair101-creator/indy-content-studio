import { createHmac, timingSafeEqual } from "node:crypto";

export type MediaDeliveryPurpose = "original" | "preview" | "original-link";

const DEFAULT_DELIVERY_TTL_SECONDS = 300;
const MAX_DELIVERY_TTL_SECONDS = 3_600;
type Environment = Readonly<Record<string, string | undefined>>;

type MediaDeliveryFields = {
  fileId: string;
  purpose: MediaDeliveryPurpose;
  expiresAt: number;
};

function signaturePayload({ fileId, purpose, expiresAt }: MediaDeliveryFields): string {
  return `${fileId}\n${purpose}\n${expiresAt}`;
}

function signMediaDelivery(fields: MediaDeliveryFields, secret: string): string {
  return createHmac("sha256", secret).update(signaturePayload(fields)).digest("base64url");
}

export function createMediaDeliveryUrl({
  baseUrl,
  secret,
  ...fields
}: MediaDeliveryFields & { baseUrl: string; secret: string }): string {
  if (!secret) throw new Error("Media signing secret is required");
  const url = new URL(`/api/media/provider/${encodeURIComponent(fields.fileId)}`, baseUrl);
  url.searchParams.set("purpose", fields.purpose);
  url.searchParams.set("expiresAt", String(fields.expiresAt));
  url.searchParams.set("signature", signMediaDelivery(fields, secret));
  return url.toString();
}

export function createEnvironmentMediaDeliveryUrl({
  fileId,
  purpose,
  environment = process.env,
  now = () => Math.floor(Date.now() / 1_000),
  ttlSeconds = DEFAULT_DELIVERY_TTL_SECONDS,
}: {
  fileId: string;
  purpose: MediaDeliveryPurpose;
  environment?: Environment;
  now?: () => number;
  ttlSeconds?: number;
}): string {
  const baseUrl = environment.APP_PUBLIC_BASE_URL;
  const secret = environment.INDY_MEDIA_SIGNING_SECRET;
  let parsedBase: URL;
  try {
    if (!baseUrl) throw new Error("missing base");
    parsedBase = new URL(baseUrl);
  } catch {
    throw new Error("APP_PUBLIC_BASE_URL must be an absolute HTTPS URL");
  }
  if (parsedBase.protocol !== "https:" || parsedBase.username || parsedBase.password) {
    throw new Error("APP_PUBLIC_BASE_URL must be an absolute HTTPS URL");
  }
  if (!secret) throw new Error("INDY_MEDIA_SIGNING_SECRET is required");
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > MAX_DELIVERY_TTL_SECONDS) {
    throw new Error("Media delivery TTL must be between 1 and 3600 seconds");
  }

  return createMediaDeliveryUrl({
    baseUrl: parsedBase.toString(),
    fileId,
    purpose,
    expiresAt: now() + ttlSeconds,
    secret,
  });
}

/**
 * Integration servers call this with persisted provider IDs immediately before
 * delivery. The returned URLs are deliberately short-lived and must not be
 * written back into DashboardState.
 */
export function createProviderMediaDeliveryUrls({
  providerFileId,
  previewProviderFileId,
  environment = process.env,
  now = () => Math.floor(Date.now() / 1_000),
  ttlSeconds = DEFAULT_DELIVERY_TTL_SECONDS,
  originalPurpose = "original",
}: {
  providerFileId: string;
  previewProviderFileId: string;
  environment?: Environment;
  now?: () => number;
  ttlSeconds?: number;
  originalPurpose?: "original" | "original-link";
}): { originalContentUrl: string; previewImageUrl: string } {
  return {
    originalContentUrl: createEnvironmentMediaDeliveryUrl({
      fileId: providerFileId,
      purpose: originalPurpose,
      environment,
      now,
      ttlSeconds,
    }),
    previewImageUrl: createEnvironmentMediaDeliveryUrl({
      fileId: previewProviderFileId,
      purpose: "preview",
      environment,
      now,
      ttlSeconds,
    }),
  };
}

export function verifyMediaDeliveryUrl({
  url,
  expectedFileId,
  secret,
  now,
}: {
  url: string;
  expectedFileId: string;
  secret: string;
  now: number;
}): boolean {
  if (!secret) return false;
  const parsed = new URL(url);
  const purpose = parsed.searchParams.get("purpose");
  const expiresValue = parsed.searchParams.get("expiresAt");
  const receivedSignature = parsed.searchParams.get("signature");
  if (purpose !== "original" && purpose !== "preview" && purpose !== "original-link") return false;
  if (!expiresValue || !receivedSignature) return false;

  const expiresAt = Number(expiresValue);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now) return false;
  const expectedSignature = signMediaDelivery({ fileId: expectedFileId, purpose, expiresAt }, secret);
  const receivedBytes = Buffer.from(receivedSignature);
  const expectedBytes = Buffer.from(expectedSignature);
  return receivedBytes.length === expectedBytes.length && timingSafeEqual(receivedBytes, expectedBytes);
}
