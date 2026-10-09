import type {
  ContentItem,
  DashboardState,
  MediaAsset,
  Platform,
  PlatformSchedule,
  ProcessStep,
  ProductionStatus,
} from "../domain/types";

export type TaskPriority = "urgent" | "high" | "normal" | "low";

export interface ContentAsset {
  name: string;
  type: string;
  size: number;
  remoteReady?: boolean;
  previewReady?: boolean;
  remoteStatus?: "local-only" | "uploading" | "ready" | "failed";
}

export interface DashboardTask {
  id: string;
  updatedAt?: string;
  title: string;
  priority: TaskPriority;
  scheduledTime: string;
  workflowStage?: string;
  lastWorkedAt?: string;
  isComplete?: boolean;
  category?: string;
  format?: string;
  owner?: string;
  objective?: string;
  caption?: string;
  notes?: string;
  assets?: ContentAsset[];
  processSteps?: ProcessStep[];
  platformSchedules?: Record<Platform, { enabled: boolean; date: string; time: string }>;
}

const workflowStageByStatus: Record<ProductionStatus, string> = {
  "waiting-shoot": "รอถ่าย",
  shot: "ถ่ายแล้ว",
  editing: "ตัดต่อ",
  review: "รอตรวจ",
  "needs-changes": "ต้องแก้",
  ready: "พร้อมโพสต์",
  published: "เผยแพร่แล้ว",
};

const statusByWorkflowStage: Record<string, ProductionStatus> = {
  "รอถ่าย": "waiting-shoot",
  "ถ่ายแล้ว": "shot",
  "ตัดต่อ": "editing",
  "รอตรวจ": "review",
  "ต้องแก้": "needs-changes",
  "พร้อมโพสต์": "ready",
  "เผยแพร่แล้ว": "published",
};

const objectives = ["branding", "awareness", "lead", "engagement", "sales"] as const;

function resolveCategoryId(task: DashboardTask, state: DashboardState): string {
  return state.categories.find((category) => category.name === task.category)?.id
    ?? state.categories[0]?.id
    ?? "category-unassigned";
}

function resolveFormatId(task: DashboardTask, state: DashboardState): string {
  const exact = state.formats.find((format) => format.name === task.format);
  if (exact) return exact.id;
  if (task.format?.toLowerCase().includes("video") || task.format?.toLowerCase().includes("reel")) {
    return state.formats.find((format) => format.mediaKind === "video")?.id
      ?? "format-video";
  }
  return state.formats.find((format) => format.name === "เป้าเดิม — ยังไม่แบ่งรูปแบบ")?.id
    ?? state.formats[0]?.id
    ?? "format-unassigned";
}

function resolveObjective(value: string | undefined): ContentItem["objective"] {
  return objectives.includes(value as ContentItem["objective"])
    ? value as ContentItem["objective"]
    : "awareness";
}

function resolveProductionStatus(stage: string | undefined): ProductionStatus {
  return statusByWorkflowStage[stage ?? ""] ?? "waiting-shoot";
}

export function dashboardTaskToMedia(task: DashboardTask, now: string): MediaAsset[] {
  return (task.assets ?? []).map((asset, index) => ({
    id: `asset-${task.id}-${index}`,
    name: asset.name,
    mimeType: asset.type,
    size: asset.size,
    source: "upload",
    externalUrl: null,
    externalPreviewUrl: null,
    blobKey: `asset-${task.id}-${index}`,
    remoteStatus: "local-only",
    providerFileId: null,
    previewProviderFileId: null,
    tags: [],
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }));
}

