export type ContentStatus = "planned" | "completed" | "published" | "other";
export type ContentFormat = "video" | "image" | "album" | "other";

export interface PersistedContentSummary {
  id: string;
  status: ContentStatus;
  format: ContentFormat;
}

export interface DashboardReadClient {
  listContent(): Promise<PersistedContentSummary[]>;
}

export interface DashboardOverview {
  plannedCount: number;
  completedCount: number;
  publishedCount: number;
  totalCount: number;
  imageCount: number;
  videoCount: number;
}
