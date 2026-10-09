import { clearAdminSessionCookie } from "../../../../features/auth/server/admin-session";
import { clearMediaUploadCookie } from "../../../../features/media/server/media-upload-authorization";

export async function POST(): Promise<Response> {
  const headers = new Headers({ "Cache-Control": "no-store" });
  headers.append("Set-Cookie", clearAdminSessionCookie());
  headers.append("Set-Cookie", clearMediaUploadCookie());
  return Response.json({ ok: true }, {
    headers,
  });
}
