import { createHmac } from "node:crypto";
import { createNeonExecutor, type SqlExecutor } from "../../data/server/neon-client";
import type { ContentItem, MediaAsset } from "../../domain/types";
import type { LineReviewEvent } from "../review-model";
import { decryptLineUserId, encryptLineUserId } from "./line-user-encryption";

export type ReviewSnapshot = { content: ContentItem; media: MediaAsset[] };
export type ReviewDecisionInput = { eventId: string; senderUserId: string; reviewCode?: string; decision: "approved" | "correction-requested"; comment: string | null; occurredAt: string };
export type ReviewDecisionResult = { status: "recorded" | "duplicate"; review: StoredLineReview } | { status: "ignored" | "retry" | "unmatched-recorded" };
export type UnmatchedLineFeedback = { id: string; comment: string; receivedAt: string };

export interface StoredLineReview {
  contentId: string;
  cycleId: string;
  reviewCode: string;
  recipientUserId: string;
  snapshot?: ReviewSnapshot;
  events: Array<{ id: string; event: LineReviewEvent; comment: string | null; occurredAt: string; providerReceipt?: string }>;
  handledWebhookEventIds: string[];
}

type ReviewEventInput = StoredLineReview["events"][number];
type ReviewQueryRow = Record<string, unknown> & {
  review_code: unknown;
  content_id: unknown;
  cycle_id: unknown;
  encrypted_recipient_user_id: unknown;
};

type StoreOptions = { execute?: SqlExecutor; encryptionKey?: string };

function eventTime(value: unknown): string {
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.valueOf())) throw new Error("Invalid LINE review event time");
  return parsed.toISOString();
}

function hydrateReview(rows: ReviewQueryRow[], encryptionKey: string): StoredLineReview | null {
  const first = rows[0];
  if (!first) return null;
  if (typeof first.encrypted_recipient_user_id !== "string") throw new Error("Invalid stored LINE review recipient");
  const events = rows
    .filter((row) => typeof row.event_id === "string")
    .map((row) => ({
      id: String(row.event_id),
      event: row.event as LineReviewEvent,
      comment: typeof row.comment === "string" ? row.comment : null,
      occurredAt: eventTime(row.occurred_at),
      ...(typeof row.provider_receipt === "string" ? { providerReceipt: row.provider_receipt } : {}),
    }));
  return {
    contentId: String(first.content_id),
    cycleId: String(first.cycle_id),
    reviewCode: String(first.review_code),
    recipientUserId: decryptLineUserId(first.encrypted_recipient_user_id, encryptionKey),
    ...(first.snapshot && typeof first.snapshot === "object" ? { snapshot: first.snapshot as ReviewSnapshot } : {}),
    events,
    handledWebhookEventIds: [...new Set(rows.flatMap((row) => typeof row.webhook_event_id === "string" ? [row.webhook_event_id] : []))],
  };
}

const reviewSelect = `SELECT r.review_code, r.content_id, r.cycle_id, r.encrypted_recipient_user_id, r.snapshot,
       e.id AS event_id, e.event, e.comment, e.occurred_at, e.provider_receipt, e.webhook_event_id
       FROM line_reviews r LEFT JOIN line_review_events e ON e.review_code = r.review_code`;

export class NeonLineReviewStore {
  private readonly execute: SqlExecutor;
  private readonly encryptionKey: string;

  constructor(options: StoreOptions = {}) {
    this.execute = options.execute ?? createNeonExecutor();
    this.encryptionKey = options.encryptionKey ?? process.env.LINE_RECIPIENT_ENCRYPTION_KEY ?? "";
  }

  private recipientHash(userId: string): string {
    const key = Buffer.from(this.encryptionKey, "base64url");
    if (key.byteLength !== 32) throw new Error("LINE recipient encryption is not configured");
    return createHmac("sha256", key).update(userId, "utf8").digest("hex");
  }

