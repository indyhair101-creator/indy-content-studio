// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import type { ContentItem, DashboardState, MediaAsset } from "../features/domain/types";
import type { SqlExecutor } from "../features/data/server/neon-client";
import { LineDeliveryService } from "../features/line-oa/server/line-delivery-service";

const updatedAt = "2026-09-22T12:00:00.000Z";
const recipientUserId = "U0123456789abcdef";
const retryUuid = "00000000-0000-4000-8000-000000000001";
const environment = {
  APP_PUBLIC_BASE_URL: "https://indy.example",
  INDY_MEDIA_SIGNING_SECRET: "media-signing-secret",
  LINE_CHANNEL_ACCESS_TOKEN: "line-access-token",
};
type TestFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function contentItem(input: { caption?: string; assetIds?: string[]; updatedAt?: string } = {}): ContentItem {
  return {
    id: "content-1",
    title: "Test content",
    categoryId: "category-1",
    formatId: "format-1",
    owner: "owner",
    objective: "awareness",
    priority: "normal",
    plannedWorkAt: null,
    lastWorkedAt: null,
    readyDate: null,
    productionStatus: "ready",
    assetIds: input.assetIds ?? ["asset-1"],
    processSteps: [],
    caption: input.caption ?? "Authoritative caption",
    captionSource: null,
    schedules: [],
    referenceIds: [],
    notes: "",
    localApproval: "approved",
    lineReview: { status: "not-sent", activeCycleId: null, reviewCode: null, providerReceipts: [], lastEventAt: null, history: [] },
    createdAt: updatedAt,
    updatedAt: input.updatedAt ?? updatedAt,
    deletedAt: null,
  };
}

function mediaAsset(input: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: "asset-1",
    name: "photo.jpg",
    mimeType: "image/jpeg",
    size: 10,
    source: "upload",
    externalUrl: null,
    externalPreviewUrl: null,
    blobKey: "asset-1",
    remoteStatus: "ready",
    providerFileId: "drive-original",
    previewProviderFileId: null,
    tags: [],
    createdAt: updatedAt,
    updatedAt,
    deletedAt: null,
    ...input,
  };
}

function stateFor(content = contentItem(), media = [mediaAsset()]): DashboardState {
  return { ...createEmptyDashboardState(), contents: [content], media };
}

function memoryDeliveryDatabase(createdAt = updatedAt) {
  const rows = new Map<string, {
    id: string;
    idempotency_key: string;
    status: "queued" | "sent" | "failed";
    sent_at: string | null;
    error_category: string | null;
    created_at: string;
    attempt_count: number;
  }>();
  const execute = vi.fn<SqlExecutor>(async (query, params) => {
    if (query.includes("INSERT INTO line_deliveries")) {
      const key = String(params[1]);
      const existing = rows.get(key);
      if (existing) {
        if (existing.status !== "sent") {
          existing.status = "queued";
          existing.error_category = null;
          existing.attempt_count += 1;
        }
        return [{ ...existing }];
      }
      const created = {
        id: String(params[0]),
        idempotency_key: key,
        status: "queued" as const,
        sent_at: null,
        error_category: null,
        created_at: createdAt,
        attempt_count: 1,
      };
      rows.set(key, created);
      return [{ ...created }];
    }

    const id = String(params[0]);
    const row = [...rows.values()].find((item) => item.id === id);
    if (!row) return [];
    if (row.status === "sent") return [];
    if (query.includes("status = 'sent'")) {
      row.status = "sent";
      row.error_category = null;
      row.sent_at = updatedAt;
    } else {
      row.status = "failed";
      row.error_category = String(params[1]);
    }
    return [{ ...row }];
  });
  return { execute, rows };
}

function service(options: {
  content?: ContentItem;
  media?: MediaAsset[];
  recipient?: string | null;
  fetcher?: TestFetcher;
  databaseCreatedAt?: string;
  now?: () => number;
} = {}) {
  const database = memoryDeliveryDatabase(options.databaseCreatedAt);
  const state = stateFor(options.content ?? contentItem(), options.media ?? [mediaAsset()]);
  const fetcher = options.fetcher ?? vi.fn<TestFetcher>(async () => new Response("{}", { status: 200 }));
  let savedState = state;
  const reviews = new Map<string, any>();
  const reviewStore = {
    registerLineReview: async (review: any) => {
      if (!reviews.has(review.reviewCode)) reviews.set(review.reviewCode, structuredClone({ ...review, events: [], handledWebhookEventIds: [] }));
      return reviews.get(review.reviewCode);
    },
    beginLineReviewSend: async () => "begun" as const,
    finishLineReviewSend: async () => undefined,
    restorePreviousLineReview: async () => undefined,
    appendLineReviewEvent: async () => null,
  };
  const instance = new LineDeliveryService({
    loadDashboardSnapshot: async () => ({ state: savedState, version: 1 }),
    saveDashboardState: async (next: DashboardState) => { savedState = next; return { version: 2 }; },
    reviewStore,
    getActiveRecipient: async () => options.recipient === undefined ? recipientUserId : options.recipient,
    execute: database.execute,
    fetcher,
    environment,
    now: options.now ?? (() => Date.parse(updatedAt)),
    generateId: () => retryUuid,
  });
  return { instance, database, fetcher, state, reviews, savedState: () => savedState };
}

