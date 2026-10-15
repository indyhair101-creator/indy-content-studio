import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import type { ContentItem, MediaAsset } from "../features/domain/types";
import { ApprovedPublicationQueue, NeonPublicationQueueStore, matchesReviewSnapshot, type ApprovedPublicationJob, type PublicationQueueStore, type QueueReview } from "../features/publication/server/approved-publication-queue";

const environment = { MAKE_API_TOKEN: "global-secret", MAKE_PUBLICATION_WEBHOOK_URL: "https://hook.example.test/queue", APP_PUBLIC_BASE_URL: "https://indy.example.test", INDY_MEDIA_SIGNING_SECRET: "media-secret" };
afterEach(() => vi.unstubAllEnvs());
function fixture() {
  let now = "2026-10-01T01:00:00.000Z";
  const media: MediaAsset = { id: "video", name: "approved.mp4", mimeType: "video/mp4", size: 123, source: "upload", externalUrl: null, externalPreviewUrl: null, blobKey: null, remoteStatus: "ready", providerFileId: "video-file", previewProviderFileId: "poster", tags: [], createdAt: now, updatedAt: now, deletedAt: null };
  const content: ContentItem = { id: "content", title: "Approved title", categoryId: "category-knowledge", formatId: "format-video", owner: "team", objective: "awareness", priority: "normal", plannedWorkAt: null, lastWorkedAt: null, readyDate: null, productionStatus: "ready", assetIds: [media.id], processSteps: [], caption: "Approved caption", captionSource: null, schedules: ["facebook", "instagram", "tiktok"].map((platform) => ({ platform: platform as "facebook" | "instagram" | "tiktok", enabled: true, publishAt: "2026-10-01T02:00:00.000Z", latestAttemptId: null, manualEvidence: null })), referenceIds: [], notes: "", localApproval: "pending", lineReview: { status: "sent", activeCycleId: "cycle", reviewCode: "R-ABC", providerReceipts: [], lastEventAt: now, history: [] }, createdAt: now, updatedAt: now, deletedAt: null };
  const snapshot = structuredClone({ content, media: [media] });
  const review: QueueReview = { contentId: content.id, cycleId: "cycle", reviewCode: "R-ABC", snapshot, approved: true, approvedAt: now };
  const state = createEmptyDashboardState(); state.contents = [content]; state.media = [media];
  let version = 1;
  const jobs = new Map<string, ApprovedPublicationJob>();
  const store: PublicationQueueStore = {
    loadDashboard: async () => ({ state: structuredClone(state), version }),
    getReview: async (code) => code === review.reviewCode ? structuredClone(review) : null,
    insertJobs: async (next, expectedVersion) => {
      if ((!review.approved && next.some(job => job.approvalSource !== "dashboard")) || version !== expectedVersion) return;
      for (const job of next) if (!jobs.has(job.id) && ![...jobs.values()].some(old => ["queued", "publishing", "published"].includes(job.status) && old.contentId === job.contentId && old.platform === job.platform && old.publishAt === job.publishAt && ["queued", "publishing", "published"].includes(old.status))) jobs.set(job.id, structuredClone(job));
    },
    getJob: async (id) => structuredClone(jobs.get(id) ?? null),
    listJobs: async () => [...jobs.values()].map((job) => structuredClone(job)),
    claimJob: async (id, expectedVersion, claimedAt) => {
      const job = jobs.get(id);
      if (!job || job.status !== "queued" || !job.publishAt || Date.parse(job.publishAt) > Date.parse(claimedAt) || expectedVersion !== version || (!review.approved && job.approvalSource !== "dashboard")) return null;
      job.status = "publishing"; job.updatedAt = claimedAt;
      return structuredClone(job);
    },
    cancelJob: async (id, errorCode, updatedAt, expectedVersion) => { const job = jobs.get(id); if (job?.status === "queued" && (expectedVersion === undefined || expectedVersion === version)) Object.assign(job, { status: "cancelled", errorCode, updatedAt }); },
    recordSignal: async (id, errorCode, updatedAt) => { const job = jobs.get(id); if (job?.status === "queued") Object.assign(job, { signalError: errorCode, updatedAt }); },
    finishJob: async (id, result, updatedAt) => { const job = jobs.get(id); if (job?.status === "publishing") Object.assign(job, result, { updatedAt }); },
  };
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("Accepted", { status: 200 }));
  const queue = new ApprovedPublicationQueue({ store, environment, fetcher, now: () => now });
  return { queue, store, state, snapshot, review, jobs, fetcher, now: (next: string) => { now = next; }, changeVersion: () => { version += 1; } };
}

