import { createHash, randomUUID } from "node:crypto";
import { NeonDashboardRepository, StaleDashboardStateError, type DashboardSnapshot } from "../../data/server/neon-dashboard-repository";
import { createNeonExecutor, type SqlExecutor } from "../../data/server/neon-client";
import type { ContentItem, DashboardState, MediaAsset } from "../../domain/types";
import { createProviderMediaDeliveryUrls } from "../../media/server/media-delivery-url";
import { NeonLineConnectionRepository } from "./line-connection-repository";
import { buildLineMessages, MAX_LINE_VIDEO_BYTES } from "./line-message-builder";
import { LinePushError, pushLineMessages } from "./line-push-client";
import { applyLineReviewEvent, beginReviewCycle, buildReviewCode } from "../review-model";
import { NeonLineReviewStore } from "./line-review-store";

const LINE_RETRY_WINDOW_MS = 24 * 60 * 60 * 1_000;
const MEDIA_URL_TTL_SECONDS = 3_600;
const DELIVERY_TIMEOUT_MS = 12_000;

export type LineDeliveryErrorCode =
  | "content_not_found"
  | "stale_content"
  | "caption_required"
  | "asset_not_ready"
  | "asset_unsupported"
  | "preview_missing"
  | "configuration"
  | "recipient"
  | "quota"
  | "media_fetch"
  | "timeout"
  | "provider";

export class LineDeliveryError extends Error {
  constructor(readonly code: LineDeliveryErrorCode) {
    super(code);
    this.name = "LineDeliveryError";
  }
}

export type DeliveryView = {
  id: string;
  status: "sent" | "failed";
  errorCategory: LineDeliveryErrorCode | null;
  sentAt: string | null;
  review?: { contentId: string; cycleId: string; reviewCode: string };
};

type DeliveryRow = {
  id: unknown;
  status: unknown;
  sent_at: unknown;
  error_category: unknown;
  created_at: unknown;
};

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type Environment = Readonly<Record<string, string | undefined>>;

type DeliveryServiceOptions = {
  loadDashboardSnapshot?: () => Promise<DashboardSnapshot>;
  saveDashboardState?: (state: DashboardState, version: number) => Promise<{ version: number }>;
  reviewStore?: Pick<NeonLineReviewStore, "registerLineReview" | "beginLineReviewSend" | "finishLineReviewSend" | "restorePreviousLineReview" | "appendLineReviewEvent">;
  getActiveRecipient?: () => Promise<string | null>;
  execute?: SqlExecutor;
  fetcher?: Fetcher;
  environment?: Environment;
  now?: () => number;
  generateId?: () => string;
  timeoutMs?: number;
};

function idempotencyKey(content: ContentItem, asset: MediaAsset): string {
  const captionDigest = createHash("sha256").update(content.caption, "utf8").digest("hex");
  return createHash("sha256")
    .update([content.id, content.updatedAt, asset.id, captionDigest].join("\n"), "utf8")
    .digest("hex");
}

function deliveryErrorCategory(value: unknown): LineDeliveryErrorCode | null {
  return value === "configuration" || value === "recipient" || value === "quota"
    || value === "media_fetch" || value === "timeout" || value === "provider"
    ? value
    : null;
}

function deliveryView(row: DeliveryRow): DeliveryView {
  return {
    id: String(row.id),
    status: row.status === "sent" ? "sent" : "failed",
    errorCategory: deliveryErrorCategory(row.error_category),
    sentAt: row.sent_at ? new Date(String(row.sent_at)).toISOString() : null,
  };
}

function safeExternalUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function findContentAndAsset(state: DashboardState, contentId: string, expectedUpdatedAt: string): [ContentItem, MediaAsset] {
  const content = state.contents.find((item) => item.id === contentId && !item.deletedAt);
  if (!content) throw new LineDeliveryError("content_not_found");
  if (content.updatedAt !== expectedUpdatedAt) throw new LineDeliveryError("stale_content");
  if (!content.caption.trim()) throw new LineDeliveryError("caption_required");
  if (content.assetIds.length > 1) throw new LineDeliveryError("asset_unsupported");

  const mediaById = new Map(state.media.map((asset) => [asset.id, asset]));
  const asset = content.assetIds
    .map((assetId) => mediaById.get(assetId))
    .find((candidate) => candidate && !candidate.deletedAt && candidate.remoteStatus === "ready");
  if (!asset || (!asset.providerFileId && !(asset.source === "external" && safeExternalUrl(asset.externalUrl)))) {
    throw new LineDeliveryError("asset_not_ready");
  }
  if (asset.mimeType !== "image/jpeg" && asset.mimeType !== "image/png" && asset.mimeType !== "video/mp4") {
    throw new LineDeliveryError("asset_unsupported");
  }
  if (content.schedules.some((schedule) => schedule.enabled) && asset.mimeType !== "video/mp4") throw new LineDeliveryError("asset_unsupported");
  if (asset.mimeType === "video/mp4" && !asset.previewProviderFileId
    && !(asset.source === "external" && safeExternalUrl(asset.externalPreviewUrl))) {
    throw new LineDeliveryError("preview_missing");
  }
  return [content, asset];
}

