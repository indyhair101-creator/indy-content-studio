import { aggregateInsightMetric, metricObservations, type InsightPublication } from "./insight-selectors";
import { bangkokDate } from "./report-dates";
import { REPORT_PLATFORM_LABELS, type MetricKey } from "./report-types";

export interface VideoRankEntry { row: InsightPublication; value: number; rank: number; belowAverage: boolean; }
export interface VideoRankCohort { key: string; label: string; sample: number; average: number | null; entries: VideoRankEntry[]; }
export interface VideoRanking { cohorts: VideoRankCohort[]; unavailable: number; }
export function selectVideoRankings(rows: InsightPublication[], metric: MetricKey, organicOnly = false): VideoRanking {
  const groups = new Map<string, { label: string; rows: InsightPublication[] }>();
  let unavailable = 0;
  for (const row of rows) {
    const value = row.metrics[metric];
    const observations = metricObservations(row.observations, metric);
    const duration = row.publication.durationSeconds;
    if (row.publication.mediaKind !== "video" || value === null || value === undefined || !Number.isFinite(value) || value < 0 || !observations.length || duration === null || observations.some(o => o.traffic === "unknown" || o.scope === "activity" && !o.timeZone) || (organicOnly && observations.some(o => o.traffic !== "organic"))) { unavailable++; continue; }
    const signatures = new Set(observations.map(o => JSON.stringify([o.source, o.sourceLabel, o.timeZone ?? "unknown", o.traffic, o.scope])));
    if (signatures.size !== 1) { unavailable++; continue; }
    const first = observations[0];
    const ageHours = Math.floor((Date.parse(first.fetchedAt) - Date.parse(row.publication.publishedAt)) / 3_600_000);
    if (!Number.isFinite(ageHours) || ageHours < 0) { unavailable++; continue; }
    const periods = observations.map(o => o.period ? `${o.period.start}–${o.period.end}` : "lifetime").sort();
    const age = first.scope === "lifetime" ? `อายุ ${ageHours}–<${ageHours + 1} ชั่วโมง` : `เผยแพร่วันเดียวกัน ${bangkokDate(row.publication.publishedAt)}`;
    const key = JSON.stringify([row.publication.platform, row.publication.accountId, row.content.formatId, duration, [...signatures][0], periods, age]);
    const label = `${REPORT_PLATFORM_LABELS[row.publication.platform]} · บัญชี ${row.publication.accountId} · รูปแบบ ${row.content.formatId} · ${duration} วินาที · ${first.traffic} · ${first.sourceLabel} · ${first.timeZone ?? "เขตเวลาไม่ระบุ"} · ${first.scope === "lifetime" ? "สะสม" : periods.join(", ")} · ${age}`;
    const group = groups.get(key) ?? { label, rows: [] };
    group.rows.push(row); groups.set(key, group);
  }
  const cohorts = [...groups].map(([key, group]): VideoRankCohort => {
    const sample = group.rows.length;
    if (sample < 3) return { key, label: group.label, sample, average: null, entries: [] };
    const average = ["averageWatchSeconds", "averageWatchPercent", "completionRate"].includes(metric) ? aggregateInsightMetric(group.rows, metric) : group.rows.reduce((sum, row) => sum + row.metrics[metric]! / sample, 0);
    const sorted = [...group.rows].sort((a, b) => b.metrics[metric]! - a.metrics[metric]! || a.publication.id.localeCompare(b.publication.id));
    let lastRank = 1;
    const entries = sorted.map((row, index): VideoRankEntry => {
      const value = row.metrics[metric]!;
      if (index > 0 && value !== sorted[index - 1].metrics[metric]) lastRank = index + 1;
      return { row, value, rank: lastRank, belowAverage: average !== null && value < average };
    });
    return { key, label: group.label, sample, average, entries };
  }).sort((a, b) => a.label.localeCompare(b.label));
  return { cohorts, unavailable };
}
