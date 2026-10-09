import type {
  DashboardOverview,
  DashboardReadClient,
  PersistedContentSummary,
} from "./dashboard-types";

function count(items: PersistedContentSummary[], status: string) {
  return items.filter((item) => item.status === status).length;
}

export async function getDashboardOverview(
  db: DashboardReadClient,
): Promise<DashboardOverview> {
  const items = await db.listContent();

  return {
    plannedCount: count(items, "planned"),
    completedCount: count(items, "completed"),
    publishedCount: count(items, "published"),
    totalCount: items.length,
    imageCount: items.filter(
      (item) => item.format === "image" || item.format === "album",
    ).length,
    videoCount: items.filter((item) => item.format === "video").length,
  };
}
