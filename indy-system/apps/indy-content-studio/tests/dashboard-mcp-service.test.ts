import { describe, expect, it } from "vitest";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import { DashboardMcpService } from "../features/mcp/dashboard-service";
import { StaleDashboardStateError } from "../features/data/server/neon-dashboard-repository";
import { buildCalendarMonth } from "../features/calendar/calendar-selectors";

function fixture() {
  let state = createEmptyDashboardState();
  let version = 1;
  const repository = {
    loadDashboardState: async () => ({ state: structuredClone(state), version }),
    saveDashboardState: async (next: typeof state, expected: number) => {
      if (expected !== version) throw new StaleDashboardStateError();
      state = structuredClone(next); return { version: ++version };
    },
  };
  const service = new DashboardMcpService(repository, () => "2026-10-05T05:00:00.000Z");
  return { service, repository, get state() { return state; } };
}

const draft = { request_id: "426f94c0-0f6b-4ca0-9e8f-d1b838d72bc1", title: "ถ่ายรีวิว", category_id: "category-review", format_id: "format-video" };

describe("dashboard MCP mutations", () => {
  it("creates idempotently and schedules into the same calendar used by the dashboard", async () => {
    const f = fixture();
    const first = await f.service.createContent(draft);
    await f.service.createContent(draft);
    expect(f.state.contents).toHaveLength(1);
    await f.service.scheduleContent({ content_id: first.content.id, platform: "instagram", publish_at: "2026-11-08T09:30" });
    expect(buildCalendarMonth(f.state, { month: "2026-11" }).cells.find((c) => c.date === "2026-11-08")?.items).toHaveLength(1);
    expect(f.state.publicationAttempts).toEqual([]);
    expect(f.state.contents[0].localApproval).toBe("pending");
    await f.service.unscheduleContent({ content_id: first.content.id, platform: "instagram" });
    expect(f.state.contents[0].schedules.find((s) => s.platform === "instagram")?.enabled).toBe(false);
  });

  it("rejects impossible dates, unknown categories and disallowed platforms without writing", async () => {
    const f = fixture();
    await expect(f.service.createContent({ ...draft, category_id: "missing" })).rejects.toThrow();
    const { content } = await f.service.createContent({ ...draft, format_id: "format-image" });
    await expect(f.service.scheduleContent({ content_id: content.id, platform: "instagram", publish_at: "2026-10-08T09:30" })).rejects.toThrow();
    await expect(f.service.scheduleContent({ content_id: content.id, platform: "facebook", publish_at: "2026-02-30T09:30" })).rejects.toThrow();
    expect(f.state.contents[0].schedules.every((s) => !s.enabled)).toBe(true);
  });

  it("retries conflicts against fresh state without losing other edits", async () => {
    const f = fixture(); const { content } = await f.service.createContent(draft);
    const save = f.repository.saveDashboardState; let collided = false;
    f.repository.saveDashboardState = async (next, version) => {
      if (!collided) {
        collided = true; const current = await f.repository.loadDashboardState();
        current.state.notificationReadIds.push("external-change"); await save(current.state, current.version);
        throw new StaleDashboardStateError();
      }
      return save(next, version);
    };
    await f.service.updateContent({ content_id: content.id, title: "ชื่อใหม่" });
    expect(f.state.contents[0].title).toBe("ชื่อใหม่");
    expect(f.state.notificationReadIds).toEqual(["external-change"]);
  });

  it("soft deletes and does not reveal deleted content", async () => {
    const f = fixture(); const { content } = await f.service.createContent(draft);
    await f.service.deleteContent({ content_id: content.id });
    expect(f.state.contents[0].deletedAt).toBeTruthy();
    expect((await f.service.listContent({})).contents).toEqual([]);
    await expect(f.service.getContent({ content_id: content.id })).rejects.toThrow();
  });

  it("refuses to alter an active publication or clear its evidence", async () => {
    const f = fixture(); const { content } = await f.service.createContent(draft);
    const snap = await f.repository.loadDashboardState();
    snap.state.contents[0].schedules[0].latestAttemptId = "in-flight";
    await f.repository.saveDashboardState(snap.state, snap.version);
    await expect(f.service.scheduleContent({ content_id: content.id, platform: "facebook", publish_at: "2026-10-08T09:30" })).rejects.toThrow();
    await expect(f.service.deleteContent({ content_id: content.id })).rejects.toThrow();
    expect(f.state.contents[0].schedules[0].latestAttemptId).toBe("in-flight");
  });

  it("blocks a prepared or failed Make attempt because it may already be in flight", async () => {
    const f = fixture(); const { content } = await f.service.createContent(draft);
    const snap = await f.repository.loadDashboardState();
    snap.state.publicationAttempts.push({ id: "make-1", idempotencyKey: "key-1", contentId: content.id,
      platform: "facebook", publishAt: "2026-10-08T09:30", status: "local-plan", queueId: null,
      providerPublicationId: null, receiptUrl: null, errorCode: null, createdAt: content.createdAt, updatedAt: content.updatedAt });
    await f.repository.saveDashboardState(snap.state, snap.version);
    await expect(f.service.scheduleContent({ content_id: content.id, platform: "facebook", publish_at: "2026-10-09T09:30" })).rejects.toThrow();
    await expect(f.service.updateContent({ content_id: content.id, caption: "ใหม่" })).rejects.toThrow();
    await expect(f.service.deleteContent({ content_id: content.id })).rejects.toThrow();
  });

  it("can schedule an existing dashboard draft with no platform schedule records", async () => {
    const f = fixture(); const { content } = await f.service.createContent(draft);
    const snap = await f.repository.loadDashboardState(); snap.state.contents[0].schedules = [];
    await f.repository.saveDashboardState(snap.state, snap.version);
    await f.service.scheduleContent({ content_id: content.id, platform: "tiktok", publish_at: "2026-10-09T18:00" });
    expect(f.state.contents[0].schedules[0]).toMatchObject({ platform: "tiktok", enabled: true, publishAt: "2026-10-09T18:00" });
  });
});
