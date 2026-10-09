import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyLineSignature(
  rawBody: string,
  receivedSignature: string,
  channelSecret: string,
): boolean {
  const expectedSignature = createHmac("sha256", channelSecret)
    .update(rawBody)
    .digest("base64");

  const expected = Buffer.from(expectedSignature);
  const received = Buffer.from(receivedSignature);

  return expected.length === received.length && timingSafeEqual(expected, received);
}
