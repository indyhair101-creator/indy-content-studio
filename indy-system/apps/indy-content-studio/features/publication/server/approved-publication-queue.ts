import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { createNeonExecutor, type SqlExecutor, type SqlRow } from "../../data/server/neon-client";
import { NeonDashboardRepository, type DashboardSnapshot } from "../../data/server/neon-dashboard-repository";
import type { ContentItem, DashboardState, MediaAsset, Platform, PublicationAttempt } from "../../domain/types";
import { createEnvironmentMediaDeliveryUrl } from "../../media/server/media-delivery-url";
import { createBangkokScheduleTimestamp, formatBangkokSchedule } from "../../calendar/schedule-time";
import { getPublicationEligibility } from "../publication-eligibility";

type Environment = Readonly<Record<string, string | undefined>>;
export type ReviewSnapshot = { content: ContentItem; media: MediaAsset[] };
export type ApprovedReviewInput = { contentId: string; cycleId: string; reviewCode: string; snapshot?: ReviewSnapshot };
export type QueueReview = ApprovedReviewInput & { snapshot?: ReviewSnapshot; approved: boolean; approvedAt: string | null };
export type PublicationQueueResult = { status: "publishing" | "published" | "failed" | "cancelled"; providerPublicationId?: string | null; receiptUrl?: string | null; errorCode?: string | null };
export type ApprovedPublicationJob = {
  approvalSource?: "line" | "dashboard";
  id: string; contentId: string; cycleId: string; reviewCode: string; platform: Platform;
  publishAt: string | null; snapshot: ReviewSnapshot; status: PublicationQueueResult["status"] | "queued";
  providerPublicationId: string | null; receiptUrl: string | null; errorCode: string | null; signalError: string | null;
  createdAt: string; updatedAt: string;
};
export interface PublicationQueueStore {
  loadDashboard(): Promise<DashboardSnapshot>;
  getReview(reviewCode: string): Promise<QueueReview | null>;
  insertJobs(jobs: ApprovedPublicationJob[], expectedVersion: number): Promise<void>;
  getJob(id: string): Promise<ApprovedPublicationJob | null>;
  listJobs(): Promise<ApprovedPublicationJob[]>;
  claimJob(id: string, expectedVersion: number, now: string): Promise<ApprovedPublicationJob | null>;
  cancelJob(id: string, errorCode: string, now: string, expectedVersion: number): Promise<void>;
  recordSignal(id: string, errorCode: string | null, now: string): Promise<void>;
  finishJob(id: string, result: PublicationQueueResult, now: string): Promise<void>;
}
export class PublicationQueueError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

