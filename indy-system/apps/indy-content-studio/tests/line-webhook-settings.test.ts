import { describe, expect, it, vi } from "vitest";
import { configureLineWebhook } from "../features/line-oa/server/line-webhook-settings";

describe("LINE webhook configuration", () => {
  it("sets and tests the public webhook using the server-held channel token", async () => {
    const calls: Array<{ url: string; method: string; authorization: string; body: string }> = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: String(input),
        method: init?.method ?? "GET",
        authorization: new Headers(init?.headers).get("Authorization") ?? "",
        body: String(init?.body ?? ""),
      });
      if (String(input).endsWith("/test")) return Response.json({ success: true });
      if (init?.method === "GET") return Response.json({ endpoint: "https://indy.example/api/line/webhook", active: true });
      return Response.json({});
    });

    const result = await configureLineWebhook({
      environment: { APP_PUBLIC_BASE_URL: "https://indy.example", LINE_CHANNEL_ACCESS_TOKEN: "private-token" },
      fetcher,
    });

    expect(result).toEqual({ configured: true, verified: true, active: true });
    expect(calls.map(({ url, method }) => [url, method])).toEqual([
      ["https://api.line.me/v2/bot/channel/webhook/endpoint", "PUT"],
      ["https://api.line.me/v2/bot/channel/webhook/test", "POST"],
      ["https://api.line.me/v2/bot/channel/webhook/endpoint", "GET"],
    ]);
    expect(JSON.parse(calls[0].body)).toEqual({ endpoint: "https://indy.example/api/line/webhook" });
    expect(calls.every((call) => call.authorization === "Bearer private-token")).toBe(true);
    expect(JSON.stringify(result)).not.toContain("private-token");
  });

  it("rejects non-HTTPS origins before calling LINE", async () => {
    const fetcher = vi.fn();
    await expect(configureLineWebhook({
      environment: { APP_PUBLIC_BASE_URL: "http://indy.example", LINE_CHANNEL_ACCESS_TOKEN: "private-token" },
      fetcher,
    })).rejects.toThrow("configuration");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
