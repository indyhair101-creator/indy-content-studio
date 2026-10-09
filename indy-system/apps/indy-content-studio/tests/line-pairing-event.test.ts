import { describe, expect, it } from "vitest";
import { extractPairingEvent } from "../features/line-oa/server/line-pairing-event";

describe("extractPairingEvent", () => {
  it("returns the LINE user ID for a valid pairing message", () => {
    expect(extractPairingEvent({
      type: "message",
      source: { type: "user", userId: "user-prik" },
      message: { type: "text", text: "เชื่อมต่อ INDY-4821" },
    }, "INDY-4821")).toEqual({ recipientUserId: "user-prik" });
  });

  it("ignores unrelated messages", () => {
    expect(extractPairingEvent({
      type: "message",
      source: { type: "user", userId: "user-prik" },
      message: { type: "text", text: "สวัสดี" },
    }, "INDY-4821")).toBeNull();
  });
});
