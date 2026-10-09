import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { POST as claimPOST } from "../app/api/make/publications/claim/route";
import { GET as dueGET } from "../app/api/make/publications/due/route";
import { POST as resultPOST } from "../app/api/make/publications/result/route";
import { POST as manualPOST } from "../app/api/make/publications/route";
import { ApprovedPublicationQueue } from "../features/publication/server/approved-publication-queue";
import { NeonDashboardRepository } from "../features/data/server/neon-dashboard-repository";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import { middleware } from "../middleware";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
const request = (path: string, body: unknown, token = "wrong") => new Request(`https://indy.example/api/make/publications${path}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
function configure() { vi.stubEnv("MAKE_API_TOKEN", "queue-secret"); vi.stubEnv("MAKE_PUBLICATION_WEBHOOK_URL", "https://hook.example/queue"); vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost/test"); }

describe("publication queue HTTP boundary", () => {
  it("reports enabled newly queued platforms instead of a disabled platform's previous failure", async () => {
    configure(); const state = createEmptyDashboardState();
    state.contents.push({ id: "content", deletedAt: null, schedules: [
      { platform: "facebook", enabled: false, latestAttemptId: "approved-old" },
      { platform: "instagram", enabled: true, latestAttemptId: "approved-new" },
    ] } as never);
    state.publicationAttempts.push(
      { id: "approved-old", contentId: "content", platform: "facebook", status: "cancelled" } as never,
      { id: "approved-new", contentId: "content", platform: "instagram", status: "queued" } as never,
    );
    vi.spyOn(NeonDashboardRepository.prototype, "loadDashboardState").mockResolvedValue({ state, version: 1 });
    vi.spyOn(ApprovedPublicationQueue.prototype, "enqueueDashboard").mockResolvedValue();
    vi.spyOn(ApprovedPublicationQueue.prototype, "sync").mockResolvedValue(state);
    const response = await manualPOST(request("", { contentId: "content" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ queueId: "approved-new", status: "queued" });
  });
  it("opens only the machine methods while retaining route authentication", async () => {
    configure();
    expect((await middleware(new NextRequest("https://indy.example/api/make/publications/claim", { method: "POST" }))).status).toBe(200);
    expect((await middleware(new NextRequest("https://indy.example/api/make/publications/due"))).status).toBe(200);
    expect((await middleware(new NextRequest("https://indy.example/api/make/publications/claim"))).status).toBe(401);
    expect((await middleware(new NextRequest("https://indy.example/api/make/publications/due", { method: "POST" }))).status).toBe(401);
    expect((await claimPOST(request("/claim", { jobId: "approved-test" }))).status).toBe(401);
    expect((await dueGET(new Request("https://indy.example/api/make/publications/due"))).status).toBe(401);
  });
  it("keeps scoped callback compatibility with both jobId and existing Make attemptId", async () => {
    configure(); const result = vi.spyOn(ApprovedPublicationQueue.prototype, "result").mockResolvedValue();
    const jobId = "approved-test"; const token = createHmac("sha256", "queue-secret").update(`indy-approved-publication-v1\n${jobId}`).digest("base64url");
    for (const key of ["jobId", "attemptId"]) {
      expect((await resultPOST(request("/result", { [key]: jobId, status: "published", providerPublicationId: "provider-post" }, token))).status).toBe(200);
      expect(result).toHaveBeenLastCalledWith(jobId, token, expect.objectContaining({ status: "published", providerPublicationId: "provider-post" }));
    }
    expect((await resultPOST(request("/result", { jobId, status: "published", providerPublicationId: "provider-post" }, "queue-secret"))).status).toBe(401);
  });
  it("does not let a browser-created local plan bypass stored LINE approval", async () => {
    configure(); const state = createEmptyDashboardState();
    state.publicationAttempts.push({ id: "manual", idempotencyKey: "manual", contentId: "absent-content", platform: "facebook", publishAt: "2026-10-02T00:00:00Z", status: "local-plan", queueId: null, providerPublicationId: null, receiptUrl: null, errorCode: null, createdAt: "now", updatedAt: "now" });
    vi.spyOn(NeonDashboardRepository.prototype, "loadDashboardState").mockResolvedValue({ state, version: 1 });
    const response = await manualPOST(request("", { attemptId: "manual" }));
    expect(response.status).toBe(409);
  });
});
