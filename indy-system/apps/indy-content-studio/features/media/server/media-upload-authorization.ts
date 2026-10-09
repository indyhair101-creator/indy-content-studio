import { timingSafeEqual } from "node:crypto";
import { ADMIN_SESSION_TTL_SECONDS } from "../../auth/server/admin-session";

const UPLOAD_COOKIE_NAME = "indy_media_upload_token";
type Environment = Readonly<Record<string, string | undefined>>;

export function createMediaUploadCookie(token: string): string {
  return `${UPLOAD_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/api/media/upload; HttpOnly; Secure; SameSite=Strict; Max-Age=${ADMIN_SESSION_TTL_SECONDS}`;
}

export function clearMediaUploadCookie(): string {
  return `${UPLOAD_COOKIE_NAME}=; Path=/api/media/upload; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export type MediaUploadAuthorization =
  | { authorized: true }
  | { authorized: false; status: 403 | 503; error: string };

export type AuthorizeMediaUpload = (
  request: Request,
) => MediaUploadAuthorization | Promise<MediaUploadAuthorization>;

function secureTokenEqual(candidate: string, expected: string): boolean {
  const candidateBytes = Buffer.from(candidate, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  return candidateBytes.length === expectedBytes.length
    && timingSafeEqual(candidateBytes, expectedBytes);
}

function bearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  return authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || null;
}

function cookieTokens(request: Request): string[] {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return [];
  const values: string[] = [];
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== UPLOAD_COOKIE_NAME) continue;
    const rawValue = part.slice(separator + 1).trim();
    try {
      values.push(decodeURIComponent(rawValue));
    } catch {
      values.push(rawValue);
    }
  }
  return values;
}

/**
 * The browser cookie must be provisioned by the deployment with HttpOnly,
 * Secure, and SameSite=Strict. Request Cookie headers do not carry attributes,
 * so this boundary can verify only the cookie name and secret value.
 */
export function createMediaUploadAuthorizer(
  environment: Environment = process.env,
): AuthorizeMediaUpload {
  const configuredToken = environment.INDY_MEDIA_UPLOAD_TOKEN;
  return (request) => {
    if (!configuredToken) {
      return {
        authorized: false,
        status: 503,
        error: "ยังไม่ได้ตั้งค่าการอนุญาตอัปโหลดสื่อ",
      };
    }

    const candidates = [bearerToken(request), ...cookieTokens(request)]
      .filter((candidate): candidate is string => Boolean(candidate));
    if (candidates.some((candidate) => secureTokenEqual(candidate, configuredToken))) {
      return { authorized: true };
    }

    return {
      authorized: false,
      status: 403,
      error: "ไม่มีสิทธิ์อัปโหลดสื่อ",
    };
  };
}
