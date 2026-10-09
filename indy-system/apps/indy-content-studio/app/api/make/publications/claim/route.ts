import { ApprovedPublicationQueue, PublicationQueueError, verifyPublicationJobToken } from "../../../../../features/publication/server/approved-publication-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  let body: { jobId?: string };
  try { body = await request.json() as { jobId?: string }; } catch { return Response.json({ error: "Invalid request" }, { status: 400 }); }
  if (typeof body?.jobId !== "string" || !body.jobId) return Response.json({ error: "jobId is required" }, { status: 400 });
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    if (!verifyPublicationJobToken(body.jobId, token)) return Response.json({ error: "unauthorized" }, { status: 401 });
    const result = await new ApprovedPublicationQueue().claim(body.jobId, token);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: error instanceof PublicationQueueError ? error.message : "Publication queue is unavailable" }, { status: error instanceof PublicationQueueError ? error.status : 503 }); }
}
