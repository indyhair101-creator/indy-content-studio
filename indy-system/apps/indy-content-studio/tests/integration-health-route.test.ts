import { describe, expect, it, vi } from "vitest";
import { GET } from "../app/api/integrations/health/route";
import { defaultIntegrationHealthChecks, getIntegrationHealth } from "../features/integrations/server/integration-health";

describe("integration health", () => {
  it("reports Blob storage ready without Google service-account credentials", async () => {
    const checks = defaultIntegrationHealthChecks({ BLOB_STORE_ID: "store-test" }, {
      probeBlobStorage: async () => true,
    });
    const [blob] = await getIntegrationHealth(checks.filter((check) => check.provider === "blob"), { cache: new Map() });
    expect(blob).toMatchObject({ provider: "blob", status: "connected", category: "ok" });
  });

  it("returns safe disconnected status without leaking configuration", async () => {
    const response = await GET();
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.integrations).toContainEqual(expect.objectContaining({ provider: "google-sheets", status: "disconnected" }));
    expect(JSON.stringify(payload)).not.toContain("GOOGLE_PRIVATE_KEY");
    expect(JSON.stringify(payload)).not.toContain("secret-value");
  });

  it("sanitizes provider failures", async () => {
    const [result] = await getIntegrationHealth([{ provider: "make", check: async () => { throw new Error("secret-value"); } }]);
    expect(result).toMatchObject({ provider: "make", status: "error", message: "ตรวจการเชื่อมต่อไม่สำเร็จ" });
    expect(JSON.stringify(result)).not.toContain("secret-value");
  });

  it("probes Neon, Drive folder access, and the LINE access token instead of checking env presence", async () => {
    const execute = vi.fn(async (query: string) => {
      expect(query.toLowerCase()).toContain("select 1");
      return [{ ok: 1 }];
    });
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://api.line.me/v2/oauth/verify");
      expect(init?.method).toBe("POST");
      expect(init?.body).toBeInstanceOf(URLSearchParams);
      expect((init?.body as URLSearchParams).get("access_token")).toBe("line-token");
      return Response.json({ client_id: "123" });
    });
    const checks = defaultIntegrationHealthChecks({
      DATABASE_URL: "postgres://test",
      GOOGLE_SERVICE_ACCOUNT_EMAIL: "drive@example.test",
      GOOGLE_PRIVATE_KEY: "private-key",
      GOOGLE_DRIVE_FOLDER_ID: "folder-id",
      LINE_CHANNEL_SECRET: "channel-secret",
      LINE_CHANNEL_ACCESS_TOKEN: "line-token",
    }, {
      execute,
      fetcher,
      createDriveClient: () => ({ probeStorage: async () => "connected" }),
    });

    const health = await getIntegrationHealth(checks, { cache: new Map() });

    expect(health).toEqual(expect.arrayContaining([
      expect.objectContaining({ provider: "database", status: "connected", category: "ok" }),
      expect.objectContaining({ provider: "google-drive", status: "connected", category: "ok" }),
      expect.objectContaining({ provider: "line", status: "connected", category: "ok" }),
    ]));
    expect(execute).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("requires both LINE credentials and reports missing configuration safely", async () => {
    const fetcher = vi.fn();
    const checks = defaultIntegrationHealthChecks({ LINE_CHANNEL_SECRET: "present" }, { fetcher });
    const [line] = await getIntegrationHealth(checks.filter((check) => check.provider === "line"), { cache: new Map() });
    expect(line).toMatchObject({ status: "disconnected", category: "configuration" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("requires both Make webhook and bearer token", async () => {
    const [missingWebhook] = await getIntegrationHealth(defaultIntegrationHealthChecks({ MAKE_API_TOKEN: "token" }).filter((check) => check.provider === "make"), { cache: new Map() });
    const [configured] = await getIntegrationHealth(defaultIntegrationHealthChecks({ MAKE_API_TOKEN: "token", MAKE_PUBLICATION_WEBHOOK_URL: "https://make.example/webhook" }).filter((check) => check.provider === "make"), { cache: new Map() });
    expect(missingWebhook).toMatchObject({ status: "disconnected", category: "configuration" });
    expect(configured).toMatchObject({ status: "connected", category: "ok" });
  });

  it("bounds slow probes, reports a safe timeout category, and does not cache failures", async () => {
    let receivedSignal: AbortSignal | undefined;
    const check = vi.fn((signal?: AbortSignal) => {
      receivedSignal = signal;
      return new Promise<never>(() => {});
    });
    const cache = new Map();
    const checks = [{ provider: "make" as const, check, cacheKey: "slow-make" }];

    const [result] = await getIntegrationHealth(checks, { timeoutMs: 1, cache });

    expect(result).toMatchObject({ status: "error", category: "timeout" });
    expect(receivedSignal?.aborted).toBe(true);
    expect(cache.size).toBe(0);
  });

  it("caches successful probes briefly but retries failed probes", async () => {
    let now = 1000;
    const connected = vi.fn(async () => ({ status: "connected" as const, category: "ok" as const }));
    const failed = vi.fn(async () => ({ status: "error" as const, category: "provider" as const }));
    const cache = new Map();
    const options = { now: () => now, cacheTtlMs: 50, cache };

    await getIntegrationHealth([{ provider: "make", check: connected, cacheKey: "stable" }], options);
    await getIntegrationHealth([{ provider: "make", check: connected, cacheKey: "stable" }], options);
    await getIntegrationHealth([{ provider: "tiktok", check: failed, cacheKey: "unavailable" }], options);
    await getIntegrationHealth([{ provider: "tiktok", check: failed, cacheKey: "unavailable" }], options);
    expect(connected).toHaveBeenCalledTimes(1);
    expect(failed).toHaveBeenCalledTimes(2);

    now += 51;
    await getIntegrationHealth([{ provider: "make", check: connected, cacheKey: "stable" }], options);
    expect(connected).toHaveBeenCalledTimes(2);
  });

  it("keys successful-probe cache by a one-way credential fingerprint", () => {
    const first = defaultIntegrationHealthChecks({ LINE_CHANNEL_SECRET: "same-secret", LINE_CHANNEL_ACCESS_TOKEN: "token-one" })
      .find((check) => check.provider === "line")?.cacheKey;
    const rotated = defaultIntegrationHealthChecks({ LINE_CHANNEL_SECRET: "same-secret", LINE_CHANNEL_ACCESS_TOKEN: "token-two" })
      .find((check) => check.provider === "line")?.cacheKey;
    expect(first).not.toBe(rotated);
    expect(first).not.toContain("token-one");
    expect(rotated).not.toContain("token-two");
  });

  it("sends LINE token only in the form body and returns no provider response details", async () => {
    const checks = defaultIntegrationHealthChecks({
      LINE_CHANNEL_SECRET: "channel-secret",
      LINE_CHANNEL_ACCESS_TOKEN: "do-not-return-this-token",
    }, {
      fetcher: async () => new Response("provider echoed do-not-return-this-token", { status: 400 }),
    });
    const [line] = await getIntegrationHealth(checks.filter((check) => check.provider === "line"), { cache: new Map() });
    expect(line).toMatchObject({ status: "disconnected", category: "permission" });
    expect(JSON.stringify(line)).not.toContain("do-not-return-this-token");
    expect(JSON.stringify(line)).not.toContain("provider echoed");
  });

  it("marks the health response non-cacheable by browsers and intermediaries", async () => {
    const response = await GET();
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
});
