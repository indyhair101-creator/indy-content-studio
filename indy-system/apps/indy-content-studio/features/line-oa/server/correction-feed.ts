import { createNeonExecutor, type SqlExecutor } from "../../data/server/neon-client";

export interface RecentCorrection {
  /** Same id the dashboard uses for the correction, so the client can de-duplicate. */
  id: string;
  contentId: string | null;
  contentTitle: string | null;
  comment: string;
  receivedAt: string;
}

const LIMIT = 20;

function iso(value: unknown): string {
  return new Date(value as string | Date).toISOString();
}

/**
 * Small read for the 2-minute alert check: LINE "ไม่ผ่าน" replies newer than `since`.
 * Reads the review tables directly so the full dashboard snapshot is never sent over the wire.
 */
export async function listRecentCorrections({ since, execute = createNeonExecutor() }: { since: string; execute?: SqlExecutor }): Promise<RecentCorrection[]> {
  if (!Number.isFinite(Date.parse(since))) throw new Error("since must be an ISO timestamp");
  const cursor = new Date(since).toISOString();

  const [rejections, unmatched] = await Promise.all([
    execute(
      `SELECT e.id, r.content_id, e.comment, e.occurred_at
         FROM line_review_events e JOIN line_reviews r ON r.review_code = e.review_code
        WHERE e.event = 'correction-requested' AND date_trunc('milliseconds', e.occurred_at) > $1::timestamptz
        ORDER BY e.occurred_at DESC LIMIT $2`,
      [cursor, LIMIT],
    ),
    execute(
      `SELECT id, comment, occurred_at FROM line_unmatched_feedback
        WHERE date_trunc('milliseconds', occurred_at) > $1::timestamptz ORDER BY occurred_at DESC LIMIT $2`,
      [cursor, LIMIT],
    ),
  ]);

  const contentIds = [...new Set(rejections.map((row) => String(row.content_id)))];
  const titles = new Map<string, string>();
  if (contentIds.length) {
    const rows = await execute(
      `SELECT c->>'id' AS id, c->>'title' AS title
         FROM dashboard_snapshots d, jsonb_array_elements(d.state->'contents') c
        WHERE d.workspace_key = $1 AND c->>'id' = ANY($2::text[])`,
      ["primary", contentIds],
    );
    for (const row of rows) titles.set(String(row.id), String(row.title));
  }

  return [
    ...rejections.map((row) => ({
      id: `line-${row.id}`,
      contentId: String(row.content_id),
      contentTitle: titles.get(String(row.content_id)) ?? null,
      comment: String(row.comment ?? ""),
      receivedAt: iso(row.occurred_at),
    })),
    ...unmatched.map((row) => ({ id: String(row.id), contentId: null, contentTitle: null, comment: String(row.comment ?? ""), receivedAt: iso(row.occurred_at) })),
  ].sort((left, right) => right.receivedAt.localeCompare(left.receivedAt)).slice(0, LIMIT);
}
