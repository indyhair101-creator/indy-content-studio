import { verifyLineSignature } from "./line-signature";
import { parseLinePairingEvent } from "./line-pairing-event";
import { NeonLineConnectionRepository } from "./line-connection-repository";
import { parseLineReviewCommand } from "./line-review-command";
import { NeonLineReviewStore, type ReviewDecisionInput, type ReviewDecisionResult, type StoredLineReview } from "./line-review-store";

type WebhookEvent = {
  webhookEventId?: string;
  timestamp?: number;
  type?: string;
  source?: { type?: string; userId?: string };
  message?: { type?: string; text?: string };
};

type WebhookRepository = Pick<NeonLineConnectionRepository, "claimPairingCode" | "getActiveRecipient">;
type WebhookHandlerOptions = {
  getRepository?: () => WebhookRepository;
  recordDecision?: (input: ReviewDecisionInput) => Promise<ReviewDecisionResult>;
  enqueueApproval?: (review: StoredLineReview) => Promise<void>;
};

export function createLineWebhookHandler({
  getRepository = () => new NeonLineConnectionRepository(),
  recordDecision = (input) => new NeonLineReviewStore().recordLineReviewDecision(input),
  enqueueApproval = async (review) => {
    const { enqueueApprovedReview } = await import("../../publication/server/approved-publication-queue");
    await enqueueApprovedReview(review);
  },
}: WebhookHandlerOptions = {}) {
  return async function handleLineWebhook(request: Request): Promise<Response> {
    const rawBody = await request.text();
    const signature = request.headers.get("x-line-signature") ?? "";
    const channelSecret = process.env.LINE_CHANNEL_SECRET;

    if (!channelSecret || !verifyLineSignature(rawBody, signature, channelSecret)) {
      return new Response("Unauthorized", { status: 401 });
    }

    let payload: { events?: WebhookEvent[] };
    try {
      payload = JSON.parse(rawBody) as { events?: WebhookEvent[] };
      if (!payload || (payload.events !== undefined && !Array.isArray(payload.events))) return new Response("Bad Request", { status: 400 });
    } catch {
      return new Response("Bad Request", { status: 400 });
    }

    for (const event of payload.events ?? []) {
      if (!event || typeof event !== "object") continue;
      const pairing = parseLinePairingEvent(event);
      if (pairing && event.webhookEventId) {
        try {
          await getRepository().claimPairingCode({ ...pairing, webhookEventId: event.webhookEventId });
        } catch {
          return new Response("Service Unavailable", { status: 503 });
        }
        continue;
      }

      if (event.type !== "message" || event.message?.type !== "text" || typeof event.message.text !== "string" || !event.message.text) continue;
      const command = parseLineReviewCommand(event.message.text);
      if (!command || event.source?.type !== "user" || !event.source.userId) continue;
      if (typeof event.webhookEventId !== "string" || !event.webhookEventId || typeof event.timestamp !== "number" || !Number.isFinite(new Date(event.timestamp).valueOf())) continue;
      try {
        if (await getRepository().getActiveRecipient() !== event.source.userId) continue;
        const result = await recordDecision({
          eventId: event.webhookEventId,
          senderUserId: event.source.userId,
          ...(command.reviewCode ? { reviewCode: command.reviewCode } : {}),
          decision: command.kind === "approve" ? "approved" : "correction-requested",
          comment: command.kind === "correction" ? command.comment : null,
          occurredAt: new Date(event.timestamp!).toISOString(),
        });
        console.info("line_review_decision", { decision: command.kind, outcome: result.status });
        if (result.status === "retry") return new Response("Service Unavailable", { status: 503 });
        if ((result.status === "recorded" || result.status === "duplicate") && result.review.events.some((item) => item.event === "approved")) {
          await enqueueApproval(result.review);
        }
      } catch {
        return new Response("Service Unavailable", { status: 503 });
      }
    }

    return new Response("OK", { status: 200 });
  };
}
