export type ReportPlatform = "facebook" | "instagram" | "tiktok" | "youtube";
export type TrafficKind = "organic" | "paid" | "all" | "unknown";
export type MetricKey = "views" | "reach" | "uniqueViewers" | "likes" | "comments" | "shares" | "saves" | "followers" | "clicks" | "conversions" | "watchSeconds" | "averageWatchSeconds" | "averageWatchPercent" | "completionRate";
export interface ReportRange { start: string; end: string }
export interface ReportFilters {
  range: ReportRange; dateBasis: "activity" | "published"; platform: ReportPlatform | "all";
  accountId: string; owner: string; categoryId: string; formatId: string; objective: string;
  traffic: TrafficKind | "any"; videoOnly: boolean; minDuration: number | null; maxDuration: number | null;
}
export interface ReportConnection {
  id: string; platform: ReportPlatform; accountId: string; label: string;
  status: "connected" | "disconnected" | "expired" | "missing-permission" | "error";
  checkedAt: string | null; message: string; availableMetrics: MetricKey[];
}
export interface ReportPublication {
  id: string; contentId: string | null; platform: ReportPlatform; accountId: string;
  providerPostId: string; url: string; title: string; publishedAt: string;
  mediaKind: "video" | "image" | "other"; durationSeconds: number | null; thumbnailUrl: string | null;
}
export interface MetricObservation {
  timeZone?: string;
  id: string; publicationId: string; fetchedAt: string; source: "api" | "import";
  sourceLabel: string; scope: "activity" | "lifetime"; period: ReportRange | null;
  traffic: TrafficKind; metrics: Partial<Record<MetricKey, number | null>>;
  /** Only supplied when the provider documents this exact playback denominator. */
  averageWatchWeight: number | null;
  retention: Array<{ positionSeconds: number; ratio: number }> | null;
}
export interface SavedReport {
  id: string; title: string; kind: "team" | "content"; createdAt: string;
  filters: ReportFilters; snapshot: unknown;
}
export interface ReportingState {
  connections: ReportConnection[]; publications: ReportPublication[];
  observations: MetricObservation[]; savedReports: SavedReport[];
}
export interface WorkStatusEvent {
  id: string; entity: "content" | "step" | "action-task"; contentId: string | null;
  entityId: string; from: string | null; to: string; occurredAt: string;
  owner: string; scheduledDate: string | null;
  source: "observed" | "manual-publication" | "publication-sync" | "import";
}
export const REPORT_PLATFORM_LABELS: Record<ReportPlatform, string> = { facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube" };
export function emptyReportingState(): ReportingState {
  return { connections: [], publications: [], observations: [], savedReports: [] };
}
