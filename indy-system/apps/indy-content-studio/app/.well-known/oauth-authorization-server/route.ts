import { mcpOAuth } from "../../../features/mcp/oauth-instance";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET() {
  try { return Response.json(mcpOAuth.metadata(), { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ error: "mcp_not_configured" }, { status: 503 }); }
}
