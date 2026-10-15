import { describe, expect, it, vi } from "vitest";
import { listRecentCorrections } from "../features/line-oa/server/correction-feed";

describe("listRecentCorrections", () => {
  it("returns only LINE rejections newer than the cursor, with content titles, newest first", async () => {
    const execute = vi.fn(async (query: string, params: unknown[]) => {
      if (query.includes("FROM line_review_events")) {
        expect(params).toEqual(["2026-10-15T03:00:00.000Z", 20]);
        return [{ id: "evt-2", content_id: "c2", comment: "ขอเปลี่ยนเพลง", occurred_at: new Date("2026-10-15T04:10:00.000Z") }];
      }
      if (query.includes("FROM line_unmatched_feedback")) {
        return [{ id: "unmatched-1", comment: "ภาพมืดไป", occurred_at: "2026-10-15T04:00:00.000Z" }];
      }
      if (query.includes("jsonb_array_elements")) {
        expect(params).toEqual(["primary", ["c2"]]);
        return [{ id: "c2", title: "สอนไดร์ผมวอลลุ่ม" }];
      }
      throw new Error(`unexpected query ${query}`);
    });

    const items = await listRecentCorrections({ since: "2026-10-15T03:00:00.000Z", execute });

    expect(items).toEqual([
      { id: "line-evt-2", contentId: "c2", contentTitle: "สอนไดร์ผมวอลลุ่ม", comment: "ขอเปลี่ยนเพลง", receivedAt: "2026-10-15T04:10:00.000Z" },
      { id: "unmatched-1", contentId: null, contentTitle: null, comment: "ภาพมืดไป", receivedAt: "2026-10-15T04:00:00.000Z" },
    ]);
  });

  it("skips the title lookup when nothing new arrived", async () => {
    const execute = vi.fn(async () => []);
    expect(await listRecentCorrections({ since: "2026-10-15T03:00:00.000Z", execute })).toEqual([]);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("rejects an invalid cursor instead of scanning everything", async () => {
    await expect(listRecentCorrections({ since: "yesterday", execute: vi.fn() })).rejects.toThrow("since");
  });
});