  async beginLineReviewSend(reviewCode: string, recipientUserId: string): Promise<"begun" | "in-progress"> {
    const rows = await this.execute(
      `INSERT INTO line_active_reviews (recipient_hash, review_code, decision)
       SELECT $1, $2, 'sending' WHERE EXISTS (SELECT 1 FROM line_reviews WHERE review_code = $2)
       ON CONFLICT (recipient_hash) DO UPDATE SET
         previous_review_code = CASE WHEN line_active_reviews.decision = 'sending' THEN line_active_reviews.previous_review_code ELSE line_active_reviews.review_code END,
         previous_decision = CASE WHEN line_active_reviews.decision = 'sending' THEN line_active_reviews.previous_decision ELSE line_active_reviews.decision END,
         review_code = EXCLUDED.review_code, decision = 'sending', updated_at = now()
       WHERE (line_active_reviews.decision <> 'sending' OR line_active_reviews.review_code = EXCLUDED.review_code OR line_active_reviews.updated_at < now() - interval '1 hour')
         AND NOT EXISTS (SELECT 1 FROM line_review_events WHERE review_code = $2 AND event IN ('approved', 'correction-requested'))
       RETURNING review_code`, [this.recipientHash(recipientUserId), reviewCode],
    );
    return rows.length ? "begun" : "in-progress";
  }

  async finishLineReviewSend(reviewCode: string, recipientUserId: string, occurredAt: string): Promise<void> {
    const rows = await this.execute(
      `WITH finalized AS (
         UPDATE line_active_reviews SET decision = 'pending', previous_review_code = NULL, previous_decision = NULL, updated_at = now()
         WHERE recipient_hash = $1 AND review_code = $2 AND decision IN ('sending', 'pending') RETURNING review_code
       ), inserted_sent AS (
         INSERT INTO line_review_events (id, review_code, event, comment, occurred_at)
         SELECT $3, $2, 'sent', NULL, $4::timestamptz FROM finalized
         ON CONFLICT (id) DO NOTHING RETURNING id
       ) SELECT review_code FROM finalized
         UNION ALL SELECT review_code FROM line_active_reviews WHERE recipient_hash = $1 AND review_code = $2 AND decision IN ('approved', 'correction-requested')`,
      [this.recipientHash(recipientUserId), reviewCode, `line-sent-${reviewCode}`, occurredAt],
    );
    if (!rows.length) throw new Error("LINE review send is no longer active");
  }

  async restorePreviousLineReview(reviewCode: string, recipientUserId: string): Promise<void> {
    await this.execute(
      `WITH restored AS (
         UPDATE line_active_reviews SET review_code = previous_review_code, decision = previous_decision,
           previous_review_code = NULL, previous_decision = NULL, updated_at = now()
         WHERE recipient_hash = $1 AND review_code = $2 AND decision = 'sending' AND previous_review_code IS NOT NULL
         RETURNING recipient_hash
       ), removed AS (
         DELETE FROM line_active_reviews WHERE recipient_hash = $1 AND review_code = $2 AND decision = 'sending' AND previous_review_code IS NULL RETURNING recipient_hash
       ) SELECT recipient_hash FROM restored UNION ALL SELECT recipient_hash FROM removed`,
      [this.recipientHash(recipientUserId), reviewCode],
    );
  }

