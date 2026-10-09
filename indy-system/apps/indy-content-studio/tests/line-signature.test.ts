import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyLineSignature } from "../features/line-oa/server/line-signature";

describe("verifyLineSignature", () => {
  it("accepts an HMAC signature for the exact webhook body", () => {
    const rawBody = '{"events":[]}';
    const secret = "channel-secret";
    const signature = createHmac("sha256", secret).update(rawBody).digest("base64");

    expect(verifyLineSignature(rawBody, signature, secret)).toBe(true);
  });

  it("rejects a mismatched signature", () => {
    expect(verifyLineSignature('{"events":[]}', "bad", "channel-secret")).toBe(false);
  });
});
