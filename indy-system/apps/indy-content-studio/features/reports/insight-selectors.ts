import type { ContentItem, DashboardState } from "../domain/types";
import { inReportRange, shiftDate } from "./report-dates";
import type { MetricKey, MetricObservation, ReportFilters, ReportPublication } from "./report-types";

export const INSIGHT_METRICS: MetricKey[] = ["views", "reach", "uniqueViewers", "likes", "comments", "shares", "saves", "followers", "clicks", "conversions", "watchSeconds", "averageWatchSeconds", "averageWatchPercent", "completionRate"];
export interface InsightPublication { publication: ReportPublication; observations: MetricObservation[]; metrics: Partial<Record<MetricKey, number | null>>; content: ContentItem; }
export interface InsightContent { content: ContentItem; publications: InsightPublication[]; }
export function safePostUrl(value: string | null): string | null {
  try { const url = new URL(value ?? ""); return ["https:", "http:"].includes(url.protocol) ? url.href : null; } catch { return null; }
}
const known = (value: number | null | undefined): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const overlaps = (a: MetricObservation, b: MetricObservation) => !a.period || !b.period || (a.period.start <= b.period.end && b.period.start <= a.period.end);

/** A lifetime snapshot is never an activity interval. Overlapping exports are not additive. */
export function selectObservations(observations: MetricObservation[], filters: ReportFilters): MetricObservation[] {
  const candidates = observations.filter(o => filters.dateBasis === "published" ? o.scope === "lifetime" : o.scope === "activity" && o.period && o.period.start >= filters.range.start && o.period.end <= filters.range.end)
    .filter(o => filters.traffic === "any" || o.traffic === filters.traffic)
    .sort((a, b) => Date.parse(b.fetchedAt) - Date.parse(a.fetchedAt) || a.id.localeCompare(b.id));
  // All-traffic and its organic/paid subsets must not be counted together.
  const traffic = filters.traffic === "any" ? (candidates.some(o => o.traffic === "all") ? "all" : candidates[0]?.traffic) : filters.traffic;
  return candidates.filter(o => o.traffic === traffic);
}
export function metricObservations(observations: MetricObservation[], metric: MetricKey): MetricObservation[] {
  const selected: MetricObservation[] = [];
  for (const observation of observations) {
    if (!known(observation.metrics[metric]) || selected.some(previous => overlaps(previous, observation))) continue;
    selected.push(observation);
  }
  return selected;
}
export function observationMetric(observations: MetricObservation[], metric: MetricKey): number | null {
  const selected = metricObservations(observations, metric);
  if (!selected.length) return null;
  if (selected.length === 1) return selected[0].metrics[metric]!;
  if (new Set(selected.map(o => `${o.source}:${o.sourceLabel}:${o.traffic}:${o.scope}:${o.timeZone ?? "unknown"}`)).size !== 1) return null;
  if (["reach", "uniqueViewers", "averageWatchPercent", "completionRate"].includes(metric)) return null;
  if (metric === "averageWatchSeconds") {
    if (new Set(selected.map(o => `${o.source}:${o.sourceLabel}`)).size !== 1 || selected.some(o => !known(o.averageWatchWeight) || o.averageWatchWeight === 0)) return null;
    return selected.reduce((sum, o) => sum + o.metrics.averageWatchSeconds! * o.averageWatchWeight!, 0) / selected.reduce((sum, o) => sum + o.averageWatchWeight!, 0);
  }
  return selected.reduce((sum, o) => sum + o.metrics[metric]!, 0);
}
export function selectInsightPublications(state: DashboardState, filters: ReportFilters): InsightPublication[] {
  const contents = new Map(state.contents.filter(c => !c.deletedAt).map(c => [c.id, c]));
  const identities = new Map<string, ReportPublication[]>();
  for (const publication of state.reporting?.publications ?? []) {
    const identity = JSON.stringify([publication.platform, publication.accountId, publication.providerPostId]);
    identities.set(identity, [...identities.get(identity) ?? [], publication]);
  }
  return [...identities.values()].flatMap(aliases => {
    const mappedIds = new Set(aliases.map(p => p.contentId).filter(id => id !== null));
    // A physical post cannot belong to two main content rows; leave conflicts for explicit rematching.
    if (mappedIds.size !== 1) return [];
    const publication = aliases.find(p => p.contentId !== null)!;
    const content = publication.contentId ? contents.get(publication.contentId) : undefined;
    if (!content || (filters.platform !== "all" && publication.platform !== filters.platform) || (filters.accountId && publication.accountId !== filters.accountId) || (filters.owner && content.owner !== filters.owner) || (filters.categoryId && content.categoryId !== filters.categoryId) || (filters.formatId && content.formatId !== filters.formatId) || (filters.objective && content.objective !== filters.objective) || (filters.videoOnly && publication.mediaKind !== "video")) return [];
    if ((filters.minDuration !== null || filters.maxDuration !== null) && (publication.durationSeconds === null || (filters.minDuration !== null && publication.durationSeconds < filters.minDuration) || (filters.maxDuration !== null && publication.durationSeconds > filters.maxDuration))) return [];
    if (filters.dateBasis === "published" && !inReportRange(publication.publishedAt, filters.range)) return [];
    const aliasIds = new Set(aliases.map(p => p.id));
    const observations = selectObservations((state.reporting?.observations ?? []).filter(o => aliasIds.has(o.publicationId)), filters);
    if (filters.dateBasis === "activity" && !observations.length) return [];
    return [{ publication, content, observations, metrics: Object.fromEntries(INSIGHT_METRICS.map(metric => [metric, observationMetric(observations, metric)])) }];
  });
}
export function groupInsightContents(rows: InsightPublication[]): InsightContent[] {
  const groups = new Map<string, InsightContent>();
  rows.forEach(row => { const group = groups.get(row.content.id) ?? { content: row.content, publications: [] }; group.publications.push(row); groups.set(row.content.id, group); });
  return [...groups.values()];
}
export function aggregateInsightMetric(rows: InsightPublication[], metric: MetricKey): number | null {
  if (!rows.length || rows.some(row => !known(row.metrics[metric]))) return null;
  if (rows.length === 1) return rows[0].metrics[metric]!;
  if (["reach", "uniqueViewers", "averageWatchPercent", "completionRate"].includes(metric)) return null;
  const signatures = new Set(rows.flatMap(row => metricObservations(row.observations, metric).map(o => `${row.publication.platform}:${o.source}:${o.sourceLabel}:${o.traffic}:${o.scope}:${o.timeZone ?? "unknown"}`)));
  if (signatures.size !== 1) return null;
  if (metric === "averageWatchSeconds") {
    const observations = rows.flatMap(row => metricObservations(row.observations, metric));
    if (observations.some(o => !known(o.averageWatchWeight) || o.averageWatchWeight === 0)) return null;
    return observations.reduce((sum, o) => sum + o.metrics.averageWatchSeconds! * o.averageWatchWeight!, 0) / observations.reduce((sum, o) => sum + o.averageWatchWeight!, 0);
  }
  return rows.reduce((sum, row) => sum + row.metrics[metric]!, 0);
}
/** Comparison requires the same format, platform, traffic, observation basis and actual period. */
export function comparisonCompatible(rows: InsightPublication[]): boolean {
  if (rows.length < 2 || rows.length > 4 || rows.some(row => !row.observations.length)) return false;
  return new Set(rows.map(row => `${row.publication.platform}:${row.content.formatId}:${row.publication.publishedAt}:${row.observations.map(o => `${o.traffic}:${o.scope}:${o.period?.start}:${o.period?.end}:${o.scope === "lifetime" ? o.fetchedAt : ""}:${o.source}:${o.sourceLabel}:${o.timeZone ?? "unknown"}`).sort().join("|")}`)).size === 1;
}
export function completeMetricCoverage(rows: InsightPublication[], metric: MetricKey, filters: ReportFilters): boolean {
  return filters.dateBasis === "activity" && rows.length > 0 && rows.every(row => {
    const periods = metricObservations(row.observations, metric).map(o => o.period).filter(p => p !== null).sort((a, b) => a.start.localeCompare(b.start));
    return periods.length > 0 && periods[0].start === filters.range.start && periods.at(-1)!.end === filters.range.end && periods.every((period, index) => index === 0 || period.start === shiftDate(periods[index - 1].end, 1));
  });
}
/** Exact-age lifetime snapshots only; never extrapolate a later lifetime total backwards. */
export function exactAgeSnapshot(publication: ReportPublication, observations: MetricObservation[], hours: 24 | 168 | 720, traffic: ReportFilters["traffic"]): MetricObservation | null {
  const target = Date.parse(publication.publishedAt) + hours * 3_600_000;
  const candidates = observations.filter(o => o.publicationId === publication.id && o.scope === "lifetime" && Date.parse(o.fetchedAt) === target && (traffic === "any" || o.traffic === traffic));
  return candidates.find(o => o.traffic === "all") ?? candidates[0] ?? null;
}
