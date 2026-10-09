import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { POST } from "../app/api/line/webhook/route";

const originalSecret = process.env.LINE_CHANNEL_SECRET;

afterEach(() => {
  process.env.LINE_CHANNEL_SECRET = originalSecret;
});

describe("LINE webhook route", () => {
  it("accepts a callback only when the LINE signature is valid", async () => {
    const rawBody = '{"events":[]}';
    process.env.LINE_CHANNEL_SECRET = "channel-secret";
    const signature = createHmac("sha256", "channel-secret")
      .update(rawBody)
      .digest("base64");

    const response = await POST(new Request("https://example.test/api/line/webhook", {
      method: "POST",
      headers: { "x-line-signature": signature },
      body: rawBody,
    }));

    expect(response.status).toBe(200);
  });

  it("rejects an unsigned callback", async () => {
    process.env.LINE_CHANNEL_SECRET = "channel-secret";

    const response = await POST(new Request("https://example.test/api/line/webhook", {
      method: "POST",
      body: '{"events":[]}',
    }));

    expect(response.status).toBe(401);
  });
});
