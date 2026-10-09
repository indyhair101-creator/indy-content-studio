import type { ContentItem, CorrectionRequest, DashboardState, LineReviewHistoryEvent } from "../domain/types";

export type LineReviewEvent = "queued" | "sent" | "approved" | "correction-requested" | "failed";

export function buildReviewCode(cycleId: string): string {
  let hash = 2166136261;
  for (const character of cycleId) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let output = "";
  let value = hash >>> 0;
  for (let index = 0; index < 6; index += 1) {
    output += alphabet[value % alphabet.length];
    value = Math.floor(value / alphabet.length) || ((hash + index * 97) >>> 0);
  }
  return `R-${output}`;
}

function historyEvent(content: ContentItem, event: LineReviewEvent, comment: string | null, now: string): LineReviewHistoryEvent {
  return { id: `line-${event}-${now}`, cycleId: content.lineReview.activeCycleId ?? "", event, comment, occurredAt: now };
}

export function beginReviewCycle(content: ContentItem, cycleId: string, now: string): ContentItem {
  const reviewCode = buildReviewCode(cycleId);
  return {
    ...content,
    localApproval: "pending",
    lineReview: {
      ...content.lineReview,
      status: "queued",
      activeCycleId: cycleId,
      reviewCode,
      lastEventAt: now,
      history: [...content.lineReview.history, { id: `line-queued-${cycleId}`, cycleId, event: "queued", comment: null, occurredAt: now }],
    },
    updatedAt: now,
  };
}

export function applyLineReviewEvent(content: ContentItem, event: LineReviewEvent, now: string, comment: string | null = null, receipt?: string): ContentItem {
  const nextStatus = event === "approved" ? "approved" : event === "correction-requested" ? "correction-requested" : event === "sent" ? "sent" : event === "failed" ? "failed" : "queued";
  const nextHistory = [...content.lineReview.history, historyEvent(content, event, comment, now)];
  return {
    ...content,
    localApproval: event === "approved" ? "approved" : event === "correction-requested" ? "pending" : content.localApproval,
    lineReview: {
      ...content.lineReview,
      status: nextStatus,
      lastEventAt: now,
      providerReceipts: receipt ? [...content.lineReview.providerReceipts, receipt] : content.lineReview.providerReceipts,
      history: nextHistory,
    },
    updatedAt: now,
  };
}

export function resolveCorrection(state: DashboardState, correctionId: string, now: string): DashboardState {
  const correction = state.corrections.find((item) => item.id === correctionId);
  if (!correction) throw new Error("ไม่พบงานที่ต้องแก้");
  if (correction.status === "resolved") return state;
  return {
    ...state,
    corrections: state.corrections.map((item) => item.id === correctionId ? { ...item, status: "resolved", resolvedAt: now } : item),
    contents: state.contents.map((content) => content.id === correction.contentId && content.lineReview.activeCycleId === correction.cycleId
      ? beginReviewCycle(content, `cycle-${content.id}-${now}`, now) : content),
  };
}

export function correctionFromEvent(content: ContentItem, comment: string, now: string): CorrectionRequest {
  return { id: `correction-${content.id}-${now}`, contentId: content.id, cycleId: content.lineReview.activeCycleId ?? "", comment, status: "open", receivedAt: now, resolvedAt: null };
}