export class LineDeliveryService {
  private readonly loadDashboardSnapshot: () => Promise<DashboardSnapshot>;
  private readonly saveDashboardState: NonNullable<DeliveryServiceOptions["saveDashboardState"]>;
  private readonly reviewStore: NonNullable<DeliveryServiceOptions["reviewStore"]>;
  private readonly getActiveRecipient: () => Promise<string | null>;
  private readonly execute: SqlExecutor;
  private readonly fetcher: Fetcher;
  private readonly environment: Environment;
  private readonly now: () => number;
  private readonly generateId: () => string;
  private readonly timeoutMs: number;

  constructor(options: DeliveryServiceOptions = {}) {
    this.loadDashboardSnapshot = options.loadDashboardSnapshot ?? (() => new NeonDashboardRepository().loadDashboardState());
    this.saveDashboardState = options.saveDashboardState ?? ((state, version) => new NeonDashboardRepository().saveDashboardState(state, version));
    this.reviewStore = options.reviewStore ?? new NeonLineReviewStore();
    this.getActiveRecipient = options.getActiveRecipient ?? (() => new NeonLineConnectionRepository().getActiveRecipient());
    this.execute = options.execute ?? createNeonExecutor();
    this.fetcher = options.fetcher ?? globalThis.fetch;
    this.environment = options.environment ?? process.env;
    this.now = options.now ?? Date.now;
    this.generateId = options.generateId ?? randomUUID;
    this.timeoutMs = options.timeoutMs ?? DELIVERY_TIMEOUT_MS;
  }

