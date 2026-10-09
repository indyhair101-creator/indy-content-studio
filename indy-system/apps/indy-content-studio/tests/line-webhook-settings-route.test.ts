import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "../app/api/line/webhook-settings/route";
import { createAdminSessionToken } from "../features/auth/server/admin-session";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("LINE webhook settings route", () => {
  it("does not configure the channel for an unauthenticated request", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const response = await POST(new Request("https://indy.example/api/line/webhook-settings", { method: "POST" }));
    expect(response.status).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("configures the webhook from a valid admin session without exposing the token", async () => {
    const secret = "test-admin-secret-at-least-thirty-two-bytes";
    vi.stubEnv("AUTH_SECRET", secret);
    vi.stubEnv("LINE_CHANNEL_ACCESS_TOKEN", "private-line-token");
    vi.stubEnv("APP_PUBLIC_BASE_URL", "https://indy.example");
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/test")) return Response.json({ success: true });
      if (init?.method === "GET") return Response.json({ endpoint: "https://indy.example/api/line/webhook", active: true });
      return Response.json({});
    }));
    const token = await createAdminSessionToken(secret);
    const response = await POST(new Request("https://indy.example/api/line/webhook-settings", {
      method: "POST",
      headers: { cookie: `indy_admin_session=${token}` },
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ configured: true, verified: true, active: true });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
});
