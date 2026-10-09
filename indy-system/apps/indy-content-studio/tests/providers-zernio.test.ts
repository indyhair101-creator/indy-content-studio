// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { fetchZernio } from "../features/reports/server/zernio";
import { fetchReportProviders } from "../features/reports/server/report-http";
import { validateReportingState } from "../features/reports/report-schema";
const range = { start: "2026-10-01", end: "2026-10-09" };
const token = "secret-never-in-response";
const env = { Zernio_API_KEY: token };
const now = () => new Date("2026-10-09T00:00:00Z");
const account = { _id: "a1", platform: "facebook", platformUserId: "page1", displayName: "สอนทำผม INDY HAIR DESIGN ACADEMY", isActive: true };
const health = { tokenStatus: { valid: true }, permissions: { canFetchAnalytics: true } };
const post = { _id: "post1", publishedAt: "2026-10-02T00:00:00Z", content: "Real post", mediaType: "video", platforms: [{ platform: "facebook", accountId: "a1", status: "published", platformPostId: "page1_post1", platformPostUrl: "https://facebook.com/reel/1", syncStatus: "synced", analytics: { views: 120, likes: 0, comments: 3, shares: 2, reach: 70, saves: 0, clicks: 0, igReelsAvgWatchTime: 16000, igReelsVideoViewTotalTime: 240000, lastUpdated: "2026-10-08T01:00:00Z", retentionCurve: { "0": 1, "4": 0.7 } } }] };
const queue = (...values: unknown[]) => vi.fn<typeof fetch>().mockImplementation(async () => { const item = values.shift(); return item instanceof Response ? item : Response.json(item); });
describe("Zernio reporting", () => {
  it("uses existing mixed-case key, discovers real identity, maps only platform rows and absolute snapshots", async () => {
    const fetcher = queue({ accounts: [account], hasAnalyticsAccess: true }, health, { posts: [post], pagination: { pages: 1 } });
    const result = await fetchZernio(range, { env, fetch: fetcher, now }); const data = result.results[0];
    expect(data.connection).toMatchObject({ id: "zernio:facebook:a1", accountId: "page1", status: "connected" });
    expect(data.observations[0]).toMatchObject({ scope: "lifetime", period: null, traffic: "unknown", metrics: { views: 120, likes: 0, reach: 70, averageWatchSeconds: 16, watchSeconds: 240 }, averageWatchWeight: null, retention: [{ positionSeconds: 0, ratio: 1 }, { positionSeconds: 4, ratio: 0.7 }] });
    expect(data.observations[0].sourceLabel).toContain("2026-10-08T01:00:00.000Z");
    expect(data.observations[0].metrics.saves).toBeUndefined(); expect(data.observations[0].metrics.clicks).toBeUndefined();
    expect(() => validateReportingState({ connections: [data.connection], publications: data.publications, observations: data.observations, savedReports: [] })).not.toThrow();
    expect(fetcher.mock.calls.every(([_, init]) => init?.method === "GET")).toBe(true);
    expect(JSON.stringify(result)).not.toContain(token);
  });
  it("reports missing subscription honestly and never requests analytics", async () => {
    const fetcher = queue({ accounts: [account], hasAnalyticsAccess: false }, health);
    const data = await fetchZernio(range, { env, fetch: fetcher, now });
    expect(data.results[0].connection.status).toBe("missing-permission"); expect(data.results[0].connection.message).toContain("แผน");
    expect(fetcher).toHaveBeenCalledTimes(2); expect(data.results[0].observations).toEqual([]);
  });
  it("rejects expired account and API keys without exposing raw error or token fields", async () => {
    const fetcher = queue({ accounts: [{ ...account, needsReconnection: true, accessToken: token }] });
    const result = await fetchZernio(range, { env, fetch: fetcher });
    expect(result.results[0].connection.status).toBe("expired"); expect(fetcher).toHaveBeenCalledTimes(1);
    const failed = await fetchZernio(range, { env, fetch: queue(Response.json({ error: token }, { status: 401 })) });
    expect(failed.warnings[0]).toContain("API key"); expect(JSON.stringify([result, failed])).not.toContain(token);
  });
  it("honors selection only among discovered permitted accounts", async () => {
    const fetcher = queue({ accounts: [account, { ...account, _id: "a2", platformUserId: "page2" }], hasAnalyticsAccess: true }, health, { posts: [] });
    const result = await fetchZernio(range, { env, fetch: fetcher, now }, { accountId: "zernio:facebook:a2" });
    expect(result.results).toHaveLength(1); expect(result.results[0].connection.accountId).toBe("page2");
    expect(String(fetcher.mock.calls[1][0])).toContain("accounts/a2/health"); expect(String(fetcher.mock.calls[2][0])).toContain("accountId=a2");
    const unknown = await fetchZernio(range, { env, fetch: queue({ accounts: [account] }) }, { accountId: "unknown" });
    expect(unknown.results).toEqual([]); expect(unknown.warnings).not.toEqual([]);
  });
  it("does not use aggregate cross-account values or pending zero defaults", async () => {
    const pending = { ...post, analytics: { views: 99999 }, platforms: [{ ...post.platforms[0], syncStatus: "pending", errorMessage: token }] };
    const result = await fetchZernio(range, { env, fetch: queue({ accounts: [account], hasAnalyticsAccess: true }, health, { posts: [pending] }) });
    expect(result.results[0].publications).toHaveLength(1); expect(result.results[0].observations).toEqual([]);
    expect(JSON.stringify(result)).not.toContain(token);
  });
  it("preserves successful page data when next page hits a plan error", async () => {
    const data = await fetchZernio(range, { env, fetch: queue({ accounts: [account], hasAnalyticsAccess: true }, health, { posts: Array(20).fill(post), pagination: { pages: 2 } }, Response.json({ error: token }, { status: 402 })), now });
    expect(data.results[0].observations.length).toBeGreaterThan(0); expect(data.results[0].connection.status).toBe("missing-permission"); expect(JSON.stringify(data)).not.toContain(token);
  });
  it("suppresses the same direct account while retaining other fallback platforms", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.hostname === "graph.facebook.com") return Response.json(url.pathname.endsWith("/posts") ? { data: [] } : { id: "page1" });
      if (url.pathname.endsWith("/health")) return Response.json(health);
      return Response.json({ accounts: [account], hasAnalyticsAccess: true });
    });
    const result = await fetchReportProviders(range, { env: { ...env, REPORT_META_GRAPH_VERSION: "v24.0", REPORT_FACEBOOK_PAGE_ID: "page1", REPORT_FACEBOOK_PAGE_TOKEN: "different-secret" }, fetch: fetcher }, { probe: true });
    expect(result.connections.filter((c) => c.platform === "facebook")).toHaveLength(1);
    expect(result.connections.find((c) => c.platform === "facebook")?.id).toBe("zernio:facebook:a1"); expect(result.connections).toHaveLength(4);
  });
  it("retains missing optional zero fields as unknown on YouTube", async () => {
    const ytAccount = { ...account, platform: "youtube", platformUserId: "UC1" };
    const ytPost = { ...post, platforms: [{ ...post.platforms[0], platform: "youtube", analytics: { views: 0, likes: 0, comments: 0, shares: 0, reach: 0, saves: 0, follows: 0, completionRate: 0, igReelsAvgWatchTime: 0 } }] };
    const result = await fetchZernio(range, { env: { ZERNIO_API_KEY: token }, fetch: queue({ accounts: [ytAccount], hasAnalyticsAccess: true }, health, { posts: [ytPost] }) });
    expect(result.results[0].observations[0].metrics).toEqual({ views: 0, likes: 0, comments: 0, shares: 0 });
  });
});
