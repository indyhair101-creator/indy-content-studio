import { describe, expect, it } from "vitest";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import { parseIdeasImport } from "../features/backup/ideas-import";
import { parseLegacyIndyExport } from "../features/backup/legacy-indy-import";

describe("legacy INDY import", () => {
  it("accepts legacy aliases and preserves unknown status as a warning", () => {
    const result = parseLegacyIndyExport({ contentItems: [{ id: "old-1", title: "งานเดิม", status: "สถานะใหม่", caption: "แคปชัน" }], assets: [{ id: "asset-1", name: "รูป.jpg" }], ideas: [{ title: "ไอเดีย", url: "https://example.test" }], templates: [{ name: "แม่แบบ", body: "สมัคร {course}" }] });
    expect(result.report.mapped).toBe(4);
    expect(result.report.warnings[0]).toContain("สถานะใหม่");
    expect(result.previewState.contents[0].notes).toContain("ข้อมูลจากระบบเดิม");
  });

  it("validates HTTPS ideas, trims tags, and skips duplicate URLs", () => {
    const current = createEmptyDashboardState(); current.references.push({ id: "r", title: "เดิม", url: "https://example.test/dup", platform: "เว็บ", tags: [], notes: "", createdAt: "now", updatedAt: "now", deletedAt: null });
    const result = parseIdeasImport([{ title: "ใหม่", url: "https://example.test/new", tags: [" a ", "a", ""] }, { title: "ซ้ำ", url: "https://example.test/dup" }, { title: "ผิด", url: "http://unsafe.test" }], current);
    expect(result.report.mapped).toBe(1);
    expect(result.report.skipped).toBe(2);
    expect(result.previewState.references.at(-1)?.tags).toEqual(["a"]);
  });
});