  async sendContentToLine({ contentId, expectedUpdatedAt, actorId: _actorId, review: requestedReview }: {
    contentId: string;
    expectedUpdatedAt: string;
    actorId: string;
    review?: { cycleId: string; reviewCode: string };
  }): Promise<DeliveryView> {
    const snapshot = await this.loadDashboardSnapshot();
    const [content, asset] = findContentAndAsset(snapshot.state, contentId, expectedUpdatedAt);
    const key = requestedReview ? `${idempotencyKey(content, asset)}:${requestedReview.cycleId}` : idempotencyKey(content, asset);
    const rows = await this.execute(
      `INSERT INTO line_deliveries (
         id, idempotency_key, content_id, content_revision, asset_id, caption_snapshot,
         status, attempt_count, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, 'queued', 1, now(), now())
       ON CONFLICT (idempotency_key) DO UPDATE SET
         status = CASE WHEN line_deliveries.status = 'sent' THEN 'sent' ELSE 'queued' END,
         attempt_count = CASE WHEN line_deliveries.status = 'sent' THEN line_deliveries.attempt_count ELSE line_deliveries.attempt_count + 1 END,
         error_category = CASE WHEN line_deliveries.status = 'sent' THEN line_deliveries.error_category ELSE NULL END,
         updated_at = now()
       RETURNING id, status, sent_at, error_category, created_at`,
      [this.generateId(), key, content.id, content.updatedAt, asset.id, content.caption],
    );
    const delivery = rows[0] as DeliveryRow | undefined;
    if (!delivery) throw new Error("LINE delivery could not be persisted");
    const cycleId = requestedReview?.cycleId ?? String(delivery.id);
    const reviewCode = requestedReview?.reviewCode ?? buildReviewCode(cycleId);
    const reviewContext = { contentId: content.id, cycleId, reviewCode };
    if (delivery.status === "sent") return { ...deliveryView(delivery), review: reviewContext };

    const createdAt = Date.parse(String(delivery.created_at));
    const retryAge = this.now() - createdAt;
    // Retries must keep the exact request body so LINE can safely deduplicate its UUID key.
    // Signed media URLs stay identical and valid for one hour; the provider's retry-key window is 24 hours.
    if (!Number.isFinite(createdAt) || retryAge >= Math.min(LINE_RETRY_WINDOW_MS, MEDIA_URL_TTL_SECONDS * 1_000)) {
      await this.recordFailure(delivery.id, "timeout");
      return { id: String(delivery.id), status: "failed", errorCategory: "timeout", sentAt: null };
    }

    const recipient = await this.getActiveRecipient();
    if (!recipient) {
      await this.recordFailure(delivery.id, "recipient");
      return { id: String(delivery.id), status: "failed", errorCategory: "recipient", sentAt: null };
    }

    const accessToken = this.environment.LINE_CHANNEL_ACCESS_TOKEN;
    if (!accessToken) {
      await this.recordFailure(delivery.id, "configuration");
      return { id: String(delivery.id), status: "failed", errorCategory: "configuration", sentAt: null };
    }

    const reviewTime = new Date(createdAt).toISOString();
    const reviewedContent = beginReviewCycle(content, cycleId, reviewTime);
    reviewedContent.lineReview.reviewCode = reviewCode;
    const storedReview = await this.reviewStore.registerLineReview({
      ...reviewContext, recipientUserId: recipient,
      snapshot: { content: reviewedContent, media: [asset] },
    });
    if (storedReview.contentId !== content.id || storedReview.cycleId !== cycleId || storedReview.recipientUserId !== recipient) throw new LineDeliveryError("stale_content");
    if (JSON.stringify(storedReview.snapshot?.media) !== JSON.stringify([asset]) || storedReview.snapshot?.content.caption !== content.caption) throw new LineDeliveryError("stale_content");
    const recordedSend = storedReview.events.find((event) => event.event === "sent");
    if (recordedSend) {
      // A confirmed old delivery must never take over a newer active review on retry.
      if (content.lineReview.activeCycleId === cycleId) await this.persistReview(content.id, expectedUpdatedAt, cycleId, reviewCode, "sent", recordedSend.occurredAt);
      const sent = await this.recordSent(delivery.id);
      return { ...deliveryView((sent[0] ?? { ...delivery, status: "sent", sent_at: recordedSend.occurredAt }) as DeliveryRow), review: reviewContext };
    }
    if (await this.reviewStore.beginLineReviewSend(reviewCode, recipient) !== "begun") throw new LineDeliveryError("stale_content");
    try {
      await this.persistReview(content.id, expectedUpdatedAt, cycleId, reviewCode, "queued", reviewTime);
    } catch (error) {
      await this.reviewStore.restorePreviousLineReview(reviewCode, recipient);
      throw error;
    }

    try {
      let signedUrls: ReturnType<typeof createProviderMediaDeliveryUrls>;
      if (asset.source === "external") {
        const original = safeExternalUrl(asset.externalUrl);
        const preview = asset.mimeType === "video/mp4" ? safeExternalUrl(asset.externalPreviewUrl) : original;
        if (!original || !preview) throw new LineDeliveryError("asset_not_ready");
        signedUrls = { originalContentUrl: original, previewImageUrl: preview };
      } else {
        const previewProviderFileId = asset.mimeType === "video/mp4" ? asset.previewProviderFileId! : asset.providerFileId!;
        try {
          signedUrls = createProviderMediaDeliveryUrls({
            providerFileId: asset.providerFileId!,
            previewProviderFileId,
            environment: this.environment,
            now: () => Math.floor(createdAt / 1_000),
            ttlSeconds: MEDIA_URL_TTL_SECONDS,
            originalPurpose: asset.mimeType === "video/mp4" && (asset.size <= 0 || asset.size > MAX_LINE_VIDEO_BYTES) ? "original-link" : "original",
          });
        } catch {
          throw new LineDeliveryError("configuration");
        }
      }
      const messages = buildLineMessages({
        media: asset.mimeType === "video/mp4"
          ? { kind: "video", originalUrl: signedUrls.originalContentUrl, previewUrl: signedUrls.previewImageUrl, sizeBytes: asset.size,
            ...(asset.source === "upload" ? { linkExpiresAt: new Date(createdAt + MEDIA_URL_TTL_SECONDS * 1_000).toISOString() } : {}) }
          : { kind: "image", originalUrl: signedUrls.originalContentUrl, previewUrl: signedUrls.previewImageUrl },
        caption: content.caption,
      });
      messages.push({ type: "text", text: `ตรวจคอนเทนต์: ${content.title}\nรหัส: ${reviewCode}\nตอบ “ผ่าน” เพื่ออนุมัติและเข้าคิวเผยแพร่ตามตาราง\nตอบ “ไม่ผ่าน” เพื่อส่งกลับมาแก้ หากมีรายละเอียด ให้เว้นวรรคหรือขึ้นบรรทัดใหม่แล้วพิมพ์ต่อในข้อความเดียวกัน\nคำตอบใช้กับคลิปหรือภาพล่าสุดที่ส่งให้ตรวจเท่านั้น` });
      await pushLineMessages({
        fetcher: this.fetcher,
        accessToken,
        recipientUserId: recipient,
        retryKey: String(delivery.id),
        messages,
        timeoutMs: this.timeoutMs,
      });
    } catch (error) {
      const category = error instanceof LineDeliveryError || error instanceof LinePushError
        ? error instanceof LineDeliveryError ? error.code : error.category
        : error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError") ? "timeout" : "provider";
      const failed = await this.recordFailure(delivery.id, category);
      if (!failed.length) {
        // A parallel request already confirmed this same idempotent delivery.
        return { id: String(delivery.id), status: "sent", errorCategory: null, sentAt: new Date(this.now()).toISOString(), review: reviewContext };
      }
      // Unknown outcomes keep the active send reserved until the identical retry succeeds.
      if (category !== "timeout" && category !== "provider") await this.reviewStore.restorePreviousLineReview(reviewCode, recipient);
      await this.reviewStore.appendLineReviewEvent(reviewCode, { id: `line-failed-${cycleId}`, event: "failed", comment: null, occurredAt: new Date(this.now()).toISOString() });
      await this.persistReview(content.id, expectedUpdatedAt, cycleId, reviewCode, "failed", new Date(this.now()).toISOString());
      return { id: String(delivery.id), status: "failed", errorCategory: category, sentAt: null, review: reviewContext };
    }
    const sentAt = new Date(this.now()).toISOString();
    // Finalize review before marking delivery sent so any persistence failure is retried with the same provider key.
    await this.reviewStore.finishLineReviewSend(reviewCode, recipient, sentAt);
    await this.persistReview(content.id, expectedUpdatedAt, cycleId, reviewCode, "sent", sentAt);
    const sent = await this.recordSent(delivery.id);
    return { ...deliveryView((sent[0] ?? { ...delivery, status: "sent", sent_at: sentAt }) as DeliveryRow), review: reviewContext };
  }

