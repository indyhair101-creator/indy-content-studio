import type { ContentItem, DashboardState, ProductionStatus } from "../domain/types";

export const PRODUCTION_STATUS_ORDER: ProductionStatus[] = [
  "waiting-shoot",
  "shot",
  "editing",
  "review",
  "needs-changes",
  "ready",
  "published",
];

export const PRODUCTION_STATUS_LABELS: Record<ProductionStatus, string> = {
  "waiting-shoot": "รอถ่าย",
  shot: "ถ่ายแล้ว",
  editing: "กำลังตัดต่อ",
  review: "รอตรวจ",
  "needs-changes": "ต้องแก้",
  ready: "พร้อมเผยแพร่",
  published: "เผยแพร่แล้ว",
};

export interface ProductionBoardFilters {
  query?: string;
  owner?: string;
  priority?: ContentItem["priority"] | "all";
  status?: ProductionStatus | "all";
}

export interface ProductionBoardColumn {
  status: ProductionStatus;
  label: string;
  items: ContentItem[];
}

export interface ProductionMoveResult {
  allowed: boolean;
  reason?: string;
}

function canPublish(content: ContentItem): boolean {
  const enabledSchedules = content.schedules.filter((schedule) => schedule.enabled);
  return enabledSchedules.length > 0 && enabledSchedules.every((schedule) => Boolean(schedule.manualEvidence || schedule.latestAttemptId));
}

export function canMoveContentToStatus(content: ContentItem, target: ProductionStatus): ProductionMoveResult {
  if (target === "published" && !canPublish(content)) {
    return { allowed: false, reason: "ยังไม่มีหลักฐานเผยแพร่ครบทุกช่องทาง" };
  }
  return { allowed: true };
}

export function selectProductionBoard(state: DashboardState, filters: ProductionBoardFilters = {}): ProductionBoardColumn[] {
  const query = filters.query?.trim().toLocaleLowerCase() ?? "";
  const columns = PRODUCTION_STATUS_ORDER.map((status) => ({ status, label: PRODUCTION_STATUS_LABELS[status], items: [] as ContentItem[] }));
  const selectedStatuses = filters.status && filters.status !== "all" ? new Set([filters.status]) : null;

  state.contents
    .filter((content) => !content.deletedAt)
    .filter((content) => !selectedStatuses || selectedStatuses.has(content.productionStatus))
    .filter((content) => !filters.owner || content.owner === filters.owner)
    .filter((content) => !filters.priority || filters.priority === "all" || content.priority === filters.priority)
    .filter((content) => !query || `${content.title} ${content.owner} ${content.caption}`.toLocaleLowerCase().includes(query))
    .forEach((content) => columns.find((column) => column.status === content.productionStatus)?.items.push(content));

  return columns;
}

export function moveContentToStatus(state: DashboardState, contentId: string, target: ProductionStatus, now: string): DashboardState {
  const content = state.contents.find((item) => item.id === contentId);
  if (!content) throw new Error("ไม่พบคอนเทนต์");
  const result = canMoveContentToStatus(content, target);
  if (!result.allowed) throw new Error(result.reason);

  return {
    ...state,
    contents: state.contents.map((item) => item.id === contentId ? {
      ...item,
      productionStatus: target,
      readyDate: target === "ready" ? item.readyDate ?? now.slice(0, 10) : item.readyDate,
      updatedAt: now,
    } : item),
  };
}
