import type { ContentItem } from "../domain/types";

/** Whether the content has evidence that it was sent or published. */
export function isContentSent(content: ContentItem): boolean {
  return content.productionStatus === "published"
    || content.lineReview.status === "sent"
    || content.lineReview.status === "approved"
    || content.schedules.some((schedule) => Boolean(schedule.manualEvidence || schedule.latestAttemptId));
}