  async recordLineReviewDecision(input: ReviewDecisionInput): Promise<ReviewDecisionResult> {
    if (!input.eventId || !Number.isFinite(Date.parse(input.occurredAt)) || (input.decision === "correction-requested" && !input.comment?.trim())) return { status: "ignored" };
    // Retry the exact stored approval even if another clip has since become active.
    const duplicate = await this.execute(
      `SELECT review_code FROM line_review_events WHERE webhook_event_id = $1 AND event = 'approved'`, [input.eventId],
    );
    if (duplicate[0]) {
      const review = await this.getLineReview(String(duplicate[0].review_code));
      if (review?.recipientUserId === input.senderUserId) return { status: "duplicate", review };
      return { status: "ignored" };
    }
    const rows = await this.execute(
      `WITH changed AS (
         UPDATE line_active_reviews a SET decision = $3, updated_at = now()
         FROM line_reviews r
         WHERE a.recipient_hash = $1 AND a.decision = 'pending' AND r.review_code = a.review_code
           AND ($6::text IS NULL OR a.review_code = $6)
           AND r.created_at <= $5::timestamptz
           AND EXISTS (SELECT 1 FROM line_review_events sent WHERE sent.review_code = a.review_code AND sent.event = 'sent')
           AND EXISTS (SELECT 1 FROM dashboard_snapshots d, jsonb_array_elements(d.state->'contents') c
             WHERE d.workspace_key = 'primary' AND c->>'id' = r.content_id AND c->>'deletedAt' IS NULL
               AND c->'lineReview'->>'activeCycleId' = r.cycle_id)
           AND NOT EXISTS (SELECT 1 FROM line_webhook_events WHERE webhook_event_id = $2)
           AND NOT EXISTS (SELECT 1 FROM line_review_events WHERE review_code = a.review_code AND event IN ('approved', 'correction-requested'))
         RETURNING a.review_code
       ), accepted AS (
         INSERT INTO line_webhook_events (webhook_event_id) SELECT $2 FROM changed
         ON CONFLICT DO NOTHING RETURNING webhook_event_id
       ), inserted AS (
         INSERT INTO line_review_events (id, review_code, event, comment, occurred_at, webhook_event_id)
         SELECT 'line-webhook-' || $2, changed.review_code, $3, $4, $5::timestamptz, $2 FROM changed
         WHERE EXISTS (SELECT 1 FROM accepted) ON CONFLICT DO NOTHING RETURNING review_code
       ) SELECT review_code FROM inserted`,
      [this.recipientHash(input.senderUserId), input.eventId, input.decision, input.comment?.trim() ?? null, input.occurredAt, input.reviewCode ?? null],
    );
    if (rows[0]) {
      const review = await this.getLineReview(String(rows[0].review_code));
      if (!review) throw new Error("Persisted LINE decision is unavailable");
      return { status: "recorded", review };
    }
    const active = await this.execute("SELECT decision FROM line_active_reviews WHERE recipient_hash = $1", [this.recipientHash(input.senderUserId)]);
    if (!active.length && !input.reviewCode && input.decision === "correction-requested") {
      // Keep a paired sender's feedback without inventing a content/review association.
      // The shared webhook key prevents one event from becoming both a decision and inbox feedback.
      const feedback = await this.execute(
        `WITH accepted AS (
           INSERT INTO line_webhook_events (webhook_event_id) VALUES ($1)
           ON CONFLICT DO NOTHING RETURNING webhook_event_id
         ), inserted AS (
           INSERT INTO line_unmatched_feedback (id, webhook_event_id, recipient_hash, comment, occurred_at)
           SELECT 'line-inbox-' || $1, $1, $2, $3, $4::timestamptz FROM accepted
           ON CONFLICT DO NOTHING RETURNING id
         ) SELECT id FROM inserted
           UNION ALL SELECT id FROM line_unmatched_feedback WHERE webhook_event_id = $1`,
        [input.eventId, this.recipientHash(input.senderUserId), input.comment!.trim(), input.occurredAt],
      );
      return { status: feedback.length ? "unmatched-recorded" : "ignored" };
    }
    return { status: active[0]?.decision === "sending" ? "retry" : "ignored" };
  }

  async listUnmatchedFeedback(): Promise<UnmatchedLineFeedback[]> {
    const rows = await this.execute("SELECT id, comment, occurred_at FROM line_unmatched_feedback ORDER BY occurred_at, id", []);
    return rows.map((row) => ({ id: String(row.id), comment: String(row.comment), receivedAt: eventTime(row.occurred_at) }));
  }

