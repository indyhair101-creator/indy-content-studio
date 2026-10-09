import { describe, expect, it } from "vitest";
import { selectVideoRankings } from "../features/reports/video-ranking-selectors";
import type { InsightPublication } from "../features/reports/insight-selectors";
import type { ContentItem } from "../features/domain/types";
function row(id: string, value: number | null): InsightPublication {
  return { content: { id, title: id, formatId: "video" } as ContentItem,
    publication: { id, contentId: id, platform: "youtube", accountId: "a", providerPostId: id, url: "", title: id, publishedAt: "2026-10-01T00:00:00Z", mediaKind: "video", durationSeconds: 60, thumbnailUrl: null },
    observations: [{ id, publicationId: id, fetchedAt: "2026-10-02T00:00:00Z", source: "api", sourceLabel: "YouTube Analytics", timeZone: "America/Los_Angeles", scope: "lifetime", period: null, traffic: "organic", metrics: { views: value, reach: value, averageWatchSeconds: value, shares: value, saves: value, followers: value }, averageWatchWeight: null, retention: null }],
    metrics: { views: value, reach: value, averageWatchSeconds: value, shares: value, saves: value, followers: value } };
}
describe("video per-metric compatible ranking", () => {
  it("ranks three compatible posts with ties, real zeros and below-average flags", () => {
    const result = selectVideoRankings([row("zero", 0), row("top", 30), row("tied", 30)], "views", true);
    expect(result.cohorts).toHaveLength(1);
    expect(result.cohorts[0].average).toBe(20);
    expect(result.cohorts[0].entries.map(e => [e.value, e.rank, e.belowAverage])).toEqual([[30, 1, false], [30, 1, false], [0, 3, true]]);
  });
  it("keeps insufficient samples unranked and excludes missing values rather than zero filling", () => {
    const result = selectVideoRankings([row("one", 10), row("two", 20), row("unknown", null)], "views");
    expect(result.unavailable).toBe(1);
    expect(result.cohorts[0].sample).toBe(2);
    expect(result.cohorts[0].average).toBeNull();
    expect(result.cohorts[0].entries).toEqual([]);
  });
  it.each(["platform", "account", "source", "traffic", "timezone", "format", "age", "duration"])("separates incompatible %s into different cohorts", field => {
    const other = row("other", 1000);
    if (field === "platform") other.publication.platform = "facebook";
    if (field === "account") other.publication.accountId = "other";
    if (field === "source") other.observations[0].sourceLabel = "Other source";
    if (field === "traffic") other.observations[0].traffic = "paid";
    if (field === "timezone") other.observations[0].timeZone = "Asia/Bangkok";
    if (field === "format") other.content.formatId = "short";
    if (field === "age") other.observations[0].fetchedAt = "2026-10-09T00:00:00Z";
    if (field === "duration") other.publication.durationSeconds = 120;
    const result = selectVideoRankings([row("a", 10), row("b", 20), row("c", 30), other], "views");
    expect(result.cohorts).toHaveLength(2);
    expect(result.cohorts.find(c => c.sample === 3)!.average).toBe(20);
    expect(result.cohorts.find(c => c.sample === 1)!.entries).toEqual([]);
  });
  it("does not label unknown or all traffic organic", () => {
    const unknown = row("unknown", 100); unknown.observations[0].traffic = "unknown";
    const all = row("all", 200); all.observations[0].traffic = "all";
    const result = selectVideoRankings([unknown, all], "views", true);
    expect(result.cohorts).toEqual([]);
    expect(result.unavailable).toBe(2);
  });
  it("does not rank unknown traffic even when three posts share the unknown label", () => {
    const rows = [row("a", 10), row("b", 20), row("c", 30)];
    rows.forEach(row => { row.observations[0].traffic = "unknown"; });
    expect(selectVideoRankings(rows, "views")).toEqual({ cohorts: [], unavailable: 3 });
  });
  it("does not rank activity metrics when the source timezone is missing", () => {
    const rows = [row("a", 10), row("b", 20), row("c", 30)];
    rows.forEach(row => { row.observations[0].scope = "activity"; row.observations[0].period = { start: "2026-10-01", end: "2026-10-09" }; delete row.observations[0].timeZone; });
    expect(selectVideoRankings(rows, "views")).toEqual({ cohorts: [], unavailable: 3 });
  });
  it("compares only identical actual activity coverage and never sums unique reach", () => {
    const rows = [row("a", 10), row("b", 20), row("c", 30), row("partial", 1000)];
    rows.forEach(r => { r.observations[0].scope = "activity"; r.observations[0].period = { start: "2026-10-01", end: "2026-10-09" }; });
    rows[3].observations[0].period = { start: "2026-10-05", end: "2026-10-09" };
    const result = selectVideoRankings(rows, "reach");
    expect(result.cohorts).toHaveLength(2);
    expect(result.cohorts.find(c => c.sample === 3)!.entries.map(e => e.value)).toEqual([30, 20, 10]);
  });
});
