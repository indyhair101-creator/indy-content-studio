// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";
import { handleMcpRequest } from "../features/mcp/http-handler";
import { DashboardMcpService } from "../features/mcp/dashboard-service";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import { signToken } from "../features/mcp/oauth-crypto";

const origin = "https://indy.test";
function access(scope: string) {
  return signToken({ kind: "access", iss: origin, aud: origin + "/mcp", sub: "primary-admin", clientId: "test-client",
    scope, exp: Math.floor(Date.now() / 1000) + 3600 });
}
function service() {
  let state = createEmptyDashboardState(); let version = 1;
  return new DashboardMcpService({
    loadDashboardState: async () => ({ state: structuredClone(state), version }),
    saveDashboardState: async (next) => { state = structuredClone(next); return { version: ++version }; },
  });
}

describe("stateless MCP Streamable HTTP", () => {
  beforeEach(() => {
    vi.stubEnv("MCP_PUBLIC_URL", origin);
    vi.stubEnv("MCP_OAUTH_SECRET", "test-mcp-signing-secret-at-least-32-characters");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("returns an OAuth discovery challenge without touching dashboard storage", async () => {
    const response = await handleMcpRequest(new Request(origin + "/mcp", { method: "POST" }));
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain(origin + "/.well-known/oauth-protected-resource");
    expect((await handleMcpRequest(new Request(origin + "/mcp", { method: "POST",
      headers: { authorization: "Bearer invalid" } }))).status).toBe(401);
    expect((await handleMcpRequest(new Request(origin + "/mcp", { method: "POST",
      headers: { authorization: "Bearer " + access("dashboard:read"), origin: "https://evil.test" } }))).status).toBe(403);
  });

  it("discovers and calls tools through the official SDK client and persists schedule changes", async () => {
    const db = service();
    const client = new Client({ name: "integration-test", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(origin + "/mcp"), {
      requestInit: { headers: { authorization: "Bearer " + access("dashboard:read dashboard:write") } },
      fetch: async (url, init) => handleMcpRequest(new Request(url, init), db),
    });
    await client.connect(transport);
    try {
      const { tools } = await client.listTools();
      expect(tools).toHaveLength(9);
      expect(tools.find((t) => t.name === "get_calendar")?.annotations?.readOnlyHint).toBe(true);
      expect(tools.find((t) => t.name === "delete_content")?.annotations?.destructiveHint).toBe(true);
      const result = await client.callTool({ name: "create_content", arguments: {
        request_id: "426f94c0-0f6b-4ca0-9e8f-d1b838d72bc1", title: "รีวิวจาก ChatGPT",
        category_id: "category-review", format_id: "format-video",
      } });
      expect(result.isError).not.toBe(true);
      const content = (result.structuredContent as { content: { id: string } }).content;
      await client.callTool({ name: "schedule_content", arguments: {
        content_id: content.id, platform: "facebook", publish_at: "2026-10-08T09:30",
      } });
      const calendar = await client.callTool({ name: "get_calendar", arguments: { month: "2026-10" } });
      const days = (calendar.structuredContent as { days: { date: string; contents: unknown[] }[] }).days;
      expect(days.find((d) => d.date === "2026-10-08")?.contents).toHaveLength(1);
      const invalid = await client.callTool({ name: "schedule_content", arguments: {
        content_id: content.id, platform: "facebook", publish_at: "2026-02-30T09:30",
      } });
      expect(invalid.isError).toBe(true);
    } finally { await client.close(); }
  });

  it("prevents a read-only access token from executing writes", async () => {
    const client = new Client({ name: "readonly-test", version: "1.0.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(origin + "/mcp"), {
      requestInit: { headers: { authorization: "Bearer " + access("dashboard:read") } },
      fetch: async (url, init) => handleMcpRequest(new Request(url, init), service()),
    }));
    try {
      const denied = await client.callTool({ name: "delete_content", arguments: { content_id: "anything" } });
      expect(denied.isError).toBe(true);
      expect(denied._meta?.["mcp/www_authenticate"]).toBeTruthy();
    } finally { await client.close(); }
  });

  it("routes only implemented protocol endpoints past admin middleware", async () => {
    for (const path of ["/mcp", "/.well-known/oauth-protected-resource", "/.well-known/oauth-authorization-server", "/oauth/token", "/oauth/authorize"]) {
      expect((await middleware(new NextRequest(origin + path, { method: path === "/oauth/token" ? "POST" : "GET" }))).status).toBe(200);
    }
    expect((await middleware(new NextRequest(origin + "/api/dashboard-state"))).status).toBe(401);
    expect((await middleware(new NextRequest(origin + "/oauth/unknown"))).status).toBe(307);
  });
});
