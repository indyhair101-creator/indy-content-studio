// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { fetchProvider } from "../features/reports/server/providers";
const env = { REPORT_META_GRAPH_VERSION: "v24.0", REPORT_FACEBOOK_PAGE_ID: "page1", REPORT_FACEBOOK_PAGE_TOKEN: "private", REPORT_INSTAGRAM_ACCOUNT_ID: "ig1", REPORT_INSTAGRAM_ACCESS_TOKEN: "private" };
const range = { start: "2026-10-01", end: "2026-10-10" };
describe("Meta real insights", () => {
  it("uses a page-scoped token returned for an authorized system token without leaking it", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      if (new URL(String(input)).pathname.endsWith("/page1")) return Response.json({ id: "page1", access_token: "PAGE_SCOPED_SECRET" });
      return (init?.headers as Record<string, string>).Authorization === "Bearer PAGE_SCOPED_SECRET" ? Response.json({ data: [{ id: "page1_post", created_time: "2026-10-01", permalink_url: "https://facebook.com/posts/post" }] }) : Response.json({ error: { code: 190 } }, { status: 400 });
    });
    const result = await fetchProvider("facebook", range, { env, fetch: fetcher }, true);
    expect(result.connection.status).toBe("connected");
    expect(JSON.stringify(result)).not.toContain("PAGE_SCOPED_SECRET");
  });
  it("reads Facebook views and video watch time, keeping organic separate from totals", async () => {
    const fetcher = vi.fn<typeof fetch>(async input => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/page1")) return Response.json({ id: "page1", name: "INDY" });
      if (url.pathname.endsWith("/posts")) return Response.json({ data: [{ id: "page1_post", message: "Video", created_time: "2026-10-01", permalink_url: "https://facebook.com/posts/post", attachments: { data: [{ media_type: "video" }] }, likes: { summary: { total_count: 15 } }, comments: { summary: { total_count: 3 } } }] });
      if (url.pathname.endsWith("/insights")) {
        const values: Record<string, number> = { post_media_view: 1200, post_total_media_view_unique: 900, post_video_avg_time_watched: 12500, post_video_view_time: 480000, post_video_views_organic: 600 };
        return Response.json({ data: url.searchParams.get("metric")!.split(",").filter(key => key in values).map(name => ({ name, period: "lifetime", values: [{ value: values[name] }] })) });
      }
      return Response.json({ error: { code: 100 } }, { status: 400 });
    });
    const data = await fetchProvider("facebook", range, { env, fetch: fetcher });
    expect(data.publications[0].mediaKind).toBe("video");
    expect(data.observations.find(o => o.traffic !== "organic")?.metrics).toMatchObject({ views: 1200, uniqueViewers: 900, likes: 15, comments: 3, averageWatchSeconds: 12.5, watchSeconds: 480 });
    expect(data.observations.find(o => o.traffic === "organic")?.metrics).toEqual({ views: 600 });
    expect(JSON.stringify(data)).not.toContain("private");
  });
  it("retains available metrics when one optional Meta metric is unsupported", async () => {
    const fetcher = vi.fn<typeof fetch>(async input => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/ig1")) return Response.json({ id: "ig1", username: "INDY" });
      if (url.pathname.endsWith("/media")) return Response.json({ data: [{ id: "m1", caption: "Reel", timestamp: "2026-10-01", permalink: "https://instagram.com/reel/m1/", media_type: "VIDEO", media_product_type: "REELS", like_count: 5 }] });
      const metric = url.searchParams.get("metric") ?? "";
      if (metric.includes(",") || metric === "reach") return Response.json({ error: { code: 100, message: "unsupported" } }, { status: 400 });
      const values: Record<string, number> = { views: 200, saved: 4, shares: 3, ig_reels_avg_watch_time: 8500, ig_reels_video_view_total_time: 120000 };
      return Response.json({ data: metric in values ? [{ name: metric, values: [{ value: values[metric] }] }] : [] });
    });
    const data = await fetchProvider("instagram", range, { env, fetch: fetcher });
    expect(data.observations[0].metrics).toMatchObject({ views: 200, likes: 5, saves: 4, shares: 3, averageWatchSeconds: 8.5, watchSeconds: 120 });
    expect(data.observations[0].metrics.reach).toBeUndefined();
    expect(data.warnings.length).toBeGreaterThan(0);
  });
});
