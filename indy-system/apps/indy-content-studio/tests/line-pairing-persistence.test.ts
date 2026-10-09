// @vitest-environment node

import { createHash, createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLineWebhookHandler } from "../features/line-oa/server/line-webhook-handler";
import { NeonLineConnectionRepository } from "../features/line-oa/server/line-connection-repository";
import { NeonLineReviewStore } from "../features/line-oa/server/line-review-store";
import { decryptLineUserId, encryptLineUserId } from "../features/line-oa/server/line-user-encryption";
import type { SqlExecutor } from "../features/data/server/neon-client";

const encryptionKey = Buffer.alloc(32, 11).toString("base64url");
const pairingCode = "INDY-AB12CD34-EF56AB78";
const now = Date.parse("2026-09-22T12:00:00.000Z");
const channelSecret = "test-channel-secret";
const originalChannelSecret = process.env.LINE_CHANNEL_SECRET;

function repository(execute: SqlExecutor, overrides: { now?: () => number; generatePairingCode?: () => string } = {}) {
  return new NeonLineConnectionRepository({
    execute,
    encryptionKey,
    now: overrides.now ?? (() => now),
    generatePairingCode: overrides.generatePairingCode ?? (() => pairingCode),
  });
}

function signedRequest(payload: unknown): Request {
  const rawBody = JSON.stringify(payload);
  const signature = createHmac("sha256", channelSecret).update(rawBody).digest("base64");
  return new Request("https://indy.test/api/line/webhook", {
    method: "POST",
    headers: { "x-line-signature": signature },
    body: rawBody,
  });
}

afterEach(() => {
  if (originalChannelSecret === undefined) delete process.env.LINE_CHANNEL_SECRET;
  else process.env.LINE_CHANNEL_SECRET = originalChannelSecret;
});

describe("LINE recipient encryption", () => {
  it("encrypts recipient IDs with authenticated AES-GCM and rejects tampering", () => {
    const encrypted = encryptLineUserId("U0123456789abcdef", encryptionKey);
    expect(encrypted).not.toContain("U0123456789abcdef");
    expect(decryptLineUserId(encrypted, encryptionKey)).toBe("U0123456789abcdef");
    const [version, nonce, tag, ciphertext] = encrypted.split(".");
    const changedTag = `${tag[0] === "a" ? "b" : "a"}${tag.slice(1)}`;
    expect(() => decryptLineUserId(`${version}.${nonce}.${changedTag}.${ciphertext}`, encryptionKey)).toThrow();
  });
});

