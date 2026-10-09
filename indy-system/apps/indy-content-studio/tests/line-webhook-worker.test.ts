import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { createLineWebhookHandler } from "../features/line-oa/server/line-webhook-handler";

const originalSecret = process.env.LINE_CHANNEL_SECRET;
afterEach(() => {
  if (originalSecret === undefined) delete process.env.LINE_CHANNEL_SECRET;
  else process.env.LINE_CHANNEL_SECRET = originalSecret;
});

describe("LINE webhook handler compatibility", () => {
  it("accepts a request with a valid LINE signature", async () => {
    const rawBody = '{"events":[]}';
    const signature = createHmac("sha256", "channel-secret")
      .update(rawBody)
      .digest("base64");

    process.env.LINE_CHANNEL_SECRET = "channel-secret";
    const response = await createLineWebhookHandler()(new Request("https://example.test/api/line/webhook", {
      method: "POST",
      headers: { "x-line-signature": signature },
      body: rawBody,
    }));

    expect(response.status).toBe(200);
  });
});
