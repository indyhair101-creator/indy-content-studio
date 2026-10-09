import type { DashboardState, LineReviewHistoryEvent } from "../../domain/types";
import { listLineReviews, listUnmatchedLineFeedback, type StoredLineReview, type UnmatchedLineFeedback } from "../../line-oa/server/line-review-store";
import { matchesReviewSnapshot, syncPublicationQueue } from "../../publication/server/approved-publication-queue";
import { NeonDashboardRepository, StaleDashboardStateError, type DashboardSnapshot } from "./neon-dashboard-repository";

/** Project durable events without reapplying decisions already acknowledged by an editor. */
export function mergeLineReviewEvents(state: DashboardState, reviews: StoredLineReview[], unmatched: UnmatchedLineFeedback[] = []): DashboardState {
  let contents = state.contents;
  const corrections = [...state.corrections];
  let changed = false;
  for (const feedback of unmatched) {
    if (corrections.some((item) => item.id === feedback.id)) continue;
    corrections.push({ ...feedback, source: "line-unmatched", contentId: "", cycleId: "", status: "open", resolvedAt: null });
    changed = true;
  }
  const events = reviews.flatMap((review) => review.events.map((event) => ({ review, event })))
    .sort((left, right) => left.event.occurredAt.localeCompare(right.event.occurredAt) || left.event.id.localeCompare(right.event.id));
  const firstDecisions = new Map<string, string>();
  for (const { review, event } of events) {
    if ((event.event === "approved" || event.event === "correction-requested") && !firstDecisions.has(review.reviewCode)) {
      firstDecisions.set(review.reviewCode, event.id);
    }
  }

  for (const { review, event } of events) {
    const eventId = `line-${event.id}`;
    const isDecision = event.event === "approved" || event.event === "correction-requested";
    const isFirstDecision = firstDecisions.get(review.reviewCode) === event.id;
    let correction = corrections.find((item) => item.id === eventId);
    if (event.event === "correction-requested" && isFirstDecision && !correction) {
      correction = {
        id: eventId,
        contentId: review.contentId,
        cycleId: review.cycleId,
        comment: event.comment ?? "",
        status: "open",
        receivedAt: event.occurredAt,
        resolvedAt: null,
      };
      // Keep feedback even when its content was deleted or is not in this snapshot.
      corrections.push(correction);
      changed = true;
    }

    const content = contents.find((item) => item.id === review.contentId);
    if (!content || content.lineReview.history.some((item) => item.id === eventId)) continue;
    const historyEvent: LineReviewHistoryEvent = {
      id: eventId, cycleId: review.cycleId, event: event.event,
      comment: event.comment, occurredAt: event.occurredAt,
    };
    const active = !content.deletedAt && content.lineReview.activeCycleId === review.cycleId;
    const hasDecision = content.lineReview.history.some((item) => item.cycleId === review.cycleId
      && (item.event === "approved" || item.event === "correction-requested"));
    const isCurrent = !content.lineReview.lastEventAt || event.occurredAt >= content.lineReview.lastEventAt
      || isFirstDecision;
    const approved = event.event === "approved" && Boolean(review.snapshot)
      && matchesReviewSnapshot({ ...state, contents }, review.snapshot!);
    const canApply = active && isCurrent && correction?.status !== "resolved"
      && (isDecision ? isFirstDecision : !hasDecision)
      && (event.event !== "approved" || approved);
    contents = contents.map((item) => item.id !== content.id ? item : {
      ...item,
      ...(canApply && event.event === "correction-requested" ? { productionStatus: "needs-changes" as const, localApproval: "pending" as const } : {}),
      ...(canApply && approved ? { localApproval: "approved" as const } : {}),
      lineReview: {
        ...item.lineReview,
        ...(canApply ? { status: event.event, lastEventAt: event.occurredAt } : {}),
        providerReceipts: event.providerReceipt && !item.lineReview.providerReceipts.includes(event.providerReceipt)
          ? [...item.lineReview.providerReceipts, event.providerReceipt] : item.lineReview.providerReceipts,
        history: [...item.lineReview.history, historyEvent],
      },
      // Review metadata must preserve the content revision used by LINE delivery retries.
    });
    changed = true;
  }

  return changed ? { ...state, contents, corrections } : state;
}

type SyncRepository = Pick<NeonDashboardRepository, "loadDashboardState" | "saveDashboardState">;
type SyncDependencies = {
  listReviews?: () => Promise<StoredLineReview[]>;
  listUnmatchedFeedback?: () => Promise<UnmatchedLineFeedback[]>;
  syncQueue?: (state: DashboardState) => Promise<DashboardState>;
};

export async function loadSyncedDashboardState(
  repository: SyncRepository = new NeonDashboardRepository(),
  { listReviews = listLineReviews, listUnmatchedFeedback = listUnmatchedLineFeedback, syncQueue = syncPublicationQueue }: SyncDependencies = {},
): Promise<DashboardSnapshot> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const snapshot = await repository.loadDashboardState();
    const [reviews, unmatched] = await Promise.all([listReviews(), listUnmatchedFeedback()]);
    const next = await syncQueue(mergeLineReviewEvents(snapshot.state, reviews, unmatched));
    if (JSON.stringify(next) === JSON.stringify(snapshot.state)) return snapshot;
    try {
      await repository.saveDashboardState(next, snapshot.version);
      return await repository.loadDashboardState();
    } catch (error) {
      // Rebase projections onto the latest saved edits, never overwrite a stale snapshot.
      if (!(error instanceof StaleDashboardStateError) || attempt === 3) throw error;
    }
  }
  throw new StaleDashboardStateError();
}