function send(instance: LineDeliveryService, content = contentItem()) {
  return instance.sendContentToLine({ contentId: content.id, expectedUpdatedAt: content.updatedAt, actorId: "primary-admin" });
}

describe("server-owned LINE delivery", () => {
  it("delivers a 1 GB video as a signed original link with its poster and keeps the review actionable", async () => {
    const fetcher = vi.fn<TestFetcher>(async () => new Response("{}", { status: 200 }));
    const video = mediaAsset({ mimeType: "video/mp4", name: "large.mp4", size: 1_073_741_824, providerFileId: "drive-large-video", previewProviderFileId: "drive-poster" });
    const setup = service({ media: [video], fetcher });
    const result = await send(setup.instance);
    const request = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)) as { messages: Array<Record<string, string>> };
    expect(result.status).toBe("sent");
    expect(request.messages[0]).toMatchObject({ type: "image", originalContentUrl: expect.stringContaining("drive-poster"), previewImageUrl: expect.stringContaining("drive-poster") });
    expect(request.messages.some(message => message.type === "video")).toBe(false);
    expect(request.messages).toContainEqual({ type: "text", text: expect.stringMatching(/ดูคลิปต้นฉบับ: https:\/\/indy\.example\/api\/media\/provider\/drive-large-video.*signature=/) });
    expect(request.messages.at(-1)?.text).toContain("ผ่าน");
    expect(request.messages.at(-1)?.text).toContain("ไม่ผ่าน");
    expect(request.messages.length).toBeLessThanOrEqual(5);
    expect(setup.savedState().contents[0].lineReview.status).toBe("sent");
    expect([...setup.reviews.values()][0].snapshot.media[0].size).toBe(1_073_741_824);
  });
  it("persists the server review cycle, one exact selected asset, and both Thai decisions", async () => {
    const setup = service({ media: [mediaAsset(), mediaAsset({id:"asset-2"})] });
    const delivered = await send(setup.instance);
    const review = [...setup.reviews.values()][0];
    expect(delivered).toMatchObject({ review: { contentId: "content-1", cycleId: retryUuid } });
    expect(review.snapshot.content.assetIds).toEqual(["asset-1"]);
    expect(review.snapshot.media.map((asset: MediaAsset) => asset.id)).toEqual(["asset-1"]);
    expect(setup.savedState().contents[0].lineReview.status).toBe("sent");
    expect(setup.savedState().contents[0].lineReview.activeCycleId).toBe(retryUuid);
    const messages = JSON.parse(String(vi.mocked(setup.fetcher).mock.calls[0][1]?.body)).messages;
    expect(messages[2].text).toContain("ผ่าน");
    expect(messages[2].text).toContain("ไม่ผ่าน");
  });
  it("rejects multiple assigned assets instead of dropping an unreviewed clip", async () => {
    const setup = service({content:contentItem({assetIds:["asset-1","asset-2"]}),media:[mediaAsset(),mediaAsset({id:"asset-2"})]});
    await expect(send(setup.instance)).rejects.toMatchObject({code:"asset_unsupported"});
    expect(setup.fetcher).not.toHaveBeenCalled();
  });
  it("sends a saved public HTTPS image URL and caption without Google Drive", async () => {
    const fetcher = vi.fn<TestFetcher>(async () => new Response("{}", { status: 200 }));
    const external = mediaAsset({ source: "external", providerFileId: null, externalUrl: "https://cdn.example.test/photo.jpg", externalPreviewUrl: null });
    const setup = service({ fetcher, media: [external] });

    const result = await send(setup.instance);
    const request = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)) as { messages: Array<{ type: string; originalContentUrl?: string; previewImageUrl?: string; text?: string }> };
    expect(result.status).toBe("sent");
    expect(request.messages.slice(0, 2)).toEqual([
      { type: "image", originalContentUrl: "https://cdn.example.test/photo.jpg", previewImageUrl: "https://cdn.example.test/photo.jpg" },
      { type: "text", text: "Authoritative caption" },
    ]);
  });

  it("uses the saved JPEG preview when sending an external MP4", async () => {
    const fetcher = vi.fn<TestFetcher>(async () => new Response("{}", { status: 200 }));
    const external = mediaAsset({ source: "external", mimeType: "video/mp4", providerFileId: null, externalUrl: "https://cdn.example.test/clip.mp4", externalPreviewUrl: "https://cdn.example.test/poster.jpg" });
    const setup = service({ fetcher, media: [external] });

    expect((await send(setup.instance)).status).toBe("sent");
    const request = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)) as { messages: Array<{ type: string; originalContentUrl?: string; previewImageUrl?: string }> };
    expect(request.messages[0]).toEqual({ type: "video", originalContentUrl: "https://cdn.example.test/clip.mp4", previewImageUrl: "https://cdn.example.test/poster.jpg" });
  });

  it("rejects an externally stored URL containing credentials before calling LINE", async () => {
    const fetcher = vi.fn<TestFetcher>(async () => new Response("{}", { status: 200 }));
    const external = mediaAsset({ source: "external", providerFileId: null, externalUrl: "https://user:pass@cdn.example.test/photo.jpg" });
    const setup = service({ fetcher, media: [external] });
    await expect(send(setup.instance)).rejects.toMatchObject({ code: "asset_not_ready" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("sends the authoritative image URL and caption without accepting browser payloads", async () => {
    const fetcher = vi.fn<TestFetcher>(async () => new Response("{}", { status: 200 }));
    const setup = service({ fetcher });

    const result = await send(setup.instance);

    const request = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)) as {
      to: string;
      messages: Array<{ type: string; text?: string; originalContentUrl?: string; previewImageUrl?: string }>;
    };
    expect(result.status).toBe("sent");
    expect(request.to).toBe(recipientUserId);
    expect(request.messages.slice(0, 2)).toEqual([
      {
        type: "image",
        originalContentUrl: expect.stringContaining("/api/media/provider/drive-original"),
        previewImageUrl: expect.stringContaining("/api/media/provider/drive-original"),
      },
      { type: "text", text: "Authoritative caption" },
    ]);
    expect(request.messages[0].originalContentUrl).toMatch(/^https:\/\//);
  });

  it("rejects an empty caption before sending an MP4", async () => {
    const content = contentItem({ caption: "   " });
    const video = mediaAsset({ mimeType: "video/mp4", name: "clip.mp4", providerFileId: "drive-video", previewProviderFileId: "drive-poster" });
    const fetcher = vi.fn<TestFetcher>(async () => new Response("{}", { status: 200 }));
    const setup = service({ content, media: [video], fetcher });

    await expect(send(setup.instance, content)).rejects.toMatchObject({ code: "caption_required" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("sends a video with its persisted JPEG poster and authoritative caption", async () => {
    const content = contentItem({ caption: "Watch this" });
    const video = mediaAsset({ mimeType: "video/mp4", name: "clip.mp4", providerFileId: "drive-video", previewProviderFileId: "drive-poster" });
    const fetcher = vi.fn<TestFetcher>(async () => new Response("{}", { status: 200 }));
    const setup = service({ content, media: [video], fetcher });

    await send(setup.instance, content);

    const request = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)) as { messages: Array<Record<string, string>> };
    expect(request.messages.slice(0, 2)).toEqual([
      { type: "video", originalContentUrl: expect.stringContaining("drive-video"), previewImageUrl: expect.stringContaining("drive-poster") },
      { type: "text", text: "Watch this" },
    ]);
  });

  it("rejects an MP4 without its persisted JPEG preview", async () => {
    const content = contentItem();
    const video = mediaAsset({ mimeType: "video/mp4", previewProviderFileId: null });
    const setup = service({ content, media: [video] });

    await expect(send(setup.instance, content)).rejects.toMatchObject({ code: "preview_missing" });
    expect(setup.fetcher).not.toHaveBeenCalled();
  });

  it("rejects stale revisions and contents without a ready remote asset", async () => {
    const content = contentItem();
    const setup = service({ content, media: [mediaAsset({ remoteStatus: "uploading" })] });

    await expect(setup.instance.sendContentToLine({ contentId: content.id, expectedUpdatedAt: "older", actorId: "primary-admin" }))
      .rejects.toMatchObject({ code: "stale_content" });
    await expect(send(setup.instance, content)).rejects.toMatchObject({ code: "asset_not_ready" });
    expect(setup.fetcher).not.toHaveBeenCalled();
  });

  it("records a safe recipient failure without calling LINE when no recipient is paired", async () => {
    const setup = service({ recipient: null });

    const result = await send(setup.instance);

    expect(result).toMatchObject({ status: "failed", errorCategory: "recipient" });
    expect(setup.fetcher).not.toHaveBeenCalled();
  });

  it.each([
    [401, "configuration"],
    [403, "configuration"],
    [429, "quota"],
    [500, "provider"],
  ] as const)("maps LINE HTTP %i to safe category %s", async (status, errorCategory) => {
    const fetcher = vi.fn<TestFetcher>(async () => new Response("provider token must not escape", { status }));
    const setup = service({ fetcher });

    const result = await send(setup.instance);

    expect(result).toMatchObject({ status: "failed", errorCategory });
    expect(JSON.stringify(result)).not.toContain("provider token");
  });

  it.each([
    [400, "The user has blocked this official account", "recipient"],
    [400, "The server was unable to fetch the content URL", "media_fetch"],
    [409, "duplicate without accepted request id", "provider"],
  ] as const)("maps LINE response details to %s without exposing provider text", async (status, detail, errorCategory) => {
    const fetcher = vi.fn<TestFetcher>(async () => new Response(detail, { status }));
    const setup = service({ fetcher });

    const result = await send(setup.instance);

    expect(result).toMatchObject({ status: "failed", errorCategory });
    expect(JSON.stringify(result)).not.toContain(detail);
  });

  it("treats a 409 with LINE's accepted request id as the original successful delivery", async () => {
    const fetcher = vi.fn<TestFetcher>(async () => new Response(null, {
      status: 409,
      headers: { "x-line-accepted-request-id": "accepted-original-request" },
    }));
    const setup = service({ fetcher });

    const result = await send(setup.instance);

    expect(result).toMatchObject({ status: "sent", id: retryUuid });
  });

  it("maps timeouts to a retryable safe category", async () => {
    const timeout = new DOMException("upstream timed out", "TimeoutError");
    const fetcher = vi.fn(async () => { throw timeout; });
    const setup = service({ fetcher });

    const result = await send(setup.instance);

    expect(result).toMatchObject({ status: "failed", errorCategory: "timeout" });
  });

  it("reuses one UUID retry key for simultaneous clicks and never pushes again after success", async () => {
    const fetcher = vi.fn<TestFetcher>(async () => new Response("{}", { status: 200 }));
    const setup = service({ fetcher });

    const [first, second] = await Promise.all([send(setup.instance), send(setup.instance)]);
    await send(setup.instance);

    const retryKeys = fetcher.mock.calls.map((call) => new Headers(call[1]?.headers).get("X-Line-Retry-Key"));
    expect(first.id).toBe(second.id);
    expect(retryKeys).toEqual([retryUuid, retryUuid]);
    expect(retryKeys[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not overwrite a simultaneous successful delivery with a late timeout", async () => {
    let rejectSecond!: (error: Error) => void;
    const fetcher = vi.fn<TestFetcher>()
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectSecond = reject; }));
    const setup = service({ fetcher });
    const first = send(setup.instance);
    const second = send(setup.instance);
    expect((await first).status).toBe("sent");
    rejectSecond(new Error("late connection close"));
    expect((await second).status).toBe("sent");
    expect(setup.savedState().contents[0].lineReview.status).toBe("sent");
  });

  it("reuses the identical request body and retry key after an uncertain transient failure", async () => {
    let now = Date.parse(updatedAt);
    const fetcher = vi.fn<TestFetcher>()
      .mockRejectedValueOnce(new Error("connection closed before response"))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    const setup = service({ fetcher, now: () => now });

    const failed = await send(setup.instance);
    now += 60_000;
    const retried = await send(setup.instance);

    expect(failed.status).toBe("failed");
    expect(retried.status).toBe("sent");
    expect(fetcher.mock.calls[0]?.[1]?.body).toBe(fetcher.mock.calls[1]?.[1]?.body);
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get("X-Line-Retry-Key"))
      .toBe(new Headers(fetcher.mock.calls[1]?.[1]?.headers).get("X-Line-Retry-Key"));
  });

  it("does not replay after signed media URLs have expired, even inside LINE's retry-key window", async () => {
    const fetcher = vi.fn<TestFetcher>(async () => new Response("{}", { status: 200 }));
    const setup = service({ fetcher, now: () => Date.parse(updatedAt) + 60 * 60 * 1_000 });

    const result = await send(setup.instance);

    expect(result).toMatchObject({ status: "failed", errorCategory: "timeout" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not retry an uncertain queued delivery after LINE's 24-hour retry-key window", async () => {
    const fetcher = vi.fn(async () => new Response("{}", { status: 200 }));
    const setup = service({ fetcher, databaseCreatedAt: "2026-09-20T10:00:00.000Z" });

    const result = await send(setup.instance);

    expect(result).toMatchObject({ status: "failed", errorCategory: "timeout" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
