// @vitest-environment node

import { createHmac, randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import { hashAdminPassword } from "../features/auth/server/admin-password";
import type { ContentItem, MediaAsset } from "../features/domain/types";

const { driveClient } = vi.hoisted(() => ({
  driveClient: {
    uploadFile: vi.fn(async ({ name }: { name: string }) => ({ fileId: `test-drive-${name}` })),
    deleteFile: vi.fn(async () => undefined),
    streamFile: vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { "Content-Type": "image/jpeg", "Content-Length": "3" },
    })),
  },
}));

vi.mock("../features/media/server/google-drive-media-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../features/media/server/google-drive-media-client")>();
  return {
    ...actual,
    createGoogleDriveMediaClientFromEnvironment: () => driveClient,
  };
});

const TEST_DATABASE_URL = process.env.LINE_OA_TEST_DATABASE_URL;
const RUN_DATABASE_FLOW = process.env.LINE_OA_RUN_DATABASE_FLOW === "1";
const FLOW_ENABLED = Boolean(TEST_DATABASE_URL && RUN_DATABASE_FLOW);
const MANAGED_ENVIRONMENT = [
  "DATABASE_URL",
  "AUTH_SECRET",
  "INDY_ADMIN_PASSWORD_HASH",
  "LINE_CHANNEL_SECRET",
  "LINE_CHANNEL_ACCESS_TOKEN",
  "LINE_RECIPIENT_ENCRYPTION_KEY",
  "GOOGLE_SERVICE_ACCOUNT_EMAIL",
  "GOOGLE_PRIVATE_KEY",
  "GOOGLE_DRIVE_FOLDER_ID",
  "APP_PUBLIC_BASE_URL",
  "INDY_MEDIA_SIGNING_SECRET",
  "INDY_MEDIA_UPLOAD_TOKEN",
];
const oldEnvironment = new Map<string, string | undefined>();
let routes: {
  login: typeof import("../app/api/auth/login/route");
  dashboard: typeof import("../app/api/dashboard-state/route");
  pairing: typeof import("../app/api/line/pairing/route");
  webhook: typeof import("../app/api/line/webhook/route");
  upload: typeof import("../app/api/media/upload/route");
  send: typeof import("../app/api/line/send/route");
  middleware: typeof import("../middleware");
};
let originalFetch: typeof globalThis.fetch;

async function passThroughAdminMiddleware(request: Request, handler: (request: Request) => Promise<Response>): Promise<Response> {
  const decision = await routes.middleware.middleware(new NextRequest(request));
  if (decision.headers.get("x-middleware-next") !== "1") return decision;
  return handler(request);
}

