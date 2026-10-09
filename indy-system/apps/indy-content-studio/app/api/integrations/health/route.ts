import { getIntegrationHealth } from "../../../../features/integrations/server/integration-health";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return Response.json({ integrations: await getIntegrationHealth() }, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