  private async persistReview(contentId: string, expectedUpdatedAt: string, cycleId: string, reviewCode: string, event: "queued" | "sent" | "failed", occurredAt: string): Promise<void> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const snapshot = await this.loadDashboardSnapshot();
      const current = snapshot.state.contents.find((item) => item.id === contentId && !item.deletedAt);
      if (!current || current.updatedAt !== expectedUpdatedAt) throw new LineDeliveryError("stale_content");
      if (event !== "queued" && current.lineReview.activeCycleId !== cycleId) throw new LineDeliveryError("stale_content");
      if (current.lineReview.activeCycleId === cycleId && (current.lineReview.status === event || current.lineReview.status === "approved" || current.lineReview.status === "correction-requested")) return;
      let next = event === "queued" ? beginReviewCycle(current, cycleId, occurredAt) : applyLineReviewEvent(current, event, occurredAt);
      next = { ...next, updatedAt: current.updatedAt, lineReview: { ...next.lineReview, reviewCode } };
      try {
        await this.saveDashboardState({ ...snapshot.state, contents: snapshot.state.contents.map((item) => item.id === contentId ? next : item) }, snapshot.version);
        return;
      } catch (error) {
        if (!(error instanceof StaleDashboardStateError) || attempt === 3) throw error;
      }
    }
  }

  private recordSent(id: unknown): Promise<DeliveryRow[]> {
    return this.execute(
      `UPDATE line_deliveries SET status = 'sent', sent_at = now(), error_category = NULL, updated_at = now()
       WHERE id = $1 AND status <> 'sent'
       RETURNING id, status, sent_at, error_category, created_at`,
      [id],
    ) as Promise<DeliveryRow[]>;
  }

  private recordFailure(id: unknown, category: LineDeliveryErrorCode): Promise<DeliveryRow[]> {
    return this.execute(
      `UPDATE line_deliveries SET status = 'failed', error_category = $2, updated_at = now()
       WHERE id = $1 AND status <> 'sent'
       RETURNING id, status, sent_at, error_category, created_at`,
      [id, category],
    ) as Promise<DeliveryRow[]>;
  }
}
