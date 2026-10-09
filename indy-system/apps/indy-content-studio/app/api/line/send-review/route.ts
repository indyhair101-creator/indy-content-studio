import { requireAdmin, AdminAuthenticationError } from "../../../../features/auth/server/admin-session";
import { NeonDashboardRepository } from "../../../../features/data/server/neon-dashboard-repository";
import { LineDeliveryError, LineDeliveryService } from "../../../../features/line-oa/server/line-delivery-service";

const headers = { "Cache-Control": "no-store" };
export async function POST(request: Request): Promise<Response> {
  let actor;
  try { actor = await requireAdmin(request); } catch (error) {
    return Response.json({ error: error instanceof AdminAuthenticationError ? "unauthorized" : "line_review_unavailable" }, { status: error instanceof AdminAuthenticationError ? 401 : 503, headers });
  }
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "invalid_request" }, { status: 400, headers }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ error: "invalid_request" }, { status: 400, headers });
  const values = body as Record<string, unknown>;
  if (Object.keys(values).length !== 3 || typeof values.contentId !== "string" || !values.contentId.trim()
    || typeof values.cycleId !== "string" || !values.cycleId.trim() || typeof values.reviewCode !== "string" || !values.reviewCode.trim()) {
    return Response.json({ error: "invalid_request" }, { status: 400, headers });
  }
  if (!process.env.LINE_CHANNEL_ACCESS_TOKEN) return Response.json({ error: "configuration" }, { status: 503, headers });
  try {
    const { state } = await new NeonDashboardRepository().loadDashboardState();
    const content = state.contents.find((item) => item.id === values.contentId && !item.deletedAt);
    if (!content || content.lineReview.activeCycleId !== values.cycleId || content.lineReview.reviewCode !== values.reviewCode) {
      return Response.json({ error: "stale_review" }, { status: 409, headers });
    }
    if (content.lineReview.status === "sent" || content.lineReview.status === "approved") return Response.json({ error: "review_already_sent" }, { status: 409, headers });
    const delivery = await new LineDeliveryService().sendContentToLine({ contentId: content.id, expectedUpdatedAt: content.updatedAt, actorId: actor.actorId,
      review: { cycleId: values.cycleId, reviewCode: values.reviewCode } });
    if (delivery.status !== "sent") return Response.json({ error: delivery.errorCategory, delivery }, { status: 502, headers });
    return Response.json({ status: "sent", reviewCode: delivery.review?.reviewCode ?? values.reviewCode, delivery }, { headers });
  } catch (error) {
    if (error instanceof LineDeliveryError) return Response.json({ error: error.code }, { status: error.code === "stale_content" ? 409 : 422, headers });
    return Response.json({ error: "line_review_unavailable" }, { status: 503, headers });
  }
}