const platforms: Platform[] = ["facebook", "instagram", "tiktok"];
function publicationContent(content: ContentItem) {
  return { id: content.id, title: content.title, caption: content.caption, formatId: content.formatId, assetIds: content.assetIds,
    schedules: platforms.map((platform) => { const schedule = content.schedules.find((item) => item.platform === platform); return { platform, enabled: schedule?.enabled ?? false, publishAt: schedule?.publishAt ?? null }; }) };
}
function publicationMedia(asset: MediaAsset | undefined) {
  return asset ? { id: asset.id, name: asset.name, mimeType: asset.mimeType, size: asset.size, source: asset.source, externalUrl: asset.externalUrl, externalPreviewUrl: asset.externalPreviewUrl, providerFileId: asset.providerFileId, previewProviderFileId: asset.previewProviderFileId, remoteStatus: asset.remoteStatus, deletedAt: asset.deletedAt } : null;
}
export function matchesReviewSnapshot(state: DashboardState, snapshot: ReviewSnapshot): boolean {
  const current = state.contents.find((content) => content.id === snapshot.content.id && !content.deletedAt);
  return Boolean(current && JSON.stringify(publicationContent(current)) === JSON.stringify(publicationContent(snapshot.content)) &&
    snapshot.media.every((asset) => JSON.stringify(publicationMedia(state.media.find((currentAsset) => currentAsset.id === asset.id))) === JSON.stringify(publicationMedia(asset))));
}
function tokenForJob(jobId: string, environment: Environment): string {
  const secret = environment.MAKE_PUBLICATION_SIGNING_SECRET || environment.MAKE_API_TOKEN;
  if (!secret) throw new PublicationQueueError("Make signing secret is unavailable", 503);
  return createHmac("sha256", secret).update(`indy-approved-publication-v1\n${jobId}`).digest("base64url");
}
export function verifyPublicationJobToken(jobId: string, token: string, environment: Environment = process.env): boolean {
  const expected = Buffer.from(tokenForJob(jobId, environment)); const received = Buffer.from(token);
  return received.length === expected.length && timingSafeEqual(received, expected);
}
function validMedia(snapshot: ReviewSnapshot): boolean {
  const asset = snapshot.media.find((item) => item.id === snapshot.content.assetIds[0]);
  return snapshot.content.assetIds.length === 1 && Boolean(asset && !asset.deletedAt && asset.remoteStatus === "ready" && asset.mimeType === "video/mp4" && (asset.providerFileId || (asset.source === "external" && asset.externalUrl && /^https:\/\//.test(asset.externalUrl))));
}
function scheduleTimestamp(value: string | null): number {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return NaN;
  try {
    if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(value)) return Date.parse(value);
    const parts = formatBangkokSchedule(value);
    return Date.parse(createBangkokScheduleTimestamp(parts.date, parts.time));
  } catch { return NaN; }
}
type ClaimResult = { dispatch: false; jobId: string } | { dispatch: false; verifyOnly: true; jobId: string; platforms: Platform[]; providerPublicationId: string; callbackToken: string; callbackUrl: string } | { dispatch: true; jobId: string; attemptId: string; contentId: string; platform: Platform; platforms: Platform[]; title: string; caption: string; mediaUrl: string; scheduledAt: string; callbackToken: string; callbackUrl: string };

export class ApprovedPublicationQueue {
  private readonly store: PublicationQueueStore;
  private readonly environment: Environment;
  private readonly fetcher: typeof fetch;
  private readonly now: () => string;
  constructor(options: { store?: PublicationQueueStore; execute?: SqlExecutor; environment?: Environment; fetcher?: typeof fetch; now?: () => string } = {}) {
    this.store = options.store ?? new NeonPublicationQueueStore(options.execute);
    this.environment = options.environment ?? process.env; this.fetcher = options.fetcher ?? fetch; this.now = options.now ?? (() => new Date().toISOString());
  }

  /** Only called by the authenticated dashboard action; approval is persisted with the immutable job. */
  async enqueueDashboard(contentId: string): Promise<void> {
    for (let retry = 0; retry < 3; retry += 1) {
      const dashboard = await this.store.loadDashboard();
      const content = dashboard.state.contents.find(item => item.id === contentId && !item.deletedAt);
      if (!content) throw new PublicationQueueError("ไม่พบคอนเทนต์", 409);
      const now = this.now();
      const schedules = content.schedules.filter(schedule => schedule.enabled && schedule.platform !== "salon");
      const reasons = schedules.flatMap(schedule => getPublicationEligibility(dashboard.state, contentId, schedule.platform, now).reasons);
      if (!schedules.length) reasons.push("ยังไม่ได้เปิดกำหนดการของช่องทางใด");
      if (reasons.length) throw new PublicationQueueError([...new Set(reasons)].join(" · "), 409);
      const snapshot: ReviewSnapshot = structuredClone({ content, media: dashboard.state.media.filter(asset => content.assetIds.includes(asset.id)) });
      if (!validMedia(snapshot)) throw new PublicationQueueError("กรุณาเลือกวิดีโอ MP4 ที่พร้อมใช้งานหนึ่งไฟล์", 409);
      const cycleId = `dashboard-${createHash("sha256").update(JSON.stringify({ content: publicationContent(content), media: snapshot.media.map(publicationMedia) })).digest("hex").slice(0, 40)}`;
      const existing = await this.currentJobs(dashboard);
      const jobs = schedules.map(schedule => existing.find(job => job.contentId === contentId && job.platform === schedule.platform
        && ["queued", "publishing", "published"].includes(job.status) && matchesReviewSnapshot(dashboard.state, job.snapshot)) ?? {
        id: `approved-${createHash("sha256").update(JSON.stringify([contentId, cycleId, schedule.platform])).digest("hex").slice(0, 40)}`,
        approvalSource: "dashboard" as const, contentId, cycleId, reviewCode: "", platform: schedule.platform,
        publishAt: new Date(scheduleTimestamp(schedule.publishAt)).toISOString(), snapshot, status: "queued" as const,
        errorCode: null, signalError: null, providerPublicationId: null, receiptUrl: null, createdAt: now, updatedAt: now,
      });
      await this.store.insertJobs(jobs.filter(job => !existing.some(old => old.id === job.id)), dashboard.version);
      const stored = await Promise.all(jobs.map(job => this.store.getJob(job.id)));
      if (stored.some(job => !job)) continue;
      if (stored.some(job => job?.status === "failed" || job?.status === "cancelled")) throw new PublicationQueueError("คิวเดิมจบแล้ว กรุณาตรวจผลและเปลี่ยนกำหนดการก่อนส่งรอบใหม่", 409);
      await Promise.all(stored.map(async job => { if (job?.status === "queued") await this.signal(job); }));
      return;
    }
    throw new PublicationQueueError("ข้อมูลเปลี่ยนระหว่างส่ง กรุณาโหลดใหม่แล้วลองอีกครั้ง", 409);
  }

  async enqueue(input: ApprovedReviewInput): Promise<void> {
    const review = await this.store.getReview(input.reviewCode);
    if (!review?.approved || !review.snapshot || review.contentId !== input.contentId || review.cycleId !== input.cycleId) throw new PublicationQueueError("A stored approved review snapshot is required", 409);
    const now = this.now(); const enabled = review.snapshot.content.schedules.filter((schedule) => schedule.enabled && schedule.platform !== "salon");
    if (!enabled.length && review.snapshot.content.schedules.some(schedule => schedule.enabled && schedule.platform === "salon")) return;
    const schedules = enabled.length ? enabled : platforms.map((platform) => ({ platform, publishAt: null }));
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const dashboard = await this.store.loadDashboard();
      const stale = !this.matchesCurrentReview(dashboard.state, review);
      const existing = await this.currentJobs(dashboard);
      const jobs: ApprovedPublicationJob[] = schedules.map((schedule) => {
        const shared = !stale && existing.find(job => job.contentId === review.contentId && job.platform === schedule.platform
          && ["queued", "publishing", "published"].includes(job.status) && matchesReviewSnapshot(dashboard.state, job.snapshot));
        if (shared) return shared;
        const parsedAt = scheduleTimestamp(schedule.publishAt);
        const errorCode = stale ? "STALE_REVIEW" : !enabled.length ? "NO_ENABLED_SCHEDULE" : !Number.isFinite(parsedAt) ? "SCHEDULE_REQUIRED" : parsedAt <= Date.parse(review.approvedAt ?? now) ? "SCHEDULE_NOT_FUTURE" : !validMedia(review.snapshot!) ? "MP4_REQUIRED" : null;
        const id = `approved-${createHash("sha256").update(JSON.stringify([review.contentId, review.cycleId, schedule.platform])).digest("hex").slice(0, 40)}`;
        return { id, contentId: review.contentId, cycleId: review.cycleId, reviewCode: review.reviewCode, platform: schedule.platform, publishAt: Number.isFinite(parsedAt) ? new Date(parsedAt).toISOString() : null, snapshot: structuredClone(review.snapshot!), status: stale ? "cancelled" : errorCode ? "failed" : "queued", errorCode, signalError: null, providerPublicationId: null, receiptUrl: null, createdAt: now, updatedAt: now };
      });
      await this.store.insertJobs(jobs.filter(job => !existing.some(old => old.id === job.id)), dashboard.version);
      const storedJobs = await Promise.all(jobs.map((job) => this.store.getJob(job.id)));
      if (storedJobs.some((job) => !job)) continue;
      if (stale) { await Promise.all(jobs.map((job) => this.store.cancelJob(job.id, "STALE_REVIEW", now, dashboard.version))); return; }
      // Persist every platform first: a timeout must never lose the work or cause a duplicate social action.
      await Promise.all(storedJobs.map(async (job) => { if (job?.status === "queued") await this.signal(job); }));
      return;
    }
    throw new PublicationQueueError("Approved queue changed while saving; retry safely", 503);
  }

  private matchesCurrentReview(state: DashboardState, review: QueueReview): boolean {
    const content = state.contents.find((item) => item.id === review.contentId);
    return Boolean(review.approved && review.snapshot && content?.lineReview.activeCycleId === review.cycleId && matchesReviewSnapshot(state, review.snapshot));
  }
  private async matchesCurrentJob(state: DashboardState, job: ApprovedPublicationJob): Promise<boolean> {
    if (!matchesReviewSnapshot(state, job.snapshot)) return false;
    if (job.approvalSource === "dashboard") {
      const content = state.contents.find(item => item.id === job.contentId && !item.deletedAt);
      return Boolean(content?.localApproval === "approved" && content.productionStatus === "ready"
        && content.processSteps.every(step => step.status === "done") && validMedia(job.snapshot));
    }
    const review = await this.store.getReview(job.reviewCode);
    return Boolean(review && this.matchesCurrentReview(state, review));
  }
  private async currentJobs(dashboard: DashboardSnapshot): Promise<ApprovedPublicationJob[]> {
    const jobs = await this.store.listJobs();
    for (const job of jobs) if (job.status === "queued" && !await this.matchesCurrentJob(dashboard.state, job)) {
      await this.store.cancelJob(job.id, "REVIEW_CHANGED", this.now(), dashboard.version);
    }
    return this.store.listJobs();
  }
  private async signal(job: ApprovedPublicationJob): Promise<void> {
    let errorCode: string | null = null;
    try {
      if (!this.environment.MAKE_PUBLICATION_WEBHOOK_URL) throw new Error("missing webhook");
      const response = await this.fetcher(this.environment.MAKE_PUBLICATION_WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId: job.id, callbackToken: tokenForJob(job.id, this.environment) }), signal: AbortSignal.timeout(10_000) });
      if (!response.ok) errorCode = `MAKE_SIGNAL_${response.status}`;
    } catch { errorCode = "MAKE_SIGNAL_UNCONFIRMED"; }
    await this.store.recordSignal(job.id, errorCode, this.now());
  }

  async claim(jobId: string, callbackToken: string): Promise<ClaimResult> {
    if (!verifyPublicationJobToken(jobId, callbackToken, this.environment)) throw new PublicationQueueError("unauthorized", 401);
    const job = await this.store.getJob(jobId); const idle: ClaimResult = { dispatch: false, jobId };
    if (job?.status === "publishing" && job.platform === "tiktok" && job.providerPublicationId) {
      await this.store.finishJob(job.id, { status: "publishing" }, this.now());
      return { dispatch: false, verifyOnly: true, jobId, platforms: ["tiktok"], providerPublicationId: job.providerPublicationId, callbackToken, callbackUrl: new URL("/api/make/publications/result", this.environment.APP_PUBLIC_BASE_URL).toString() };
    }
    if (!job || job.status !== "queued") return idle;
    const dashboard = await this.store.loadDashboard();
    if (!await this.matchesCurrentJob(dashboard.state, job)) {
      await this.store.cancelJob(job.id, "REVIEW_CHANGED", this.now(), dashboard.version); return idle;
    }
    const now = this.now();
    if (!job.publishAt || Date.parse(job.publishAt) > Date.parse(now)) return idle;
    const asset = job.snapshot.media.find((item) => item.id === job.snapshot.content.assetIds[0])!;
    const mediaUrl = asset.providerFileId ? createEnvironmentMediaDeliveryUrl({ fileId: asset.providerFileId, purpose: "original", environment: this.environment, now: () => Math.floor(Date.parse(now) / 1000), ttlSeconds: 3600 }) : asset.externalUrl!;
    const callbackUrl = new URL("/api/make/publications/result", this.environment.APP_PUBLIC_BASE_URL).toString();
    // This atomic update is the only transition that authorizes a social post. Never reclaim publishing jobs.
    if (!await this.store.claimJob(job.id, dashboard.version, now)) return idle;
    return { dispatch: true, jobId, attemptId: jobId, contentId: job.contentId, platform: job.platform, platforms: [job.platform], title: job.snapshot.content.title, caption: job.snapshot.content.caption.trim(), mediaUrl, scheduledAt: now, callbackUrl, callbackToken };
  }

  async due(): Promise<Array<{ jobId: string; callbackToken: string }>> {
    const jobs = (await this.store.listJobs()).filter((job) => job.status === "queued" || (job.status === "publishing" && job.platform === "tiktok" && job.providerPublicationId)).sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));
    if (!jobs.length) return [];
    const { state, version } = await this.store.loadDashboard(); const result = [];
    for (const job of jobs) {
      if (job.status === "publishing") { result.push({ jobId: job.id, callbackToken: tokenForJob(job.id, this.environment) }); continue; }
      if (!await this.matchesCurrentJob(state, job)) { await this.store.cancelJob(job.id, "REVIEW_CHANGED", this.now(), version); continue; }
      if (job.publishAt && Date.parse(job.publishAt) <= Date.parse(this.now())) result.push({ jobId: job.id, callbackToken: tokenForJob(job.id, this.environment) });
    }
    return result.slice(0, 100);
  }

  async result(jobId: string, token: string, result: PublicationQueueResult): Promise<void> {
    if (!verifyPublicationJobToken(jobId, token, this.environment)) throw new PublicationQueueError("unauthorized", 401);
    if (!["publishing", "published", "failed", "cancelled"].includes(result.status)) throw new PublicationQueueError("Invalid publication status", 400);
    if (result.status === "published" && !result.providerPublicationId?.trim() && !result.receiptUrl?.trim()) throw new PublicationQueueError("Published result requires provider proof", 400);
    const job = await this.store.getJob(jobId);
    if (!job) throw new PublicationQueueError("Publication job not found", 404);
    if (["published", "failed", "cancelled"].includes(job.status)) return;
    if (job.status !== "publishing") throw new PublicationQueueError("Publication job has not been claimed", 409);
    await this.store.finishJob(jobId, result, this.now());
  }

  async sync(state: DashboardState): Promise<DashboardState> {
    let jobs = await this.store.listJobs();
    const dashboard = jobs.some((job) => job.status === "queued") ? await this.store.loadDashboard() : null;
    for (const job of jobs) if (job.status === "queued") {
      if (dashboard && !await this.matchesCurrentJob(dashboard.state, job)) await this.store.cancelJob(job.id, "REVIEW_CHANGED", this.now(), dashboard.version);
    }
    jobs = await this.store.listJobs();
    const attempts = new Map(state.publicationAttempts.map((attempt) => [attempt.id, attempt]));
    for (const job of jobs) if (state.contents.some((content) => content.id === job.contentId)) attempts.set(job.id, { id: job.id, idempotencyKey: job.id, contentId: job.contentId, platform: job.platform, publishAt: job.publishAt ?? "", status: job.status, queueId: job.id, providerPublicationId: job.providerPublicationId, receiptUrl: job.receiptUrl, errorCode: job.errorCode ?? job.signalError, createdAt: job.createdAt, updatedAt: job.updatedAt } satisfies PublicationAttempt);
    return { ...state, publicationAttempts: [...attempts.values()], contents: state.contents.map((content) => ({ ...content, schedules: content.schedules.map((schedule) => {
      const candidates = [...jobs].reverse().filter(item => item.contentId === content.id && item.platform === schedule.platform);
      const job = candidates.find(item => ["queued", "publishing", "published"].includes(item.status) && matchesReviewSnapshot(state, item.snapshot))
        ?? candidates.find(item => item.approvalSource === "dashboard" ? matchesReviewSnapshot(state, item.snapshot) : item.cycleId === content.lineReview.activeCycleId);
      return job ? { ...schedule, latestAttemptId: job.id } : schedule;
    }) })) };
  }
}

