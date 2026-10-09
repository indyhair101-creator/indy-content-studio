import { describe, expect, it } from "vitest";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import { addReference, deleteReference, updateReference } from "../features/references/reference-commands";

describe("reference commands", () => {
  it("normalizes fields and rejects blank titles and non-HTTPS URLs", () => {
    const state = createEmptyDashboardState();
    const next = addReference(state, {
      id: "ref-1",
      title: " ไอเดีย ",
      url: "https://example.com/a",
      platform: " TikTok ",
      tags: [" รีวิว ", " ตัดผม "],
      notes: " โน้ต ",
      now: "2026-09-18",
    });

    expect(next.references[0]).toMatchObject({
      title: "ไอเดีย",
      platform: "TikTok",
      tags: ["รีวิว", "ตัดผม"],
      notes: "โน้ต",
    });
    expect(() => addReference(state, { id: "blank", title: " ", url: "https://example.com/b", now: "now" })).toThrow();
    expect(() => addReference(state, { id: "http", title: "x", url: "http://example.com", now: "now" })).toThrow("https");
  });

  it("rejects duplicate active URLs but allows a URL after its original record is soft deleted", () => {
    const state = addReference(createEmptyDashboardState(), {
      id: "ref-1",
      title: "แรก",
      url: "https://example.com/a",
      now: "start",
    });

    expect(() => addReference(state, { id: "ref-2", title: "ซ้ำ", url: "https://example.com/a", now: "later" })).toThrow();

    const deleted = deleteReference(state, "ref-1", "deleted");
    const restoredUrl = addReference(deleted, { id: "ref-2", title: "ใหม่", url: "https://example.com/a", now: "later" });
    expect(restoredUrl.references).toHaveLength(2);
    expect(restoredUrl.references[0].deletedAt).toBe("deleted");
  });

  it("allows a deleted reference to use the URL of an active reference without restoring it", () => {
    const first = addReference(createEmptyDashboardState(), {
      id: "ref-deleted",
      title: "ลบแล้ว",
      url: "https://example.com/a",
      now: "created",
    });
    const deleted = deleteReference(first, "ref-deleted", "deleted");
    const state = addReference(deleted, {
      id: "ref-active",
      title: "ใช้งานอยู่",
      url: "https://example.com/b",
      now: "active",
    });

    const updated = updateReference(state, "ref-deleted", { url: "https://example.com/b" }, "updated");

    expect(updated.references[0]).toMatchObject({
      url: "https://example.com/b",
      deletedAt: "deleted",
      updatedAt: "updated",
    });
  });

  it("validates and normalizes changed fields without replacing unchanged fields", () => {
    const state = addReference(createEmptyDashboardState(), {
      id: "ref-1",
      title: "เดิม",
      url: "https://example.com/a",
      platform: "YouTube",
      tags: ["เก่า"],
      notes: "โน้ตเดิม",
      now: "created",
    });
    const withAnotherReference = addReference(state, {
      id: "ref-2",
      title: "อีกอัน",
      url: "https://example.com/b",
      now: "created",
    });

    const updated = updateReference(withAnotherReference, "ref-1", {
      platform: " Instagram ",
      tags: [" รีวิว "],
      notes: " โน้ตใหม่ ",
    }, "updated");

    expect(updated.references[0]).toMatchObject({
      title: "เดิม",
      url: "https://example.com/a",
      platform: "Instagram",
      tags: ["รีวิว"],
      notes: "โน้ตใหม่",
      createdAt: "created",
      updatedAt: "updated",
    });
    expect(() => updateReference(updated, "ref-1", { title: " " })).toThrow();
    expect(() => updateReference(updated, "ref-1", { url: "http://example.com/c" })).toThrow("https");
    expect(() => updateReference(updated, "ref-1", { url: "https://example.com/b" })).toThrow();
  });

  it("soft deletes without removing the record", () => {
    const state = addReference(createEmptyDashboardState(), { id: "ref-1", title: "ไอเดีย", url: "https://example.com/a", now: "created" });
    const deleted = deleteReference(state, "ref-1", "deleted");

    expect(deleted.references).toHaveLength(1);
    expect(deleted.references[0]).toMatchObject({ deletedAt: "deleted", updatedAt: "deleted" });
  });
});
