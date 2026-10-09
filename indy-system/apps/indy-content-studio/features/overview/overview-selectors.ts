import type { DashboardState } from "../domain/types";
import { isContentSent } from "../content/content-status";

export function selectMonthlyOverview(
  state: DashboardState,
  input: { month: string; query?: string; categoryId?: string; formatId?: string; owner?: string; now: string },
) {
  const query = input.query?.trim().toLocaleLowerCase("th-TH") ?? "";
  const monthItems = state.contents.filter((content) =>
    !content.deletedAt && (content.readyDate ?? content.plannedWorkAt ?? "").startsWith(input.month),
  );
  const items = monthItems.filter((content) =>
    (!query || `${content.title} ${content.caption} ${content.notes}`.toLocaleLowerCase("th-TH").includes(query))
    && (!input.categoryId || content.categoryId === input.categoryId)
    && (!input.formatId || content.formatId === input.formatId)
    && (!input.owner || content.owner === input.owner),
  );
  const metrics = {
    target: state.monthlyGoals.find((goal) => goal.month === input.month)?.target ?? 0,
    planned: items.length,
    completed: items.filter((item) => item.productionStatus === "published").length,
    fullyPublished: items.filter((item) => item.schedules.filter((schedule) => schedule.enabled)
      .every((schedule) => Boolean(schedule.manualEvidence || schedule.latestAttemptId))).length,
  };
  const ratios = {
    video: { count: items.filter((item) => state.formats.find((format) => format.id === item.formatId)?.mediaKind === "video").length, percent: 0 },
    image: { count: items.filter((item) => state.formats.find((format) => format.id === item.formatId)?.mediaKind === "image").length, percent: 0 },
  };
  const total = items.length || 1;
  ratios.video.percent = Math.round(ratios.video.count / total * 100);
  ratios.image.percent = Math.round(ratios.image.count / total * 100);
  const missingPlan = items.filter((item) => !item.plannedWorkAt).length;
  const missingActual = items.filter((item) => !item.lastWorkedAt).length;
  const partiallyPublished = items.filter((item) => item.schedules.some((schedule) => schedule.enabled)
    && !metrics.fullyPublished && item.productionStatus !== "published").length;
  const unverifiedReceipts = items.reduce((count, item) => count + item.schedules.filter((schedule) =>
    schedule.enabled && !schedule.manualEvidence && !schedule.latestAttemptId).length, 0);
  const categoryProgress = state.categories.map((category) => {
    const contentItems = monthItems.filter((item) => item.categoryId === category.id);
    const completed = contentItems.filter(isContentSent).length;
    const target = state.categoryMonthlyGoals.find((goal) => goal.month === input.month && goal.categoryId === category.id)?.target ?? null;
    return {
      categoryId: category.id,
      categoryName: category.name,
      completed,
      target,
      percentage: target ? Math.min(100, Math.round(completed / target * 100)) : 0,
      total: contentItems.length,
    };
  });

  return {
    items: [...items].sort((a, b) => (a.readyDate ?? "").localeCompare(b.readyDate ?? "") || a.title.localeCompare(b.title)),
    metrics,
    ratios,
    categoryProgress,
    warnings: { missingPlan, missingActual, partiallyPublished, unverifiedReceipts },
  };
}
