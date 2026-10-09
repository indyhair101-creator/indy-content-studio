import { verifyAdminPassword } from "../../../../features/auth/server/admin-password";
import { createAdminSessionCookie, createAdminSessionToken } from "../../../../features/auth/server/admin-session";
import { createMediaUploadCookie } from "../../../../features/media/server/media-upload-authorization";

export async function POST(request: Request): Promise<Response> {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "invalid_login_request" }, { status: 400 });
  }

  const password = input && typeof input === "object" ? (input as { password?: unknown }).password : undefined;
  const encodedHash = process.env.INDY_ADMIN_PASSWORD_HASH;
  const secret = process.env.AUTH_SECRET;
  if (typeof password !== "string" || password.length > 1_024) {
    return Response.json({ error: "invalid_login_request" }, { status: 400 });
  }
  if (!encodedHash || !secret || new TextEncoder().encode(secret).byteLength < 32) {
    return Response.json({ error: "authentication_unavailable" }, { status: 503 });
  }

  if (!(await verifyAdminPassword(password, encodedHash))) {
    return Response.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const token = await createAdminSessionToken(secret);
  const headers = new Headers({ "Cache-Control": "no-store" });
  headers.append("Set-Cookie", createAdminSessionCookie(token));
  if (process.env.INDY_MEDIA_UPLOAD_TOKEN) {
    headers.append("Set-Cookie", createMediaUploadCookie(process.env.INDY_MEDIA_UPLOAD_TOKEN));
  }
  return Response.json({ ok: true }, { headers });
}
