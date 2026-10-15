import { describe, expect, it } from "vitest";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import type { ContentItem } from "../features/domain/types";
import { defaultReportFilters } from "../features/reports/report-dates";
import { aggregateInsightMetric, comparisonCompatible, completeMetricCoverage, exactAgeSnapshot, groupInsightContents, observationMetric, safePostUrl, selectInsightPublications, selectObservations } from "../features/reports/insight-selectors";
import { emptyReportingState, type MetricObservation, type ReportPublication } from "../features/reports/report-types";

const filters = { ...defaultReportFilters("2026-10-09"), range: { start: "2026-10-01", end: "2026-10-09" } };
function observation(patch: Partial<MetricObservation> = {}): MetricObservation {
  return { id: "o", publicationId: "p", fetchedAt: "2026-10-09T00:00:00Z", source: "import", sourceLabel: "YouTube Analytics", scope: "activity", period: { start: "2026-10-01", end: "2026-10-09" }, traffic: "all", metrics: { views: 100, reach: 80 }, averageWatchWeight: null, retention: null, ...patch };
}
function publication(patch: Partial<ReportPublication> = {}): ReportPublication {
  return { id: "p", contentId: "c", platform: "youtube", accountId: "channel", providerPostId: patch.id ?? "real", url: "https://youtube.com/watch?v=real", title: "Video", publishedAt: "2026-10-01T00:00:00Z", mediaKind: "video", durationSeconds: 60, thumbnailUrl: null, ...patch };
}
function stateWith(observations: MetricObservation[], publications = [publication()]) {
  const state = createEmptyDashboardState();
  state.contents = [{ id: "c", title: "Test", formatId: "video", categoryId: "education", owner: "owner", objective: "awareness", deletedAt: null } as ContentItem];
  state.reporting = { ...emptyReportingState(), observations, publications };
  return state;
}
describe("insight observations", () => {
  it("orders snapshot instants correctly when timestamps have different offsets", () => {
    const samples = [observation({ id: "older", scope: "lifetime", period: null, fetchedAt: "2026-10-09T09:00:00+07:00", metrics: { views: 10 } }), observation({ id: "newer", scope: "lifetime", period: null, fetchedAt: "2026-10-09T03:00:00Z", metrics: { views: 20 } })];
    expect(observationMetric(selectObservations(samples, filters), "views")).toBe(20);
  });
  it("keeps missing unknown and genuine zero distinct", () => {
    expect(observationMetric([observation({ metrics: { views: 0 } })], "views")).toBe(0);
    expect(observationMetric([observation({ metrics: {} })], "views")).toBeNull();
    expect(observationMetric([observation({ metrics: { views: null } })], "views")).toBeNull();
  });
  it("uses newest overlap once, never daily plus aggregate or lifetime", () => {
    const selected = selectObservations([observation({ id: "older", fetchedAt: "2026-10-08", metrics: { views: 90 } }), observation(), observation({ id: "daily", fetchedAt: "2026-10-07", period: { start: "2026-10-01", end: "2026-10-01" }, metrics: { views: 10 } }), observation({ id: "lifetime", scope: "lifetime", period: null, metrics: { views: 500 } })], { ...filters, dateBasis: "activity" });
    expect(observationMetric(selected, "views")).toBe(100);
  });
  it("does not include activity partially outside requested dates", () => {
    expect(selectObservations([observation({ period: { start: "2026-09-30", end: "2026-10-09" } })], { ...filters, dateBasis: "activity" })).toEqual([]);
  });
  it("sums disjoint activity counts but never unique audiences", () => {
    const samples = [observation({ period: { start: "2026-10-01", end: "2026-10-01" } }), observation({ id: "two", period: { start: "2026-10-02", end: "2026-10-02" } })];
    expect(observationMetric(samples, "views")).toBe(200);
    expect(observationMetric(samples, "reach")).toBeNull();
  });
  it("does not classify unknown as organic or add all to its subsets", () => {
    const samples = [observation({ traffic: "unknown" }), observation({ id: "organic", traffic: "organic", metrics: { views: 20 } }), observation({ id: "all", metrics: { views: 100 } })];
    expect(observationMetric(selectObservations(samples, { ...filters, dateBasis: "activity", traffic: "organic" }), "views")).toBe(20);
    expect(observationMetric(selectObservations(samples, { ...filters, dateBasis: "activity" }), "views")).toBe(100);
    expect(selectObservations([samples[0]], { ...filters, dateBasis: "activity", traffic: "organic" })).toEqual([]);
  });
  it("uses lifetime latest metric for publication cohort only", () => {
    const state = stateWith([observation(), observation({ id: "life", scope: "lifetime", period: null, metrics: { views: 500 } })]);
    expect(selectInsightPublications(state, filters)[0].metrics.views).toBe(500);
    expect(selectInsightPublications(state, { ...filters, dateBasis: "activity" })[0].metrics.views).toBe(100);
  });
  it("includes old content for activity and respects duration", () => {
    const state = stateWith([observation()], [publication({ publishedAt: "2025-01-01" }), publication({ id: "unmatched", contentId: null })]);
    expect(selectInsightPublications(state, filters)).toHaveLength(1);
    expect(selectInsightPublications(state, { ...filters, dateBasis: "activity" })).toHaveLength(1);
    expect(selectInsightPublications(state, { ...filters, dateBasis: "activity", minDuration: 90 })).toHaveLength(0);
  });
  it("does not replace unsegmented totals with an organic-only subset in the default view", () => {
    const selected = selectObservations([observation({ scope: "lifetime", period: null, traffic: "organic", metrics: { views: 40 } }), observation({ id: "total", scope: "lifetime", period: null, traffic: "unknown", metrics: { views: 100, likes: 2 } })], filters);
    expect(observationMetric(selected, "views")).toBe(100);
    expect(observationMetric(selected, "likes")).toBe(2);
  });
  it("shows real unlinked posts without creating calendar tasks or guessing ownership", () => {
    const state = stateWith([observation({ scope: "lifetime", period: null, metrics: { views: 1500 } })], [publication({ contentId: null })]);
    const rows = selectInsightPublications(state, filters);
    expect(rows).toHaveLength(1);
    expect(rows[0].metrics.views).toBe(1500);
    expect(rows[0].content.title).toBe("Video");
    expect(rows[0].content.owner).toBe("");
    expect(state.contents).toHaveLength(1);
    expect(selectInsightPublications(state, { ...filters, owner: "owner" })).toEqual([]);
    expect(selectInsightPublications(state, { ...filters, objective: "awareness" })).toEqual([]);
  });
  it("groups two platform posts into one content and does not sum reach or mixed-platform views", () => {
    const state = stateWith([observation(), observation({ id: "o2", publicationId: "p2" })], [publication(), publication({ id: "p2", platform: "facebook" })]);
    const rows = selectInsightPublications(state, { ...filters, dateBasis: "activity" });
    expect(groupInsightContents(rows)).toHaveLength(1);
    expect(aggregateInsightMetric(rows, "reach")).toBeNull();
    expect(aggregateInsightMetric(rows, "views")).toBeNull();
    expect(comparisonCompatible(rows)).toBe(false);
  });
  it("adds same-source Zernio counts with different upstream freshness without mixing definitions", () => {
    const sourceLabel = (time: string) => `Zernio / tiktok — ยอดสะสม; ต้นทางอัปเดต ${time}; ช่องทางยอดไม่ยืนยัน`;
    const state = stateWith([observation({ sourceLabel: sourceLabel("2026-10-09T01:00:00.000Z"), metrics: { views: 100 } }), observation({ id: "o2", publicationId: "p2", sourceLabel: sourceLabel("2026-10-09T02:00:00.000Z"), metrics: { views: 200 } })], [publication({ platform: "tiktok" }), publication({ id: "p2", platform: "tiktok" })]);
    const rows = selectInsightPublications(state, { ...filters, dateBasis: "activity" });
    rows.forEach(row => row.observations.forEach(item => { item.source = "api"; }));
    expect(aggregateInsightMetric(rows, "views")).toBe(300);
    expect(rows[0].observations[0].sourceLabel).toContain("01:00:00");
    rows[1].observations[0].sourceLabel += "; different definition";
    expect(aggregateInsightMetric(rows, "views")).toBeNull();
  });
  it("weights averages using documented weights only and retains separate completion", () => {
    const state = stateWith([observation({ metrics: { averageWatchSeconds: 10, averageWatchPercent: 20, completionRate: 5 }, averageWatchWeight: 10 }), observation({ id: "o2", publicationId: "p2", metrics: { averageWatchSeconds: 30, averageWatchPercent: 50, completionRate: 10 }, averageWatchWeight: 30 })], [publication(), publication({ id: "p2" })]);
    const rows = selectInsightPublications(state, { ...filters, dateBasis: "activity" });
    expect(aggregateInsightMetric(rows, "averageWatchSeconds")).toBe(25);
    expect(aggregateInsightMetric(rows, "averageWatchPercent")).toBeNull();
    expect(rows[0].metrics.completionRate).toBe(5);
    state.reporting!.observations[1].averageWatchWeight = null;
    expect(aggregateInsightMetric(selectInsightPublications(state, { ...filters, dateBasis: "activity" }), "averageWatchSeconds")).toBeNull();
  });
  it("does not substitute view count for an unknown playback denominator", () => {
    const samples = [observation({ metrics: { views: 100, averageWatchSeconds: 10 }, period: { start: "2026-10-01", end: "2026-10-01" } }), observation({ id: "two", metrics: { views: 500, averageWatchSeconds: 30 }, period: { start: "2026-10-02", end: "2026-10-02" } })];
    expect(observationMetric(samples, "averageWatchSeconds")).toBeNull();
  });
  it("rejects mixed source definitions even with weights", () => {
    const samples = [observation({ metrics: { averageWatchSeconds: 10 }, averageWatchWeight: 10, period: { start: "2026-10-01", end: "2026-10-01" } }), observation({ sourceLabel: "different definition", metrics: { averageWatchSeconds: 20 }, averageWatchWeight: 20, period: { start: "2026-10-02", end: "2026-10-02" } })];
    expect(observationMetric(samples, "averageWatchSeconds")).toBeNull();
  });
  it("requires equal lifetime age for ranking", () => {
    const state = stateWith([observation({ scope: "lifetime", period: null }), observation({ id: "o2", publicationId: "p2", scope: "lifetime", period: null, fetchedAt: "2026-10-08" })], [publication(), publication({ id: "p2" })]);
    expect(comparisonCompatible(selectInsightPublications(state, filters))).toBe(false);
  });
  it("allows only HTTP(S) post links", () => {
    expect(safePostUrl("javascript:alert(1)")).toBeNull();
    expect(safePostUrl("data:text/html,test")).toBeNull();
    expect(safePostUrl("https://example.com/post")).toBe("https://example.com/post");
  });
  it("does not compare incomplete period coverage or combine different source time zones", () => {
    const partial = stateWith([observation({ period: { start: "2026-10-02", end: "2026-10-09" } })]);
    const active = { ...filters, dateBasis: "activity" as const };
    expect(completeMetricCoverage(selectInsightPublications(partial, active), "views", active)).toBe(false);
    const complete = stateWith([observation()]);
    expect(completeMetricCoverage(selectInsightPublications(complete, active), "views", active)).toBe(true);
    const mixed = stateWith([observation({ timeZone: "America/Los_Angeles" }), observation({ id: "o2", publicationId: "p2", timeZone: "Asia/Bangkok" })], [publication(), publication({ id: "p2" })]);
    expect(aggregateInsightMetric(selectInsightPublications(mixed, active), "views")).toBeNull();
  });
  it("uses actual exact-age lifetime snapshots without extrapolation or substituting activity", () => {
    const samples = [observation({ id: "day", fetchedAt: "2026-10-02T00:00:00Z", scope: "lifetime", period: null }), observation({ id: "late", fetchedAt: "2026-10-08T01:00:00Z", scope: "lifetime", period: null }), observation({ id: "activity", fetchedAt: "2026-10-08T00:00:00Z" })];
    expect(exactAgeSnapshot(publication(), samples, 24, "any")?.id).toBe("day");
    expect(exactAgeSnapshot(publication(), samples, 168, "any")).toBeNull();
    expect(exactAgeSnapshot(publication(), samples, 24, "organic")).toBeNull();
  });
  it("counts one real platform post once even when imported under multiple IDs", () => {
    const state = stateWith([observation(), observation({ id: "duplicate", publicationId: "p2", fetchedAt: "2026-10-10", metrics: { views: 120 } })], [publication(), publication({ id: "p2", providerPostId: "real" })]);
    const rows = selectInsightPublications(state, { ...filters, dateBasis: "activity" });
    expect(rows).toHaveLength(1);
    expect(rows[0].metrics.views).toBe(120);
  });
});