describe("durable approved publication queue", () => {
  it("never enqueues Salon-only content from either dashboard or LINE approval", async () => {
    const f = fixture();
    f.state.contents[0].schedules = [{ platform: "salon", enabled: true, publishAt: "2026-10-01T02:00:00.000Z", latestAttemptId: null, manualEvidence: null }];
    f.snapshot.content.schedules = structuredClone(f.state.contents[0].schedules);
    f.state.contents[0].localApproval = "approved";
    await expect(f.queue.enqueueDashboard("content")).rejects.toThrow();
    await f.queue.enqueue(f.review);
    expect(f.jobs.size).toBe(0);
    expect(f.fetcher).not.toHaveBeenCalled();
  });

  it("excludes Salon when a mixed-channel item is queued", async () => {
    const f = fixture();
    f.state.contents[0].schedules.push({ platform: "salon", enabled: true, publishAt: "2026-10-01T02:00:00.000Z", latestAttemptId: null, manualEvidence: null });
    f.snapshot.content.schedules = structuredClone(f.state.contents[0].schedules);
    f.state.contents[0].localApproval = "approved";
    await f.queue.enqueueDashboard("content");
    expect([...f.jobs.values()].map(job=>job.platform).sort()).toEqual(["facebook", "instagram", "tiktok"]);
    expect(f.fetcher).toHaveBeenCalledTimes(3);
  });
  it("dispatches dashboard-approved content without creating a LINE approval and remains idempotent", async () => {
    const f = fixture(); f.review.approved = false;
    Object.assign(f.state.contents[0], { localApproval: "approved", lineReview: { ...f.state.contents[0].lineReview, status: "not-sent", activeCycleId: null, reviewCode: null } });
    await f.queue.enqueueDashboard("content");
    await f.queue.enqueueDashboard("content");
    expect(f.jobs.size).toBe(3);
    expect(f.state.contents[0].lineReview.status).toBe("not-sent");
    expect([...f.jobs.values()].every(job => job.approvalSource === "dashboard")).toBe(true);
    f.now("2026-10-01T02:00:00.000Z");
    const due = await f.queue.due(); expect(due).toHaveLength(3);
    const claims = await Promise.all([f.queue.claim(due[0].jobId, due[0].callbackToken), f.queue.claim(due[0].jobId, due[0].callbackToken)]);
    expect(claims.filter(result => result.dispatch)).toHaveLength(1);
    expect(claims.find(result => result.dispatch)).toMatchObject({ caption: "Approved caption", platforms: ["facebook"], mediaUrl: expect.stringContaining("/api/media/provider/") });
    expect((await f.queue.sync(f.state)).contents[0].schedules.every(schedule => schedule.latestAttemptId)).toBe(true);
  });

  it("blocks unfinished dashboard work and cancels queued work if approval or media changes", async () => {
    const f = fixture();
    await expect(f.queue.enqueueDashboard("content")).rejects.toThrow();
    expect(f.jobs.size).toBe(0);
    f.state.contents[0].localApproval = "approved";
    await f.queue.enqueueDashboard("content");
    f.state.contents[0].localApproval = "pending";
    f.now("2026-10-01T02:00:00.000Z");
    expect(await f.queue.due()).toEqual([]);
    expect([...f.jobs.values()].every(job => job.status === "cancelled")).toBe(true);
  });

  it("reuses matching LINE jobs when the dashboard also sends the same clip", async () => {
    const f = fixture(); await f.queue.enqueue(f.review);
    f.state.contents[0].localApproval = "approved";
    await f.queue.enqueueDashboard("content");
    expect(f.jobs.size).toBe(3);
  });
  it("replaces stale LINE authorization with dashboard approval even for the same media and time", async () => {
    const f = fixture(); await f.queue.enqueue(f.review);
    f.state.contents[0].localApproval = "approved";
    f.state.contents[0].lineReview.activeCycleId = "new-line-cycle";
    await f.queue.enqueueDashboard("content");
    expect([...f.jobs.values()].filter(job => job.status === "queued")).toHaveLength(3);
    expect([...f.jobs.values()].filter(job => job.status === "queued").every(job => job.approvalSource === "dashboard")).toBe(true);
  });
  it("frees a stale queue slot before sending edited media at the same publication time", async () => {
    const f = fixture(); await f.queue.enqueue(f.review);
    f.state.contents[0].caption = "New explicitly approved caption";
    f.state.contents[0].localApproval = "approved";
    await f.queue.enqueueDashboard("content");
    const queued = [...f.jobs.values()].filter(job => job.status === "queued");
    expect(queued).toHaveLength(3);
    expect(queued.every(job => job.snapshot.content.caption === "New explicitly approved caption")).toBe(true);
  });
  it("keeps current dashboard jobs visible when a delayed LINE approval creates stale cancelled jobs", async () => {
    const f = fixture();
    f.state.contents[0].title = "New title"; f.state.contents[0].localApproval = "approved";
    await f.queue.enqueueDashboard("content");
    await f.queue.enqueue(f.review);
    const projected = await f.queue.sync(f.state);
    for (const schedule of projected.contents[0].schedules) {
      expect(projected.publicationAttempts.find(attempt => attempt.id === schedule.latestAttemptId)?.status).toBe("queued");
    }
  });
  it("persists three unique platform jobs before signaling and keeps the exact reviewed snapshot", async () => {
    const f = fixture();
    await f.queue.enqueue(f.review); await f.queue.enqueue(f.review);
    expect(f.jobs.size).toBe(3);
    expect([...f.jobs.values()].map((job) => job.platform).sort()).toEqual(["facebook", "instagram", "tiktok"]);
    expect([...f.jobs.values()][0].snapshot.content.caption).toBe("Approved caption");
    const body = JSON.parse(String(f.fetcher.mock.calls[0][1]?.body));
    expect(body).toMatchObject({ jobId: expect.any(String), callbackToken: expect.any(String) });
    expect(body.callbackToken).not.toBe("global-secret");
    expect(body.mediaUrl).toBeUndefined();
  });

  it("does not claim early and gives only one parallel claimant fresh media URLs at due time", async () => {
    const f = fixture(); await f.queue.enqueue(f.review);
    const { jobId, callbackToken } = JSON.parse(String(f.fetcher.mock.calls[0][1]?.body));
    expect(await f.queue.claim(jobId, callbackToken)).toEqual({ dispatch: false, jobId });
    expect(await f.queue.due()).toEqual([]);
    f.now("2026-10-01T02:00:00.000Z");
    const claims = await Promise.all([f.queue.claim(jobId, callbackToken), f.queue.claim(jobId, callbackToken)]);
    expect(claims.filter((claim) => claim.dispatch)).toHaveLength(1);
    const claim = claims.find((item) => item.dispatch)!;
    expect(claim).toMatchObject({ platforms: ["facebook"], title: "Approved title", caption: "Approved caption", scheduledAt: "2026-10-01T02:00:00.000Z", mediaUrl: expect.stringContaining("/api/media/provider/video-file?") });
    if (claim.dispatch) expect(new URL(claim.mediaUrl).searchParams.get("expiresAt")).toBe(String(Date.parse("2026-10-01T02:00:00.000Z") / 1000 + 3600));
    expect(await f.queue.claim(jobId, callbackToken)).toEqual({ dispatch: false, jobId });
  });

  it("rejects wrong tokens and tokens belonging to another job", async () => {
    const f = fixture(); await f.queue.enqueue(f.review);
    const first = JSON.parse(String(f.fetcher.mock.calls[0][1]?.body));
    const second = JSON.parse(String(f.fetcher.mock.calls[1][1]?.body));
    await expect(f.queue.claim(first.jobId, "global-secret")).rejects.toThrow("unauthorized");
    await expect(f.queue.claim(second.jobId, first.callbackToken)).rejects.toThrow("unauthorized");
    await expect(f.queue.result(first.jobId, "wrong", { status: "failed" })).rejects.toThrow("unauthorized");
  });

  it("never queues rejected or stale snapshots, and cancels queued content edited before due", async () => {
    const rejected = fixture(); rejected.review.approved = false;
    await expect(rejected.queue.enqueue(rejected.review)).rejects.toThrow("approved");
    expect(rejected.jobs.size).toBe(0);
    const stale = fixture(); stale.state.contents[0].caption = "Edited after review";
    await expect(stale.queue.enqueue(stale.review)).resolves.toBeUndefined();
    expect([...stale.jobs.values()].every((job) => job.status === "cancelled" && job.errorCode === "STALE_REVIEW")).toBe(true);
    expect(stale.jobs.size).toBe(3); expect(stale.fetcher).not.toHaveBeenCalled();
    const f = fixture(); await f.queue.enqueue(f.review);
    f.state.media[0].providerFileId = "replacement-video";
    f.now("2026-10-01T03:00:00.000Z");
    expect(await f.queue.due()).toEqual([]);
    expect([...f.jobs.values()].every((job) => job.status === "cancelled")).toBe(true);
  });

  it("requires future enabled schedules and exposes missing schedules as failed without dispatch", async () => {
    const f = fixture(); f.state.contents[0].schedules[0].publishAt = null; f.snapshot.content.schedules[0].publishAt = null;
    await f.queue.enqueue(f.review);
    const failed = [...f.jobs.values()].find((job) => job.platform === "facebook")!;
    expect(failed).toMatchObject({ status: "failed", errorCode: "SCHEDULE_REQUIRED", publishAt: null });
    const projected = await f.queue.sync(f.state);
    expect(projected.publicationAttempts.find((attempt) => attempt.id === failed.id)?.status).toBe("failed");
    expect(f.fetcher).toHaveBeenCalledTimes(2);
  });

  it("recovers an uncertain webhook signal through due without retrying a claimed social action", async () => {
    const f = fixture();
    f.fetcher.mockRejectedValue(new DOMException("Timed out", "TimeoutError"));
    await expect(f.queue.enqueue(f.review)).resolves.toBeUndefined();
    expect([...f.jobs.values()].every((job) => job.status === "queued")).toBe(true);
    expect(f.fetcher.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
    f.now("2026-10-01T02:00:00.000Z");
    const due = await f.queue.due(); expect(due).toHaveLength(3);
    await f.queue.claim(due[0].jobId, due[0].callbackToken);
    expect(await f.queue.due()).toHaveLength(2);
  });

  it("requires provider proof and only finalizes the claimed platform without replay regression", async () => {
    const f = fixture(); await f.queue.enqueue(f.review); f.now("2026-10-01T02:00:00.000Z");
    const [job] = await f.queue.due();
    await expect(f.queue.result(job.jobId, job.callbackToken, { status: "published" })).rejects.toThrow("proof");
    await expect(f.queue.result(job.jobId, job.callbackToken, { status: "published", providerPublicationId: "post-before-claim" })).rejects.toThrow("claimed");
    await f.queue.claim(job.jobId, job.callbackToken);
    await f.queue.result(job.jobId, job.callbackToken, { status: "published", providerPublicationId: "social-post" });
    await f.queue.result(job.jobId, job.callbackToken, { status: "failed", errorCode: "late" });
    expect(f.jobs.get(job.jobId)).toMatchObject({ status: "published", providerPublicationId: "social-post" });
    expect([...f.jobs.values()].filter((item) => item.status === "queued")).toHaveLength(2);
  });

  it("ignores review/projection metadata but detects real schedule and asset changes", () => {
    const f = fixture(); f.state.contents[0].lineReview.status = "approved"; f.state.contents[0].schedules[0].latestAttemptId = "new-attempt";
    expect(matchesReviewSnapshot(f.state, f.snapshot)).toBe(true);
    f.state.contents[0].schedules[0].publishAt = "2026-10-02T02:00:00.000Z";
    expect(matchesReviewSnapshot(f.state, f.snapshot)).toBe(false);
  });

  it("interprets legacy local schedule times as Bangkok time on every server", async () => {
    vi.stubEnv("TZ", "UTC");
    const f = fixture();
    f.state.contents[0].schedules[0].publishAt = "2026-10-01T09:00";
    f.snapshot.content.schedules[0].publishAt = "2026-10-01T09:00";
    await f.queue.enqueue(f.review);
    expect([...f.jobs.values()].find((job) => job.platform === "facebook")?.publishAt).toBe("2026-10-01T02:00:00.000Z");
  });

  it("recovers a dashboard version conflict while persisting without losing approved jobs", async () => {
    const f = fixture(); const original = f.store.insertJobs.bind(f.store); let first = true;
    f.store.insertJobs = async (jobs, version) => { if (first) { f.changeVersion(); first = false; } await original(jobs, version); };
    await f.queue.enqueue(f.review);
    expect(f.jobs.size).toBe(3);
  });

  it("never dispatches when dashboard data changed between validation and atomic claim", async () => {
    const f = fixture(); await f.queue.enqueue(f.review); f.now("2026-10-01T02:00:00.000Z");
    const [job] = await f.queue.due(); const original = f.store.claimJob.bind(f.store);
    f.store.claimJob = async (...args) => { f.changeVersion(); return original(...args); };
    expect(await f.queue.claim(job.jobId, job.callbackToken)).toEqual({ dispatch: false, jobId: job.jobId });
    expect(f.jobs.get(job.jobId)?.status).toBe("queued");
  });

  it("verifies an already-created TikTok post without authorizing a second create", async () => {
    const f = fixture(); await f.queue.enqueue(f.review); f.now("2026-10-01T02:00:00.000Z");
    const due = await f.queue.due(); const job = due.find((item) => f.jobs.get(item.jobId)?.platform === "tiktok")!;
    await f.queue.claim(job.jobId, job.callbackToken);
    expect(await f.queue.due()).toHaveLength(2);
    await f.queue.result(job.jobId, job.callbackToken, { status: "publishing", providerPublicationId: "late-post" });
    expect(await f.queue.due()).toHaveLength(3);
    expect(await f.queue.claim(job.jobId, job.callbackToken)).toMatchObject({ dispatch: false, verifyOnly: true, platforms: ["tiktok"], providerPublicationId: "late-post", callbackToken: job.callbackToken });
    expect(f.jobs.get(job.jobId)?.status).toBe("publishing");
    await f.queue.result(job.jobId, job.callbackToken, { status: "published", providerPublicationId: "late-post", receiptUrl: "https://tiktok.example/post" });
    expect(await f.queue.claim(job.jobId, job.callbackToken)).toEqual({ dispatch: false, jobId: job.jobId });
    expect(await f.queue.due()).toHaveLength(2);
  });

  it("cancels deleted content without reintroducing orphan attempts into dashboard backups", async () => {
    const f = fixture(); await f.queue.enqueue(f.review); f.state.contents = [];
    const projected = await f.queue.sync(f.state);
    expect([...f.jobs.values()].every((job) => job.status === "cancelled")).toBe(true);
    expect(projected.publicationAttempts).toEqual([]);
  });

  it("does not cancel current jobs based on a stale dashboard projection input", async () => {
    const f = fixture(); await f.queue.enqueue(f.review);
    const stale = structuredClone(f.state); stale.contents[0].lineReview.activeCycleId = "previous-cycle";
    await f.queue.sync(stale);
    expect([...f.jobs.values()].every((job) => job.status === "queued")).toBe(true);
  });

  it("makes the first persisted terminal review authoritative even in migrated duplicate history", async () => {
    const queries: string[] = [];
    const store = new NeonPublicationQueueStore(async (query) => {
      queries.push(query);
      return [{ content_id: "content", cycle_id: "cycle", review_code: "R-ABC", snapshot: fixture().snapshot, approved: false, approved_at: null }];
    });
    expect((await store.getReview("R-ABC"))?.approved).toBe(false);
    expect(queries[0]).toMatch(/e\.event IN \('approved', 'correction-requested'\) ORDER BY e\.occurred_at ASC, e\.created_at ASC, e\.id ASC LIMIT 1/);
  });

  it("serializes new jobs against dashboard writes without contending independent claims", async () => {
    const queries: string[] = [];
    const store = new NeonPublicationQueueStore(async (query) => { queries.push(query); return []; });
    const f = fixture();
    await f.queue.enqueue(f.review);
    await store.insertJobs([...f.jobs.values()], 1);
    await store.claimJob([...f.jobs.keys()][0], 1, "2026-10-01T02:00:00.000Z");
    expect(queries[0]).toMatch(/WITH revision AS\s*\(/);
    expect(queries[0]).toMatch(/UPDATE dashboard_snapshots SET version = version \+ 1/);
    expect(queries[0]).toMatch(/EXISTS \(SELECT 1 FROM revision\)/);
    expect(queries[1]).toMatch(/^UPDATE approved_publication_jobs/);
    expect(queries[1]).toMatch(/workspace_key = 'primary' AND version = \$2/);
    expect(queries).toHaveLength(2);
  });
});
