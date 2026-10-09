import { requireAdmin } from "../../../../features/auth/server/admin-session";
import { configureLineWebhook } from "../../../../features/line-oa/server/line-webhook-settings";

const noStore = { "Cache-Control": "no-store" };

export async function POST(request: Request): Promise<Response> {
  try {
    await requireAdmin(request);
  } catch {
    return Response.json({ error: "unauthorized" }, { status: 401, headers: noStore });
  }

  try {
    return Response.json(await configureLineWebhook(), { headers: noStore });
  } catch (error) {
    const category = error instanceof Error && error.message === "configuration" ? "configuration" : "provider";
    return Response.json({ error: category }, { status: 503, headers: noStore });
  }
}
