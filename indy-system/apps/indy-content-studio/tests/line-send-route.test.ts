// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import { createAdminSessionToken } from "../features/auth/server/admin-session";

const { sendContentToLine } = vi.hoisted(() => ({ sendContentToLine: vi.fn() }));
vi.mock("../features/line-oa/server/line-delivery-service", () => ({
  LineDeliveryError: class LineDeliveryError extends Error { constructor(readonly code: string) { super(code); } },
  LineDeliveryService: class LineDeliveryService { sendContentToLine = sendContentToLine; },
}));

import { POST } from "../app/api/line/send/route";

const originalAuthSecret = process.env.AUTH_SECRET;
const authSecret = "a-development-only-secret-long-enough-for-auth";

afterEach(() => {
  sendContentToLine.mockReset();
  if (originalAuthSecret === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = originalAuthSecret;
});

async function authenticatedRequest(body: unknown): Promise<Request> {
  process.env.AUTH_SECRET = authSecret;
  const token = await createAdminSessionToken(authSecret);
  return new Request("https://indy.test/api/line/send", {
    method: "POST",
    headers: { cookie: `indy_admin_session=${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("LINE send endpoint boundary", () => {
  it("requires an authenticated administrator", async () => {
    const response = await POST(new Request("https://indy.test/api/line/send", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contentId: "content-1", expectedUpdatedAt: "rev-1" }),
    }));

    expect(response.status).toBe(401);
    expect(sendContentToLine).not.toHaveBeenCalled();
  });

  it.each([
    { contentId: "content-1", expectedUpdatedAt: "rev-1", recipientUserId: "U-private" },
    { contentId: "content-1", expectedUpdatedAt: "rev-1", messages: [{ type: "text", text: "forged" }] },
    { contentId: "content-1", expectedUpdatedAt: "rev-1", caption: "forged" },
    { contentId: "content-1", expectedUpdatedAt: "rev-1", mediaUrl: "https://attacker.test" },
  ])("rejects client-controlled delivery fields", async (body) => {
    const response = await POST(await authenticatedRequest(body));

    expect(response.status).toBe(400);
    expect(sendContentToLine).not.toHaveBeenCalled();
  });

  it("accepts only the content ID and expected revision", async () => {
    sendContentToLine.mockResolvedValue({ id: "delivery-1", status: "sent", sentAt: "2026-09-22T12:00:00.000Z", errorCategory: null });
    const response = await POST(await authenticatedRequest({ contentId: "content-1", expectedUpdatedAt: "rev-1" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ delivery: { id: "delivery-1", status: "sent" } });
    expect(sendContentToLine).toHaveBeenCalledWith({ contentId: "content-1", expectedUpdatedAt: "rev-1", actorId: "primary-admin" });
  });
});