// First terminal decision wins, including legacy histories with duplicate decisions.
const approvedDecision = `(SELECT e.event FROM line_review_events e WHERE e.review_code = r.review_code AND e.event IN ('approved', 'correction-requested') ORDER BY e.occurred_at ASC, e.created_at ASC, e.id ASC LIMIT 1) = 'approved'`;
function hydrateJob(row: SqlRow): ApprovedPublicationJob {
  const timestamp = (value: unknown) => value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
  return { approvalSource: row.approval_source === "dashboard" ? "dashboard" : "line", id: String(row.id), contentId: String(row.content_id), cycleId: String(row.cycle_id), reviewCode: row.review_code ? String(row.review_code) : "", platform: row.platform as Platform, publishAt: row.publish_at ? timestamp(row.publish_at) : null, snapshot: row.snapshot as ReviewSnapshot, status: row.status as ApprovedPublicationJob["status"], providerPublicationId: row.provider_publication_id as string | null, receiptUrl: row.receipt_url as string | null, errorCode: row.error_code as string | null, signalError: row.signal_error as string | null, createdAt: timestamp(row.created_at), updatedAt: timestamp(row.updated_at) };
}
export class NeonPublicationQueueStore implements PublicationQueueStore {
  private readonly execute: SqlExecutor;
  constructor(execute?: SqlExecutor) { this.execute = execute ?? createNeonExecutor(); }
  loadDashboard(): Promise<DashboardSnapshot> { return new NeonDashboardRepository({ execute: this.execute }).loadDashboardState(); }
  async getReview(reviewCode: string): Promise<QueueReview | null> {
    const rows = await this.execute(`SELECT r.content_id, r.cycle_id, r.review_code, r.snapshot, (${approvedDecision}) AS approved,
      (SELECT e.occurred_at FROM line_review_events e WHERE e.review_code = r.review_code AND e.event = 'approved' ORDER BY e.occurred_at ASC, e.created_at ASC, e.id ASC LIMIT 1) AS approved_at
      FROM line_reviews r WHERE r.review_code = $1`, [reviewCode]);
    const row = rows[0]; return row ? { contentId: String(row.content_id), cycleId: String(row.cycle_id), reviewCode: String(row.review_code), snapshot: row.snapshot as ReviewSnapshot | undefined, approved: row.approved === true, approvedAt: row.approved_at ? new Date(String(row.approved_at)).toISOString() : null } : null;
  }
  async insertJobs(jobs: ApprovedPublicationJob[], expectedVersion: number): Promise<void> {
    if (!jobs.length) return;
    const job = jobs[0];
    await this.execute(`WITH revision AS (
      UPDATE dashboard_snapshots SET version = version + 1, updated_at = now()
      WHERE workspace_key = 'primary' AND version = $6 RETURNING version
    )
      INSERT INTO approved_publication_jobs (id, content_id, cycle_id, review_code, platform, publish_at, snapshot, status, error_code, created_at, updated_at, approval_source)
      SELECT j.id, $2, $3, $4, j.platform, j.publish_at, $5::jsonb, j.status, j.error_code, j.created_at, j.updated_at, $7
      FROM jsonb_to_recordset($1::jsonb) AS j(id text, platform text, publish_at timestamptz, status text, error_code text, created_at timestamptz, updated_at timestamptz)
      WHERE EXISTS (SELECT 1 FROM revision)
        AND ($7 = 'dashboard' OR EXISTS (SELECT 1 FROM line_reviews r WHERE r.review_code = $4 AND r.content_id = $2 AND r.cycle_id = $3 AND r.snapshot = $5::jsonb AND ${approvedDecision}))
      ON CONFLICT DO NOTHING`, [JSON.stringify(jobs.map((item) => ({ id: item.id, platform: item.platform, publish_at: item.publishAt, status: item.status, error_code: item.errorCode, created_at: item.createdAt, updated_at: item.updatedAt }))), job.contentId, job.cycleId, job.reviewCode || null, JSON.stringify(job.snapshot), expectedVersion, job.approvalSource ?? "line"]);
  }
  async getJob(id: string): Promise<ApprovedPublicationJob | null> { const rows = await this.execute("SELECT * FROM approved_publication_jobs WHERE id = $1", [id]); return rows[0] ? hydrateJob(rows[0]) : null; }
  async listJobs(): Promise<ApprovedPublicationJob[]> { return (await this.execute("SELECT * FROM approved_publication_jobs ORDER BY created_at, id", [])).map(hydrateJob); }
  async claimJob(id: string, expectedVersion: number, now: string): Promise<ApprovedPublicationJob | null> {
    const rows = await this.execute(`UPDATE approved_publication_jobs j SET status = 'publishing', claimed_at = $3::timestamptz, updated_at = $3::timestamptz, signal_error = NULL
      WHERE j.id = $1 AND j.status = 'queued' AND j.publish_at <= $3::timestamptz
        AND EXISTS (SELECT 1 FROM dashboard_snapshots WHERE workspace_key = 'primary' AND version = $2)
        AND (j.approval_source = 'dashboard' OR EXISTS (SELECT 1 FROM line_reviews r WHERE r.review_code = j.review_code AND r.snapshot = j.snapshot AND ${approvedDecision}))
      RETURNING j.*`, [id, expectedVersion, now]);
    return rows[0] ? hydrateJob(rows[0]) : null;
  }
  async cancelJob(id: string, errorCode: string, now: string, expectedVersion: number): Promise<void> { await this.execute("UPDATE approved_publication_jobs SET status = 'cancelled', error_code = $2, updated_at = $3::timestamptz WHERE id = $1 AND status = 'queued' AND EXISTS (SELECT 1 FROM dashboard_snapshots WHERE workspace_key = 'primary' AND version = $4)", [id, errorCode, now, expectedVersion]); }
  async recordSignal(id: string, errorCode: string | null, now: string): Promise<void> { await this.execute("UPDATE approved_publication_jobs SET signal_error = $2, signaled_at = CASE WHEN $2::text IS NULL THEN $3::timestamptz ELSE signaled_at END, updated_at = $3::timestamptz WHERE id = $1 AND status = 'queued'", [id, errorCode, now]); }
  async finishJob(id: string, result: PublicationQueueResult, now: string): Promise<void> { await this.execute("UPDATE approved_publication_jobs SET status = $2, provider_publication_id = COALESCE($3, provider_publication_id), receipt_url = COALESCE($4, receipt_url), error_code = $5, updated_at = $6::timestamptz WHERE id = $1 AND status = 'publishing'", [id, result.status, result.providerPublicationId ?? null, result.receiptUrl ?? null, result.errorCode ?? null, now]); }
}

export async function enqueueApprovedReview(review: ApprovedReviewInput): Promise<void> { await new ApprovedPublicationQueue().enqueue(review); }
export async function syncPublicationQueue(state: DashboardState): Promise<DashboardState> { return new ApprovedPublicationQueue().sync(state); }
