import { listRecentCorrections } from "../../../../features/line-oa/server/correction-feed";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const since = new URL(request.url).searchParams.get("since") ?? "";
  if (!Number.isFinite(Date.parse(since))) {
    return Response.json({ error: "invalid_since" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  try {
    return Response.json({ corrections: await listRecentCorrections({ since }) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "corrections_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
