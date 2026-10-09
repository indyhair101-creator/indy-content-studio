import { describe, expect, it, vi } from "vitest";
import { pushLineMessages } from "../features/line-oa/server/line-push-client";

describe("pushLineMessages", () => {
  it("pushes messages to one recipient with a retry key", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));

    await expect(
      pushLineMessages({
        fetcher,
        accessToken: "server-only-token",
        recipientUserId: "recipient",
        retryKey: "same-content-revision",
        messages: [{ type: "text", text: "พร้อมโพสต์" }],
      }),
    ).resolves.toEqual({ status: "sent" });

    expect(fetcher).toHaveBeenCalledWith(
      "https://api.line.me/v2/bot/message/push",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer server-only-token",
          "X-Line-Retry-Key": "same-content-revision",
        }),
        body: JSON.stringify({ to: "recipient", messages: [{ type: "text", text: "พร้อมโพสต์" }] }),
      }),
    );
  });

  it("does not report success for a rejected LINE request", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));

    await expect(
      pushLineMessages({
        fetcher,
        accessToken: "server-only-token",
        recipientUserId: "recipient",
        retryKey: "same-content-revision",
        messages: [{ type: "text", text: "พร้อมโพสต์" }],
      }),
    ).rejects.toMatchObject({ category: "configuration" });
  });
});
