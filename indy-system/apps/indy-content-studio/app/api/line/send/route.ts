import { requireAdmin, AdminAuthenticationError } from "../../../../features/auth/server/admin-session";
import { LineDeliveryError, LineDeliveryService } from "../../../../features/line-oa/server/line-delivery-service";

export async function POST(request: Request): Promise<Response> {
  let actor;
  try {
    actor = await requireAdmin(request);
  } catch (error) {
    if (error instanceof AdminAuthenticationError) {
      return Response.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }
    return Response.json({ error: "line_delivery_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "invalid_request" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const values = body as Record<string, unknown>;
  if (Object.keys(values).length !== 2 || typeof values.contentId !== "string" || !values.contentId.trim()
    || typeof values.expectedUpdatedAt !== "string" || !values.expectedUpdatedAt.trim()) {
    return Response.json({ error: "invalid_request" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const delivery = await new LineDeliveryService().sendContentToLine({
      contentId: values.contentId,
      expectedUpdatedAt: values.expectedUpdatedAt,
      actorId: actor.actorId,
    });
    return Response.json({ delivery }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof LineDeliveryError) {
      const status = error.code === "content_not_found" ? 404 : error.code === "stale_content" ? 409 : 422;
      return Response.json({ error: error.code }, { status, headers: { "Cache-Control": "no-store" } });
    }
    return Response.json({ error: "line_delivery_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
