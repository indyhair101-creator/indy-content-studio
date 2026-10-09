export type ProductionStatus =
  | "waiting-shoot"
  | "shot"
  | "editing"
  | "review"
  | "needs-changes"
  | "ready"
  | "published";

export type Platform = "facebook" | "instagram" | "tiktok";
export type StepStatus = "todo" | "doing" | "done";
export type ContentObjective = "branding" | "awareness" | "lead" | "engagement" | "sales";
export type ContentPriority = "urgent" | "high" | "normal" | "low";

export interface ProcessStep {
  id: string;
  name: string;
  scheduledDate: string | null;
  status: StepStatus;
  order: number;
}

export interface ActionTask {
  id: string;
  title: string;
  scheduledDate: string;
  status: StepStatus;
  owner?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformSchedule {
  platform: Platform;
  enabled: boolean;
  publishAt: string | null;
  latestAttemptId: string | null;
  manualEvidence: { receiptUrl: string; note: string; confirmedAt: string } | null;
}

export interface LineReviewHistoryEvent {
  id: string;
  cycleId: string;
  event: "queued" | "sent" | "approved" | "correction-requested" | "approval-reset" | "failed";
  comment: string | null;
  occurredAt: string;
}

export interface LineReviewState {
  status: "not-sent" | "queued" | "sent" | "correction-requested" | "approved" | "failed";
  activeCycleId: string | null;
  reviewCode: string | null;
  providerReceipts: string[];
  lastEventAt: string | null;
  history: LineReviewHistoryEvent[];
}

export interface ContentItem {
  id: string;
  title: string;
  categoryId: string;
  formatId: string;
  owner: string;
  objective: ContentObjective;
  priority: ContentPriority;
  plannedWorkAt: string | null;
  lastWorkedAt: string | null;
  readyDate: string | null;
  productionStatus: ProductionStatus;
  assetIds: string[];
  processSteps: ProcessStep[];
  caption: string;
  captionSource: { templateId: string; versionId: string; values: Record<string, string> } | null;
  schedules: PlatformSchedule[];
  referenceIds: string[];
  notes: string;
  localApproval: "pending" | "approved";
  lineReview: LineReviewState;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface MediaAsset {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  source: "upload" | "external";
  externalUrl: string | null;
  externalPreviewUrl: string | null;
  blobKey: string | null;
  remoteStatus: "local-only" | "uploading" | "ready" | "failed";
  providerFileId: string | null;
  previewProviderFileId: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Category {
  id: string;
  name: string;
  requiresApproval: boolean;
}

export interface FormatDefinition {
  id: string;
  name: string;
  mediaKind: "video" | "image" | "other";
  allowedPlatforms: Platform[];
}

export interface ReferenceIdea {
  id: string;
  title: string;
  url: string;
  platform: string;
  tags: string[];
  notes: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface CaptionTemplateVersion {
  id: string;
  version: number;
  body: string;
  variables: string[];
  createdAt: string;
}

export interface CaptionTemplate {
  id: string;
  name: string;
  versions: CaptionTemplateVersion[];
  activeVersionId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface CorrectionRequest {
  source?: "line-unmatched";
  id: string;
  contentId: string;
  cycleId: string;
  comment: string;
  status: "open" | "resolved";
  receivedAt: string;
  resolvedAt: string | null;
}

export interface MonthlyGoal {
  month: string;
  target: number;
}

export interface CategoryMonthlyGoal {
  month: string;
  categoryId: string;
  target: number;
}

export interface PublicationAttempt {
  id: string;
  idempotencyKey: string;
  contentId: string;
  platform: Platform;
  publishAt: string;
  status: "local-plan" | "submitting" | "queued" | "publishing" | "published" | "failed" | "cancelled";
  queueId: string | null;
  providerPublicationId: string | null;
  receiptUrl: string | null;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IntegrationStatus {
  provider: "database" | "google-sheets" | "google-drive" | "blob" | "line" | "make" | "tiktok" | "online-media" | "ai-caption";
  status: "connected" | "disconnected" | "error";
  checkedAt: string | null;
  message: string;
}

export interface DashboardState {
  schemaVersion: 1;
  contents: ContentItem[];
  actionTasks: ActionTask[];
  media: MediaAsset[];
  categories: Category[];
  formats: FormatDefinition[];
  ownerOptions: string[];
  references: ReferenceIdea[];
  captionTemplates: CaptionTemplate[];
  corrections: CorrectionRequest[];
  monthlyGoals: MonthlyGoal[];
  categoryMonthlyGoals: CategoryMonthlyGoal[];
  publicationAttempts: PublicationAttempt[];
  integrations: IntegrationStatus[];
  notificationReadIds: string[];
}
