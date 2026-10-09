// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { fetchProvider } from "../features/reports/server/providers";
import { reportConnections, reportSync } from "../features/reports/server/report-http";
import { createAdminSessionToken } from "../features/auth/server/admin-session";
import { validateReportingState } from "../features/reports/report-schema";

const range = { start: "2026-10-01", end: "2026-10-07" };
const now = () => new Date("2026-10-09T00:00:00Z");
const secret = "test-provider-auth-secret-at-least-32-characters";
const token = "PRIVATE_TOKEN_MUST_NEVER_BE_RETURNED";
const response = (body: unknown, status = 200) => Response.json(body, { status });
const queue = (...bodies: Array<unknown | Response>) => vi.fn<typeof fetch>().mockImplementation(async () => { const body = bodies.shift(); return body instanceof Response ? body : response(body); });
const fb = { REPORT_META_GRAPH_VERSION: "v24.0", REPORT_FACEBOOK_PAGE_ID: "page1", REPORT_FACEBOOK_PAGE_TOKEN: token };
const yt = { REPORT_YOUTUBE_CHANNEL_ID: "UCtest", REPORT_YOUTUBE_ACCESS_TOKEN: token };
const tt = { REPORT_TIKTOK_OPEN_ID: "tt1", REPORT_TIKTOK_ACCESS_TOKEN: token };
const fbRow = { id: "page1_post1", created_time: "2026-10-01T00:00:00Z", message: "First", permalink_url: "https://facebook.com/posts/1", comments: { summary: { total_count: 0 } }, shares: { count: 5 } };
async function authenticated(body?: unknown, origin?: string) { const cookie = await createAdminSessionToken(secret); return new Request("https://indy.test/api/reports/sync", { method: body ? "POST" : "GET", headers: { cookie: `indy_admin_session=${cookie}`, ...(origin ? { origin } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }); }

describe("report provider boundaries", () => {
  it("never calls providers without authentication", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const request = new Request("https://indy.test/api/reports/sync");
    expect((await reportConnections(request, { fetch: fetcher })).status).toBe(401);
    expect((await reportSync(request, { fetch: fetcher })).status).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects invalid dates, oversized range and cross origin before fetch", async () => {
    const fetcher = vi.fn<typeof fetch>(); const deps = { env: { AUTH_SECRET: secret }, fetch: fetcher };
    expect((await reportSync(await authenticated({ range: { start: "2026-02-30", end: "2026-03-01" } }), deps)).status).toBe(400);
    expect((await reportSync(await authenticated({ range: { start: "2020-01-01", end: "2026-03-01" } }), deps)).status).toBe(400);
    expect((await reportSync(await authenticated({ range }, "https://evil.test"), deps)).status).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("reports missing config honestly with no requests", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const result = await fetchProvider("facebook", range, { env: {}, fetch: fetcher, now });
    expect(result.connection.status).toBe("disconnected"); expect(result.connection.availableMetrics).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("maps known zero, never invents reach or organic and never follows credentialed next URL", async () => {
    const fetcher = queue({ id: "page1", name: "Page" }, { data: [fbRow], paging: { cursors: { after: "cursor1" }, next: `https://evil.test/?access_token=${token}` } }, { data: [] });
    const result = await fetchProvider("facebook", range, { env: fb, fetch: fetcher, now });
    expect(result.observations[0]).toMatchObject({ scope: "lifetime", period: null, traffic: "unknown", metrics: { comments: 0, shares: 5 }, averageWatchWeight: null });
    expect(result.observations[0].metrics.reach).toBeUndefined();
    expect(fetcher.mock.calls.every(([url]) => new URL(String(url)).hostname === "graph.facebook.com")).toBe(true);
    expect(String(fetcher.mock.calls[2][0])).toContain("after=cursor1");
    expect(JSON.stringify(result)).not.toContain(token);
    expect(() => validateReportingState({ connections: [result.connection], publications: result.publications, observations: result.observations, savedReports: [] })).not.toThrow();
  });
  it("retains first-page data on expiration, sanitizes errors", async () => {
    const fetcher = queue({ id: "page1" }, { data: [fbRow], paging: { cursors: { after: "next" }, next: "yes" } }, response({ error: { code: 190, message: token } }, 400));
    const result = await fetchProvider("facebook", range, { env: fb, fetch: fetcher, now });
    expect(result.publications).toHaveLength(1); expect(result.observations).toHaveLength(1);
    expect(result.connection.status).toBe("expired"); expect(JSON.stringify(result)).not.toContain(token);
  });
  it("preserves Instagram basics when insights permissions fail", async () => {
    const fetcher = queue({ id: "ig1", username: "IG" }, { data: [{ id: "m1", permalink: "https://instagram.com/p/m1/", timestamp: "2026-10-01T00:00:00Z", media_type: "VIDEO", like_count: 7 }] }, response({ error: { code: 10, message: token } }, 403));
    const result = await fetchProvider("instagram", range, { env: { REPORT_META_GRAPH_VERSION: "v24.0", REPORT_INSTAGRAM_ACCOUNT_ID: "ig1", REPORT_INSTAGRAM_ACCESS_TOKEN: token }, fetch: fetcher, now });
    expect(result.connection.status).toBe("missing-permission"); expect(result.observations[0].metrics).toEqual({ likes: 7 });
    expect(result.observations[0].metrics.comments).toBeUndefined();
  });
  it("maps TikTok Display counters to lifetime and stops after three pages", async () => {
    const page = { data: { videos: [{ id: "v1", share_url: "https://tiktok.com/@test/video/v1", create_time: 1790812800, view_count: 100, like_count: 2, duration: 18 }], has_more: true, cursor: 1 }, error: { code: "ok" } };
    const fetcher = queue({ data: { user: { open_id: "tt1" } } }, page, { ...page, data: { ...page.data, cursor: 2 } }, { ...page, data: { ...page.data, cursor: 3 } });
    const result = await fetchProvider("tiktok", range, { env: tt, fetch: fetcher, now });
    expect(result.truncated).toBe(true); expect(fetcher).toHaveBeenCalledTimes(4);
    expect(result.observations[0]).toMatchObject({ scope: "lifetime", metrics: { views: 100, likes: 2 }, retention: null });
    expect(result.observations[0].metrics.averageWatchSeconds).toBeUndefined();
  });
  it("checks TikTok account identity before reading videos", async () => {
    const fetcher = queue({ data: { user: { open_id: "other" } } });
    const result = await fetchProvider("tiktok", range, { env: tt, fetch: fetcher, now });
    expect(result.connection.status).toBe("missing-permission"); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("maps YouTube activity separately with exact source timezone and no guessed average weights", async () => {
    const fetcher = queue({ items: [{ id: "UCtest", contentDetails: { relatedPlaylists: { uploads: "PL1" } } }] }, { items: [{ contentDetails: { videoId: "v1" } }] }, { items: [{ id: "v1", snippet: { publishedAt: "2026-01-01T00:00:00Z" }, contentDetails: { duration: "PT1M30S" }, statistics: { viewCount: "200" } }] }, { columnHeaders: ["video", "views", "estimatedMinutesWatched", "averageViewDuration", "averageViewPercentage"].map((name) => ({ name })), rows: [["v1", 10, 3, 18, 20]] });
    const result = await fetchProvider("youtube", range, { env: yt, fetch: fetcher, now });
    expect(result.publications[0].durationSeconds).toBe(90);
    expect(result.observations).toHaveLength(2);
    expect(result.observations[0]).toMatchObject({ scope: "lifetime", metrics: { views: 200 } });
    expect(result.observations[1]).toMatchObject({ scope: "activity", timeZone: "America/Los_Angeles", period: range, metrics: { views: 10, watchSeconds: 180, averageWatchSeconds: 18, averageWatchPercent: 20 }, averageWatchWeight: null });
    expect(result.observations[1].metrics.completionRate).toBeUndefined();
  });
  it("sync returns successful data alongside an unconfigured provider without revealing secrets", async () => {
    const fetcher = queue({ id: "page1" }, { data: [fbRow] });
    const res = await reportSync(await authenticated({ range }), { env: { ...fb, AUTH_SECRET: secret }, fetch: fetcher, now });
    const data = await res.json();
    expect(data.connections).toHaveLength(4); expect(data.publications).toHaveLength(1);
    expect(data.connections.filter((c: { status: string }) => c.status === "disconnected")).toHaveLength(3);
    expect(JSON.stringify(data)).not.toContain(token); expect(res.headers.get("cache-control")).toContain("no-store");
  });
});
