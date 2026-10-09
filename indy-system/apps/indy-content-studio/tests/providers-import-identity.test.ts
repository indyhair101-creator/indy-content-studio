// @vitest-environment node
import { describe, expect, it } from "vitest";
import { mergeReportImport, parseReportImport, validateReportingState } from "../features/reports/report-schema";
import { emptyReportingState, type MetricObservation, type ReportPublication } from "../features/reports/report-types";
const publication: ReportPublication = { id: "p", platform: "instagram", accountId: "account", providerPostId: "media", contentId: "content", title: "Original", url: "https://instagram.com/p/media/", publishedAt: "2026-10-01T00:00:00Z", mediaKind: "video", durationSeconds: 15, thumbnailUrl: null };
const observation: MetricObservation = { id: "o", publicationId: "p", source: "api", sourceLabel: "Instagram API", fetchedAt: "2026-10-09T00:00:00Z", scope: "lifetime", period: null, traffic: "unknown", metrics: { views: 10, likes: 2 }, averageWatchWeight: null, retention: null };
const current = () => ({ ...emptyReportingState(), publications: [structuredClone(publication)], observations: [structuredClone(observation)] });
const incoming = (change: Partial<MetricObservation> = {}) => parseReportImport({ schemaVersion: 1, publications: [publication], observations: [{ ...observation, ...change }] });
describe("report import identity and provenance", () => {
  it("rejects a reused observation ID with changed values atomically", () => {
    const state = current(); const before = structuredClone(state);
    expect(() => mergeReportImport(state, incoming({ metrics: { views: 999 } }))).toThrow(/ID|ตัวเลข/);
    expect(state).toEqual(before);
  });
  it.each<Partial<MetricObservation>>([
    { fetchedAt: "2026-10-08T00:00:00Z" }, { sourceLabel: "Different source" }, { traffic: "organic" },
    { scope: "activity", period: { start: "2026-10-01", end: "2026-10-07" } },
    { timeZone: "America/Los_Angeles" }, { averageWatchWeight: 10 }, { retention: [{ positionSeconds: 0, ratio: 1 }] },
  ])("rejects a reused observation ID with changed source or measurement basis %j", (change) => {
    expect(() => mergeReportImport(current(), incoming(change))).toThrow();
  });
  it("keeps API provenance for an identical exported/imported record and is idempotent", () => {
    const reordered = incoming({ metrics: { likes: 2, views: 10 } });
    const merged = mergeReportImport(current(), reordered);
    expect(merged.observations).toHaveLength(1); expect(merged.observations[0].source).toBe("api");
    expect(mergeReportImport(merged, reordered)).toEqual(merged);
    const imported = mergeReportImport(emptyReportingState(), reordered);
    expect(imported.observations[0].source).toBe("import"); expect(mergeReportImport(imported, reordered)).toEqual(imported);
  });
  it("rejects one physical publication under different local IDs in a file and across merges", () => {
    const alias = { ...publication, id: "alias" };
    expect(() => parseReportImport({ schemaVersion: 1, publications: [publication, alias], observations: [] })).toThrow(/โพสต์/);
    const importedAlias = parseReportImport({ schemaVersion: 1, publications: [alias], observations: [{ ...observation, id: "other-observation", publicationId: "alias" }] });
    expect(() => mergeReportImport(current(), importedAlias)).toThrow(/โพสต์/);
    expect(() => validateReportingState({ ...current(), publications: [publication, alias] })).toThrow(/โพสต์/);
  });
  it("keeps different snapshots/sources on the same canonical publication without merging their measurements", () => {
    const imported = incoming({ id: "csv-snapshot", sourceLabel: "Platform CSV", metrics: { views: 20 } });
    const state = mergeReportImport(current(), imported);
    expect(state.publications).toHaveLength(1);
    expect(state.observations.map((o) => [o.publicationId, o.source, o.metrics.views])).toEqual([["p", "api", 10], ["p", "import", 20]]);
  });
  it("allows the same native post ID for a different account or platform", () => {
    expect(() => validateReportingState({ ...current(), publications: [publication, { ...publication, id: "other-account", accountId: "other" }, { ...publication, id: "other-platform", platform: "facebook" }] })).not.toThrow();
  });
});
