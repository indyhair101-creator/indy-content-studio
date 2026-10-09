import { ActivePublicationEditError, NeonDashboardRepository, StaleDashboardStateError } from "../../../features/data/server/neon-dashboard-repository";
import type { DashboardState } from "../../../features/domain/types";
import { loadSyncedDashboardState } from "../../../features/data/server/review-dashboard-sync";

export async function GET(): Promise<Response> {
  try {
    return Response.json(await loadSyncedDashboardState(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "dashboard_unavailable" }, { status: 503 });
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    const input = await request.json() as { state?: DashboardState; expectedVersion?: unknown };
    if (!input.state || !Number.isSafeInteger(input.expectedVersion)) {
      return Response.json({ error: "invalid_dashboard_request" }, { status: 400 });
    }
    return Response.json(await new NeonDashboardRepository().saveDashboardState(input.state, input.expectedVersion as number));
  } catch (error) {
    if (error instanceof StaleDashboardStateError) {
      return Response.json({ error: "stale_dashboard_state" }, { status: 409 });
    }
    if (error instanceof ActivePublicationEditError) {
      return Response.json({ error: "publication_locked" }, { status: 409 });
    }
    return Response.json({ error: "dashboard_unavailable" }, { status: 503 });
  }
}
