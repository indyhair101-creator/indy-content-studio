import { getLineReview, listLineReviews } from "../../../../features/line-oa/server/line-review-store";
import type { StoredLineReview } from "../../../../features/line-oa/server/line-review-store";

function publicReview(review: StoredLineReview) {
  return { contentId: review.contentId, cycleId: review.cycleId, reviewCode: review.reviewCode, events: review.events,
    recipientMasked: `••••${review.recipientUserId.slice(-4)}` };
}

export async function GET(request: Request): Promise<Response> {
  const code = new URL(request.url).searchParams.get("reviewCode");
  try {
    if (code) {
      const review = await getLineReview(code);
      return Response.json({ reviews: review ? [publicReview(review)] : [] }, { headers: { "Cache-Control": "no-store" } });
    }
    const reviews = await listLineReviews();
    const safeReviews = reviews.map(publicReview);
    return Response.json({ reviews: safeReviews }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "line_reviews_unavailable" }, { status: 503 });
  }
}
