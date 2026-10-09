import { describe, expect, it } from "vitest";
import { canSendToLine } from "../features/content/send-eligibility";

describe("canSendToLine", () => {
  it.each([
    [{ assetState: "missing" as const, caption: "พร้อมแล้ว", connectedRecipient: true, authenticatedAdmin: true, isSending: false, assetType: "image/jpeg", previewReady: true }, false],
    [{ assetState: "uploading" as const, caption: "พร้อมแล้ว", connectedRecipient: true, authenticatedAdmin: true, isSending: false, assetType: "image/jpeg", previewReady: true }, false],
    [{ assetState: "ready" as const, caption: "   ", connectedRecipient: true, authenticatedAdmin: true, isSending: false, assetType: "image/jpeg", previewReady: true }, false],
    [{ assetState: "ready" as const, caption: "พร้อมแล้ว", connectedRecipient: false, authenticatedAdmin: true, isSending: false, assetType: "image/jpeg", previewReady: true }, false],
    [{ assetState: "ready" as const, caption: "พร้อมแล้ว", connectedRecipient: true, authenticatedAdmin: false, isSending: false, assetType: "image/jpeg", previewReady: true }, false],
    [{ assetState: "ready" as const, caption: "พร้อมแล้ว", connectedRecipient: true, authenticatedAdmin: true, isSending: true, assetType: "image/jpeg", previewReady: true }, false],
    [{ assetState: "ready" as const, caption: "พร้อมแล้ว", connectedRecipient: true, authenticatedAdmin: true, isSending: false, assetType: "video/mp4", previewReady: false }, false],
    [{ assetState: "ready" as const, caption: "พร้อมแล้ว", connectedRecipient: true, authenticatedAdmin: true, isSending: false, assetType: "video/mp4", previewReady: true }, true],
  ])("returns %s when any LINE send prerequisite is missing", (input, expected) => {
    expect(canSendToLine(input)).toBe(expected);
  });
});