  async registerLineReview(review: Omit<StoredLineReview, "events" | "handledWebhookEventIds">): Promise<StoredLineReview> {
    const encryptedRecipient = encryptLineUserId(review.recipientUserId, this.encryptionKey);
    await this.execute(
      `INSERT INTO line_reviews (review_code, content_id, cycle_id, encrypted_recipient_user_id, snapshot)
       VALUES ($1, $2, $3, $4, $5::jsonb) ON CONFLICT (review_code) DO NOTHING`,
      [review.reviewCode, review.contentId, review.cycleId, encryptedRecipient, review.snapshot ? JSON.stringify(review.snapshot) : null],
    );
    const stored = await this.getLineReview(review.reviewCode);
    if (!stored) throw new Error("LINE review could not be persisted");
    return stored;
  }

  async getLineReview(reviewCode: string): Promise<StoredLineReview | null> {
    const rows = await this.execute(
      `${reviewSelect} WHERE r.review_code = $1 ORDER BY e.occurred_at, e.id`,
      [reviewCode],
    );
    return hydrateReview(rows as ReviewQueryRow[], this.encryptionKey);
  }

  async appendLineReviewEvent(
    reviewCode: string,
    event: ReviewEventInput,
    webhookEventId?: string,
  ): Promise<StoredLineReview | null> {
    await this.execute(
      `WITH accepted_webhook_event AS (
         INSERT INTO line_webhook_events (webhook_event_id)
         SELECT $7 WHERE $7::text IS NOT NULL
         ON CONFLICT (webhook_event_id) DO NOTHING
         RETURNING webhook_event_id
       ), inserted_review_event AS (
         INSERT INTO line_review_events (id, review_code, event, comment, occurred_at, provider_receipt, webhook_event_id)
         SELECT $1, $2, $3, $4, $5::timestamptz, $6, $7
         WHERE EXISTS (SELECT 1 FROM line_reviews WHERE review_code = $2)
           AND ($7::text IS NULL OR EXISTS (SELECT 1 FROM accepted_webhook_event))
         ON CONFLICT DO NOTHING
         RETURNING id
       )
       SELECT id FROM inserted_review_event`,
      [event.id, reviewCode, event.event, event.comment, event.occurredAt, event.providerReceipt ?? null, webhookEventId ?? null],
    );
    return this.getLineReview(reviewCode);
  }

  async listLineReviews(): Promise<StoredLineReview[]> {
    const rows = await this.execute(`${reviewSelect} ORDER BY r.created_at, e.occurred_at, e.id`, []);
    const grouped = new Map<string, ReviewQueryRow[]>();
    for (const row of rows as ReviewQueryRow[]) {
      const code = String(row.review_code);
      const group = grouped.get(code) ?? [];
      group.push(row);
      grouped.set(code, group);
    }
    return [...grouped.values()]
      .map((group) => hydrateReview(group, this.encryptionKey))
      .filter((review): review is StoredLineReview => review !== null);
  }
}

function defaultStore(): NeonLineReviewStore {
  return new NeonLineReviewStore();
}

export function registerLineReview(review: Omit<StoredLineReview, "events" | "handledWebhookEventIds">): Promise<StoredLineReview> {
  return defaultStore().registerLineReview(review);
}

export function getLineReview(reviewCode: string): Promise<StoredLineReview | null> {
  return defaultStore().getLineReview(reviewCode);
}

export function appendLineReviewEvent(reviewCode: string, event: ReviewEventInput, webhookEventId?: string): Promise<StoredLineReview | null> {
  return defaultStore().appendLineReviewEvent(reviewCode, event, webhookEventId);
}

export function listLineReviews(): Promise<StoredLineReview[]> {
  return defaultStore().listLineReviews();
}

export function listUnmatchedLineFeedback(): Promise<UnmatchedLineFeedback[]> {
  return defaultStore().listUnmatchedFeedback();
}
