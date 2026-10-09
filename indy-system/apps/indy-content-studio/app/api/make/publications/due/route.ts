import { ApprovedPublicationQueue } from "../../../../../features/publication/server/approved-publication-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const headers = { "Cache-Control": "no-store" };
  if (!process.env.MAKE_API_TOKEN) return Response.json({ error: "Publication scheduler is unavailable" }, { status: 503, headers });
  if (request.headers.get("authorization") !== `Bearer ${process.env.MAKE_API_TOKEN}`) return Response.json({ error: "unauthorized" }, { status: 401, headers });
  try { return Response.json({ jobs: await new ApprovedPublicationQueue().due() }, { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ error: "Publication queue is unavailable" }, { status: 503, headers }); }
}