describe.skipIf(!FLOW_ENABLED)("production LINE flow against a dedicated Neon test branch", () => {
  beforeAll(async () => {
    if (process.env.DATABASE_URL && process.env.DATABASE_URL === TEST_DATABASE_URL) {
      throw new Error("LINE_OA_TEST_DATABASE_URL must not be the configured application database URL");
    }
    for (const name of MANAGED_ENVIRONMENT) oldEnvironment.set(name, process.env[name]);

    process.env.DATABASE_URL = TEST_DATABASE_URL!;
    process.env.AUTH_SECRET = "test-auth-session-secret-only-not-for-deployment-0001";
    process.env.INDY_ADMIN_PASSWORD_HASH = await hashAdminPassword("integration-only-password-2026");
    process.env.LINE_CHANNEL_SECRET = "integration-only-line-channel-secret";
    process.env.LINE_CHANNEL_ACCESS_TOKEN = "integration-only-line-access-token";
    process.env.LINE_RECIPIENT_ENCRYPTION_KEY = Buffer.alloc(32, 17).toString("base64url");
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "drive-test@example.invalid";
    process.env.GOOGLE_PRIVATE_KEY = "integration-only-private-key";
    process.env.GOOGLE_DRIVE_FOLDER_ID = "integration-only-folder";
    process.env.APP_PUBLIC_BASE_URL = "https://studio.test";
    process.env.INDY_MEDIA_SIGNING_SECRET = "integration-only-signing-secret";
    process.env.INDY_MEDIA_UPLOAD_TOKEN = "integration-only-upload-token";

    vi.resetModules();
    const [login, dashboard, pairing, webhook, upload, send, middleware] = await Promise.all([
      import("../app/api/auth/login/route"),
      import("../app/api/dashboard-state/route"),
      import("../app/api/line/pairing/route"),
      import("../app/api/line/webhook/route"),
      import("../app/api/media/upload/route"),
      import("../app/api/line/send/route"),
      import("../middleware"),
    ]);
    routes = { login, dashboard, pairing, webhook, upload, send, middleware };

    originalFetch = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "https://api.line.me/v2/bot/message/push") {
        return new Response(null, { status: 200 });
      }
      return originalFetch(input, init);
    }));
  });

  afterAll(() => {
    vi.unstubAllGlobals();
    for (const name of MANAGED_ENVIRONMENT) {
      const value = oldEnvironment.get(name);
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it("logs in, persists dashboard and pairing, uploads image metadata, sends once, and deduplicates retry", async () => {
    const loginResponse = await routes.login.POST(new Request("https://studio.test/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "integration-only-password-2026" }),
    }));
    expect(loginResponse.status).toBe(200);
    const setCookieHeaders = (loginResponse.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.()
      ?? [loginResponse.headers.get("set-cookie") ?? ""];
    const cookie = setCookieHeaders.map((value) => value.split(";")[0]).join("; ");
    expect(cookie).toContain("indy_admin_session=");
    expect(cookie).toContain("indy_media_upload_token=");
    const authorization = { Cookie: cookie! };

    const snapshotResponse = await passThroughAdminMiddleware(
      new Request("https://studio.test/api/dashboard-state", { headers: authorization }),
      () => routes.dashboard.GET(),
    );
    expect(snapshotResponse.status).toBe(200);
    const snapshot = await snapshotResponse.json() as { state: ReturnType<typeof createEmptyDashboardState>; version: number };
    const now = new Date().toISOString();
    const suffix = randomUUID();
    const assetId = `line-flow-${suffix}`;
    const contentId = `line-flow-${suffix}`;
    const content: ContentItem = {
      id: contentId,
      title: "Automated image delivery verification",
      categoryId: snapshot.state.categories[0]?.id ?? "category-knowledge",
      formatId: snapshot.state.formats[0]?.id ?? "format-image",
      owner: "automated-test",
      objective: "awareness",
      priority: "normal",
      plannedWorkAt: null,
      lastWorkedAt: null,
      readyDate: null,
      productionStatus: "ready",
      assetIds: [assetId],
      processSteps: [],
      caption: `Automated test caption ${suffix}`,
      captionSource: null,
      schedules: [],
      referenceIds: [],
      notes: "Disposable integration-test branch only",
      localApproval: "approved",
      lineReview: { status: "not-sent", activeCycleId: null, reviewCode: null, providerReceipts: [], lastEventAt: null, history: [] },
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    snapshot.state.contents.push(content);

    const saveContent = new Request("https://studio.test/api/dashboard-state", {
      method: "PUT",
      headers: { ...authorization, "Content-Type": "application/json" },
      body: JSON.stringify({ state: snapshot.state, expectedVersion: snapshot.version }),
    });
    const saveContentResponse = await passThroughAdminMiddleware(saveContent, () => routes.dashboard.PUT(saveContent));
    expect(saveContentResponse.status).toBe(200);
    const savedSnapshot = await saveContentResponse.json() as { version: number };

    const pairingResponse = await passThroughAdminMiddleware(
      new Request("https://studio.test/api/line/pairing", { method: "POST", headers: authorization }),
      () => routes.pairing.POST(),
    );
    expect(pairingResponse.status).toBe(201);
    const pairing = await pairingResponse.json() as { pairingCode: string };
    expect(pairing.pairingCode).toMatch(/^INDY-[A-F0-9]{8}-[A-F0-9]{8}$/);

    const webhookBody = JSON.stringify({ events: [{
      type: "message",
      webhookEventId: `line-flow-${suffix}`,
      source: { type: "user", userId: `U${suffix.replaceAll("-", "").slice(0, 32)}` },
      message: { type: "text", text: `เชื่อมต่อ ${pairing.pairingCode}` },
    }] });
    const webhookSignature = createHmac("sha256", process.env.LINE_CHANNEL_SECRET!).update(webhookBody).digest("base64");
    const webhookResponse = await routes.webhook.POST(new Request("https://studio.test/api/line/webhook", {
      method: "POST",
      headers: { "x-line-signature": webhookSignature },
      body: webhookBody,
    }));
    expect(webhookResponse.status).toBe(200);

    const form = new FormData();
    form.set("assetId", assetId);
    form.set("file", new File([new Uint8Array([0xff, 0xd8, 0xff])], "line-flow.jpg", { type: "image/jpeg" }));
    const uploadResponse = await routes.upload.POST(new Request("https://studio.test/api/media/upload", {
      method: "POST",
      headers: { ...authorization, Origin: "https://studio.test" },
      body: form,
    }));
    expect(uploadResponse.status).toBe(200);
    const uploaded = await uploadResponse.json() as { providerFileId: string; previewProviderFileId: string; remoteStatus: "ready" };
    const media: MediaAsset = {
      id: assetId,
      name: "line-flow.jpg",
      mimeType: "image/jpeg",
      size: 3,
      source: "upload",
      externalUrl: null,
      externalPreviewUrl: null,
      blobKey: null,
      remoteStatus: uploaded.remoteStatus,
      providerFileId: uploaded.providerFileId,
      previewProviderFileId: uploaded.previewProviderFileId,
      tags: [],
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    const currentStateResponse = await passThroughAdminMiddleware(
      new Request("https://studio.test/api/dashboard-state", { headers: authorization }),
      () => routes.dashboard.GET(),
    );
    const currentSnapshot = await currentStateResponse.json() as { state: ReturnType<typeof createEmptyDashboardState>; version: number };
    currentSnapshot.state.media.push(media);
    const saveMedia = new Request("https://studio.test/api/dashboard-state", {
      method: "PUT",
      headers: { ...authorization, "Content-Type": "application/json" },
      body: JSON.stringify({ state: currentSnapshot.state, expectedVersion: Math.max(savedSnapshot.version, currentSnapshot.version) }),
    });
    const saveMediaResponse = await passThroughAdminMiddleware(saveMedia, () => routes.dashboard.PUT(saveMedia));
    expect(saveMediaResponse.status).toBe(200);

    const sendRequest = () => new Request("https://studio.test/api/line/send", {
      method: "POST",
      headers: { ...authorization, "Content-Type": "application/json" },
      body: JSON.stringify({ contentId, expectedUpdatedAt: now }),
    });
    const firstSend = await passThroughAdminMiddleware(sendRequest(), (request) => routes.send.POST(request));
    expect(firstSend.status).toBe(200);
    const firstDelivery = (await firstSend.json() as { delivery: { id: string; status: string } }).delivery;
    expect(firstDelivery.status).toBe("sent");

    const duplicateSend = await passThroughAdminMiddleware(sendRequest(), (request) => routes.send.POST(request));
    expect(duplicateSend.status).toBe(200);
    expect((await duplicateSend.json() as { delivery: { id: string; status: string } }).delivery)
      .toMatchObject({ id: firstDelivery.id, status: "sent" });

    const lineCalls = vi.mocked(globalThis.fetch).mock.calls.filter(([input]) => String(input) === "https://api.line.me/v2/bot/message/push");
    expect(lineCalls).toHaveLength(1);
    const push = JSON.parse(String(lineCalls[0][1]?.body)) as { to: string; messages: Array<{ type: string; text?: string }> };
    expect(push.to).toBe(`U${suffix.replaceAll("-", "").slice(0, 32)}`);
    expect(push.messages.slice(0, 2)).toEqual([
      expect.objectContaining({ type: "image", originalContentUrl: expect.stringContaining("https://studio.test/api/media/provider/") }),
      { type: "text", text: content.caption },
    ]);
  });
});
