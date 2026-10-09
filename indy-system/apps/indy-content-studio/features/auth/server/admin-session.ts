export const ADMIN_SESSION_COOKIE = "indy_admin_session";
export const ADMIN_SESSION_TTL_SECONDS = 8 * 60 * 60;

export type AdminActor = { actorId: "primary-admin" };

const encoder = new TextEncoder();

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function decodeBase64Url(value: string): ArrayBuffer | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64 + "=".repeat((4 - base64.length % 4) % 4));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes.buffer;
  } catch {
    return null;
  }
}

function hasStrongSecret(secret: string): boolean {
  return encoder.encode(secret).byteLength >= 32;
}

async function importHmacKey(secret: string, usages: KeyUsage[]): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, usages);
}

export async function createAdminSessionToken(secret: string, now = Date.now()): Promise<string> {
  if (!hasStrongSecret(secret)) throw new Error("Admin session secret is not configured");
  const nonce = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const payload = encodeBase64Url(encoder.encode(JSON.stringify({
    sub: "primary-admin",
    exp: Math.floor(now / 1_000) + ADMIN_SESSION_TTL_SECONDS,
    nonce: encodeBase64Url(nonce),
  })));
  const key = await importHmacKey(secret, ["sign"]);
  const signature = new Uint8Array(await globalThis.crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
  return `${payload}.${encodeBase64Url(signature)}`;
}

export async function verifyAdminSessionToken(token: string, secret: string, now = Date.now()): Promise<AdminActor | null> {
  if (!hasStrongSecret(secret)) return null;
  const [payloadPart, signaturePart, extra] = token.split(".");
  if (!payloadPart || !signaturePart || extra !== undefined) return null;
  const signature = decodeBase64Url(signaturePart);
  const payloadBytes = decodeBase64Url(payloadPart);
  if (!signature || signature.byteLength !== 32 || !payloadBytes) return null;

  try {
    const key = await importHmacKey(secret, ["verify"]);
    const validSignature = await globalThis.crypto.subtle.verify("HMAC", key, signature, encoder.encode(payloadPart));
    if (!validSignature) return null;
    const payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as { sub?: unknown; exp?: unknown; nonce?: unknown };
    if (payload.sub !== "primary-admin" || !Number.isSafeInteger(payload.exp) || typeof payload.nonce !== "string") return null;
    if ((payload.exp as number) <= Math.floor(now / 1_000)) return null;
    return { actorId: "primary-admin" };
  } catch {
    return null;
  }
}

function sessionTokenFromRequest(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const entry = cookieHeader.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${ADMIN_SESSION_COOKIE}=`));
  return entry ? entry.slice(ADMIN_SESSION_COOKIE.length + 1) : null;
}

export async function getAdminActor(request: Request, env: NodeJS.ProcessEnv = process.env, now = Date.now()): Promise<AdminActor | null> {
  const secret = env.AUTH_SECRET;
  const token = sessionTokenFromRequest(request);
  if (!secret || !token) return null;
  return verifyAdminSessionToken(token, secret, now);
}

export class AdminAuthenticationError extends Error {
  constructor() {
    super("Administrator authentication required");
    this.name = "AdminAuthenticationError";
  }
}

export async function requireAdmin(request: Request, env: NodeJS.ProcessEnv = process.env, now = Date.now()): Promise<AdminActor> {
  const actor = await getAdminActor(request, env, now);
  if (!actor) throw new AdminAuthenticationError();
  return actor;
}

export function createAdminSessionCookie(token: string): string {
  return `${ADMIN_SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${ADMIN_SESSION_TTL_SECONDS}`;
}

export function clearAdminSessionCookie(): string {
  return `${ADMIN_SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
