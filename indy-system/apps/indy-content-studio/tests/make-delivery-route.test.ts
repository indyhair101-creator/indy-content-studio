import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "../app/api/make/publications/route";

const originalUrl = process.env.MAKE_PUBLICATION_WEBHOOK_URL;
const originalToken = process.env.MAKE_API_TOKEN;

afterEach(() => { process.env.MAKE_PUBLICATION_WEBHOOK_URL = originalUrl; process.env.MAKE_API_TOKEN = originalToken; vi.unstubAllGlobals(); });

describe("Make publication route", () => {
  it("reports disconnected Make without leaking secrets", async () => {
    delete process.env.MAKE_PUBLICATION_WEBHOOK_URL;
    delete process.env.MAKE_API_TOKEN;
    const response = await POST(new Request("https://example.test", { method: "POST", body: JSON.stringify({ attemptId: "a", contentId: "c", platform: "facebook", publishAt: "now" }) }));
    expect(response.status).toBe(503);
  });

  it("requires the Make bearer token even when the webhook exists", async () => {
    process.env.MAKE_PUBLICATION_WEBHOOK_URL = "https://make.example/hook";
    delete process.env.MAKE_API_TOKEN;
    const response = await POST(new Request("https://example.test", { method: "POST", body: JSON.stringify({ attemptId: "a", contentId: "c", platform: "facebook", publishAt: "now" }) }));
    expect(response.status).toBe(503);
  });
});
