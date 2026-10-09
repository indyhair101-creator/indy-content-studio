import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { NeonDashboardRepository } from "../data/server/neon-dashboard-repository";
import { loadSyncedDashboardState } from "../data/server/review-dashboard-sync";
import { DashboardMcpService } from "./dashboard-service";
import { mcpOAuth } from "./oauth-instance";
import { mcpOrigin } from "./oauth-crypto";
import { authChallenge, createDashboardMcpServer } from "./server";

export async function handleMcpRequest(request: Request, service?: DashboardMcpService): Promise<Response> {
  try {
    const origin = mcpOrigin();
    if (new URL(request.url).host !== new URL(origin).host) {
      return Response.json({ error: "invalid_host" }, { status: 403 });
    }
    const requestOrigin = request.headers.get("origin");
    if (requestOrigin && ![origin, "https://chatgpt.com"].includes(requestOrigin)) {
      return Response.json({ error: "invalid_origin" }, { status: 403 });
    }
    const header = request.headers.get("authorization") ?? "";
    const bearer = /^Bearer ([A-Za-z0-9_.-]+)$/i.exec(header)?.[1];
    const access = bearer ? mcpOAuth.verifyAccessToken(bearer) : null;
    if (!access) {
      return Response.json({ error: "authentication_required" }, { status: 401, headers: {
        "WWW-Authenticate": authChallenge(), "Cache-Control": "no-store",
      } });
    }
    if (request.method !== "POST") {
      return Response.json({ error: "method_not_allowed" }, { status: 405, headers: { Allow: "POST" } });
    }
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined, enableJsonResponse: true, maxRequestBodySize: 65536,
    });
    const server = createDashboardMcpServer(service ?? new DashboardMcpService({ loadDashboardState: () => loadSyncedDashboardState(), saveDashboardState: (state, version) => new NeonDashboardRepository().saveDashboardState(state, version) }), access);
    await server.connect(transport);
    try {
      const response = await transport.handleRequest(request);
      response.headers.set("Cache-Control", "no-store");
      return response;
    } finally { await server.close(); }
  } catch (error) {
    console.error("[mcp] Request failed", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "mcp_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