describe("Neon LINE pairing persistence", () => {
  it("creates a ten-minute pairing code while persisting only its SHA-256 hash", async () => {
    const expiresAt = new Date(now + 10 * 60_000).toISOString();
    const execute = vi.fn<SqlExecutor>()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ expires_at: expiresAt }]);
    const result = await repository(execute).createPairingCode();

    expect(result).toEqual({ pairingCode, expiresAt });
    const storedParameters = execute.mock.calls[1]?.[1] ?? [];
    expect(storedParameters).toContain(createHash("sha256").update(pairingCode).digest("hex"));
    expect(storedParameters).not.toContain(pairingCode);
  });

  it("stores only encrypted recipient IDs and maps an atomic claim to paired", async () => {
    const execute = vi.fn<SqlExecutor>().mockResolvedValue([{ result: "paired" }]);
    const result = await repository(execute).claimPairingCode({
      pairingCode,
      recipientUserId: "U0123456789abcdef",
      webhookEventId: "event-1",
    });

    expect(result).toBe("paired");
    const parameters = execute.mock.calls[0]?.[1] ?? [];
    expect(parameters).not.toContain("U0123456789abcdef");
    expect(parameters).not.toContain(pairingCode);
    const encrypted = parameters.find((value): value is string => typeof value === "string" && value.startsWith("v1."));
    expect(encrypted).toBeDefined();
    expect(decryptLineUserId(encrypted!, encryptionKey)).toBe("U0123456789abcdef");
  });

  it("rejects malformed pairing codes without contacting Neon", async () => {
    const execute = vi.fn<SqlExecutor>();

    await expect(repository(execute).claimPairingCode({
      pairingCode: "not-a-pairing-code",
      recipientUserId: "U0123456789abcdef",
      webhookEventId: "event-malformed",
    })).resolves.toBe("invalid");
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([
    ["expired or reused code", "invalid"],
    ["duplicate webhook event", "duplicate"],
    ["active recipient", "already_connected"],
  ] as const)("refuses a claim when the database reports %s", async (_case, databaseResult) => {
    const execute = vi.fn<SqlExecutor>().mockResolvedValue([{ result: databaseResult }]);

    await expect(repository(execute).claimPairingCode({
      pairingCode,
      recipientUserId: "U0123456789abcdef",
      webhookEventId: "event-1",
    })).resolves.toBe(databaseResult);
  });

  it("allows exactly one winner when two webhook events claim the same code concurrently", async () => {
    let claimed = false;
    const execute = vi.fn<SqlExecutor>(async () => {
      await Promise.resolve();
      if (claimed) return [{ result: "invalid" }];
      claimed = true;
      return [{ result: "paired" }];
    });
    const repo = repository(execute);

    const results = await Promise.all([
      repo.claimPairingCode({ pairingCode, recipientUserId: "U-first", webhookEventId: "event-1" }),
      repo.claimPairingCode({ pairingCode, recipientUserId: "U-second", webhookEventId: "event-2" }),
    ]);

    expect(results.filter((result) => result === "paired")).toHaveLength(1);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("persists review cycles and webhook events while encrypting their recipient IDs", async () => {
    let storedReview: { reviewCode: string; contentId: string; cycleId: string; encryptedRecipient: string } | null = null;
    const events: Array<{ id: string; event: string; comment: string | null; occurredAt: string; webhookEventId?: string }> = [];
    const execute = vi.fn<SqlExecutor>(async (query, params) => {
      if (query.includes("INSERT INTO line_reviews")) {
        storedReview = {
          reviewCode: String(params[0]),
          contentId: String(params[1]),
          cycleId: String(params[2]),
          encryptedRecipient: String(params[3]),
        };
        return [];
      }
      if (query.includes("INSERT INTO line_review_events")) {
        events.push({
          id: String(params[0]),
          event: String(params[2]),
          comment: params[3] === null ? null : String(params[3]),
          occurredAt: String(params[4]),
          webhookEventId: params[6] ? String(params[6]) : undefined,
        });
        return [];
      }
      if (query.includes("FROM line_reviews")) {
        return storedReview ? [{
          review_code: storedReview.reviewCode,
          content_id: storedReview.contentId,
          cycle_id: storedReview.cycleId,
          encrypted_recipient_user_id: storedReview.encryptedRecipient,
          event_id: events[0]?.id ?? null,
          event: events[0]?.event ?? null,
          comment: events[0]?.comment ?? null,
          occurred_at: events[0]?.occurredAt ?? null,
          provider_receipt: null,
          webhook_event_id: events[0]?.webhookEventId ?? null,
        }] : [];
      }
      return [];
    });
    const store = new NeonLineReviewStore({ execute, encryptionKey });

    const registered = await store.registerLineReview({
      contentId: "content-1",
      cycleId: "cycle-1",
      reviewCode: "R-ABC234",
      recipientUserId: "U0123456789abcdef",
    });
    const appended = await store.appendLineReviewEvent("R-ABC234", {
      id: "line-approved-cycle-1",
      event: "approved",
      comment: null,
      occurredAt: "2026-09-22T12:01:00.000Z",
    }, "webhook-review-1");

    expect(registered.recipientUserId).toBe("U0123456789abcdef");
    expect(execute.mock.calls[0]?.[1]).not.toContain("U0123456789abcdef");
    expect(appended?.events.map(({ event }) => event)).toEqual(["approved"]);
    expect(appended?.handledWebhookEventIds).toEqual(["webhook-review-1"]);
  });
});

describe("signed LINE pairing webhook", () => {
  it("verifies the raw signature before constructing the database repository", async () => {
    process.env.LINE_CHANNEL_SECRET = channelSecret;
    const getRepository = vi.fn();
    const handler = createLineWebhookHandler({ getRepository });
    const response = await handler(new Request("https://indy.test/api/line/webhook", {
      method: "POST",
      headers: { "x-line-signature": "invalid" },
      body: JSON.stringify({ events: [{ webhookEventId: "event-1" }] }),
    }));

    expect(response.status).toBe(401);
    expect(getRepository).not.toHaveBeenCalled();
  });

  it("does not claim a pairing code when the signed event has no user ID", async () => {
    process.env.LINE_CHANNEL_SECRET = channelSecret;
    const claimPairingCode = vi.fn();
    const handler = createLineWebhookHandler({ getRepository: () => ({ claimPairingCode }) as never });
    const response = await handler(signedRequest({ events: [{
      webhookEventId: "event-no-user",
      type: "message",
      source: { type: "user" },
      message: { type: "text", text: `เชื่อมต่อ ${pairingCode}` },
    }] }));

    expect(response.status).toBe(200);
    expect(claimPairingCode).not.toHaveBeenCalled();
  });

  it("passes only a valid user's pairing command and webhook event ID to persistence", async () => {
    process.env.LINE_CHANNEL_SECRET = channelSecret;
    const claimPairingCode = vi.fn(async () => "paired" as const);
    const handler = createLineWebhookHandler({ getRepository: () => ({ claimPairingCode }) as never });
    const response = await handler(signedRequest({ events: [{
      webhookEventId: "event-claim",
      type: "message",
      source: { type: "user", userId: "U0123456789abcdef" },
      message: { type: "text", text: `เชื่อมต่อ ${pairingCode}` },
    }] }));

    expect(response.status).toBe(200);
    expect(claimPairingCode).toHaveBeenCalledWith({
      pairingCode,
      recipientUserId: "U0123456789abcdef",
      webhookEventId: "event-claim",
    });
  });
});