export function dashboardTaskToContent(
  task: DashboardTask,
  state: DashboardState,
  now: string,
): ContentItem {
  const plannedWorkAt = task.scheduledTime && task.scheduledTime !== "ยังไม่กำหนด"
    ? task.scheduledTime
    : null;
  const lineReview = state.contents.find((content) => content.id === task.id)?.lineReview ?? {
        status: "not-sent" as const,
        activeCycleId: null,
        reviewCode: null,
        providerReceipts: [],
        lastEventAt: null,
        history: [],
      };
  const existing = state.contents.find((content) => content.id === task.id);
  const platformSchedules: PlatformSchedule[] | undefined = task.platformSchedules
    ? (Object.entries(task.platformSchedules) as Array<[Platform, { enabled: boolean; date: string; time: string }]>).map(([platform, value]) => ({
        platform,
        enabled: value.enabled,
        publishAt: value.enabled && value.date && value.time ? `${value.date}T${value.time}:00+07:00` : null,
        latestAttemptId: null,
        manualEvidence: null,
      }))
    : undefined;

  return {
    id: task.id,
    title: task.title,
    categoryId: resolveCategoryId(task, state),
    formatId: resolveFormatId(task, state),
    owner: task.owner ?? "ทีมคอนเทนต์",
    objective: resolveObjective(task.objective),
    priority: task.priority,
    plannedWorkAt,
    lastWorkedAt: task.lastWorkedAt ?? null,
    readyDate: plannedWorkAt?.slice(0, 10) ?? null,
    productionStatus: resolveProductionStatus(task.workflowStage),
    assetIds: (task.assets ?? []).map((_, index) => `asset-${task.id}-${index}`),
    processSteps: task.processSteps?.map((step) => ({ ...step })) ?? [],
    caption: task.caption ?? "",
    captionSource: null,
    schedules: platformSchedules ?? existing?.schedules.map((schedule) => ({ ...schedule })) ?? [],
    referenceIds: [],
    notes: task.notes ?? "",
    localApproval: "pending",
    lineReview,
    createdAt: task.lastWorkedAt ?? now,
    updatedAt: now,
    deletedAt: null,
  };
}

export function dashboardTaskFromContent(content: ContentItem, state: DashboardState): DashboardTask {
  const assets = content.assetIds
    .map((assetId) => state.media.find((asset) => asset.id === assetId))
    .filter((asset): asset is MediaAsset => Boolean(asset && !asset.deletedAt))
    .map((asset) => ({
      name: asset.name,
      type: asset.mimeType,
      size: asset.size,
      remoteReady: asset.remoteStatus === "ready" && Boolean(asset.providerFileId || (asset.source === "external" && asset.externalUrl)),
      previewReady: asset.mimeType !== "video/mp4" || Boolean(asset.previewProviderFileId || (asset.source === "external" && asset.externalPreviewUrl)),
      remoteStatus: asset.remoteStatus,
    }));

  return {
    id: content.id,
    updatedAt: content.updatedAt,
    title: content.title,
    priority: content.priority,
    scheduledTime: content.plannedWorkAt ?? "ยังไม่กำหนด",
    workflowStage: workflowStageByStatus[content.productionStatus],
    lastWorkedAt: content.lastWorkedAt ?? undefined,
    isComplete: content.productionStatus === "published",
    category: state.categories.find((category) => category.id === content.categoryId)?.name,
    format: state.formats.find((format) => format.id === content.formatId)?.name,
    owner: content.owner,
    objective: content.objective,
    caption: content.caption,
    notes: content.notes,
    assets,
    processSteps: content.processSteps.map((step) => ({ ...step })),
    platformSchedules: Object.fromEntries((content.schedules.length ? content.schedules : [
      { platform: "facebook" as const, enabled: false, publishAt: null, latestAttemptId: null, manualEvidence: null },
      { platform: "instagram" as const, enabled: false, publishAt: null, latestAttemptId: null, manualEvidence: null },
      { platform: "tiktok" as const, enabled: false, publishAt: null, latestAttemptId: null, manualEvidence: null },
    ]).map((schedule) => [schedule.platform, { enabled: schedule.enabled, date: schedule.publishAt?.slice(0, 10) ?? "", time: schedule.publishAt?.slice(11, 16) ?? "09:00" }])) as DashboardTask["platformSchedules"],
  };
}

const priorityOrder: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

/** Returns a new list so dashboard callers retain their original task order. */
export function sortTasksForToday(tasks: DashboardTask[]): DashboardTask[] {
  return [...tasks].sort((left, right) => {
    const priorityDifference = priorityOrder[left.priority] - priorityOrder[right.priority];

    return priorityDifference || left.scheduledTime.localeCompare(right.scheduledTime);
  });
}
