import { randomUUID } from "node:crypto";
import type { ContentItem, DashboardState, Platform } from "../domain/types";
import { StaleDashboardStateError, type DashboardSnapshot } from "../data/server/neon-dashboard-repository";
import { cloneDashboardState } from "../data/dashboard-repository";
import { buildCalendarMonth } from "../calendar/calendar-selectors";
import { calendarSchema, contentIdSchema, createContentSchema, listContentSchema, scheduleSchema, unscheduleSchema, updateContentSchema } from "./schemas";

export interface McpDashboardRepository {
  loadDashboardState(): Promise<DashboardSnapshot>;
  saveDashboardState(state: DashboardState, expectedVersion: number): Promise<{ version: number }>;
}

export class DashboardToolError extends Error {}

export function dashboardTimezone(): string {
  const timezone = process.env.DASHBOARD_TIMEZONE ?? "Asia/Hovd";
  new Intl.DateTimeFormat("en", { timeZone: timezone });
  return timezone;
}

function activeContent(state: DashboardState, id: string): ContentItem {
  const content = state.contents.find((item) => item.id === id && !item.deletedAt);
  if (!content) throw new DashboardToolError("ไม่พบคอนเทนต์นี้ หรือถูกย้ายไปถังขยะแล้ว");
  return content;
}

function requireEditable(content: ContentItem, state: DashboardState, platform?: Platform): void {
  if (content.productionStatus === "published") throw new DashboardToolError("คอนเทนต์นี้เผยแพร่แล้ว");
  if (content.schedules.some((s) => (!platform || s.platform === platform) && (s.latestAttemptId || s.manualEvidence))
    || state.publicationAttempts.some((a) => a.contentId === content.id && (!platform || a.platform === platform))) {
    // A local-plan/failed attempt can still be in flight in the existing Make delivery flow.
    throw new DashboardToolError("รายการนี้มีแผนหรือประวัติส่งไป Make แล้ว กรุณาแก้ไขรายการนี้ในแดชบอร์ด");
  }
}

function summary(item: ContentItem) {
  return { id: item.id, title: item.title, category_id: item.categoryId, format_id: item.formatId,
    owner: item.owner, production_status: item.productionStatus, planned_work_at: item.plannedWorkAt,
    schedules: item.schedules.map(({ platform, enabled, publishAt }) => ({ platform, enabled, publish_at: publishAt })),
    updated_at: item.updatedAt };
}

export class DashboardMcpService {
  constructor(private readonly repository: McpDashboardRepository, private readonly clock = () => new Date().toISOString()) {}

  private async mutate<T>(change: (state: DashboardState) => T): Promise<{ result: T; version: number }> {
    for (let retry = 0; retry < 3; retry++) {
      const snapshot = await this.repository.loadDashboardState();
      const state = cloneDashboardState(snapshot.state);
      const result = change(state);
      try {
        const saved = await this.repository.saveDashboardState(state, snapshot.version);
        return { result, version: saved.version };
      } catch (error) {
        if (!(error instanceof StaleDashboardStateError)) throw error;
      }
    }
    throw new DashboardToolError("มีการแก้ไขตารางพร้อมกันหลายครั้ง กรุณาลองใหม่");
  }

  async getConfig() {
    const { state } = await this.repository.loadDashboardState();
    return { timezone: dashboardTimezone(), datetime_format: "YYYY-MM-DDTHH:mm", categories: state.categories,
      formats: state.formats, dashboard_url: process.env.MCP_PUBLIC_URL ?? null,
      scheduling_behavior: "บันทึกแผนลงปฏิทินเท่านั้น การเผยแพร่จริงต้องดำเนินการตามขั้นตอนเดิมในแดชบอร์ด" };
  }

  async listContent(input: unknown) {
    const { query, limit, offset } = listContentSchema.parse(input);
    const { state, version } = await this.repository.loadDashboardState();
    const items = state.contents.filter((item) => !item.deletedAt && (!query
      || (item.title + " " + item.owner + " " + item.notes).toLocaleLowerCase().includes(query.toLocaleLowerCase())));
    return { contents: items.slice(offset, offset + limit).map(summary), total: items.length,
      next_offset: offset + limit < items.length ? offset + limit : null, version };
  }

  async getContent(input: unknown) {
    const { content_id } = contentIdSchema.parse(input);
    const { state, version } = await this.repository.loadDashboardState();
    return { content: activeContent(state, content_id), version };
  }

  async getCalendar(input: unknown) {
    const { month } = calendarSchema.parse(input);
    const { state, version } = await this.repository.loadDashboardState();
    const { cells, unscheduled } = buildCalendarMonth(state, { month });
    return { month, timezone: dashboardTimezone(), version,
      days: cells.filter((c) => c.inMonth).map((c) => ({ date: c.date, contents: c.items.map(summary) })),
      unscheduled: unscheduled.slice(0, 100).map(summary), unscheduled_total: unscheduled.length };
  }

  async createContent(input: unknown) {
    const args = createContentSchema.parse(input);
    const id = "content-" + args.request_id;
    const { result, version } = await this.mutate((state) => {
      const existing = state.contents.find((item) => item.id === id);
      if (existing) {
        if (existing.deletedAt) throw new DashboardToolError("request_id นี้ถูกใช้กับรายการในถังขยะแล้ว");
        return existing;
      }
      if (!state.categories.some((c) => c.id === args.category_id) || !state.formats.some((f) => f.id === args.format_id)) {
        throw new DashboardToolError("หมวดหมู่หรือรูปแบบไม่ถูกต้อง เรียก get_dashboard_config เพื่อดู ID ที่ใช้ได้");
      }
      const now = this.clock();
      const content: ContentItem = {
        id, title: args.title, categoryId: args.category_id, formatId: args.format_id, owner: args.owner,
        objective: "branding", priority: "normal", plannedWorkAt: args.planned_work_at ?? null,
        lastWorkedAt: null, readyDate: null, productionStatus: "waiting-shoot", assetIds: [], processSteps: [],
        caption: args.caption, captionSource: null, referenceIds: [], notes: args.notes, localApproval: "pending",
        schedules: (["facebook", "instagram", "tiktok"] as const).map((platform) => ({
          platform, enabled: false, publishAt: null, latestAttemptId: null, manualEvidence: null,
        })),
        lineReview: { status: "not-sent", activeCycleId: null, reviewCode: null, providerReceipts: [], lastEventAt: null, history: [] },
        createdAt: now, updatedAt: now, deletedAt: null,
      };
      state.contents.push(content);
      return content;
    });
    return { content: result, version };
  }

  async updateContent(input: unknown) {
    const args = updateContentSchema.parse(input);
    const eventId = randomUUID();
    const { result, version } = await this.mutate((state) => {
      const content = activeContent(state, args.content_id);
      requireEditable(content, state);
      if (args.caption !== undefined && args.caption !== content.caption) {
        content.localApproval = "pending"; content.captionSource = null;
        content.lineReview = { ...content.lineReview, status: "not-sent", activeCycleId: null, reviewCode: null,
          providerReceipts: [], lastEventAt: this.clock(),
          history: [...content.lineReview.history, { id: eventId, cycleId: content.lineReview.activeCycleId ?? "",
            event: "approval-reset", comment: "แก้ไขแคปชันผ่าน MCP", occurredAt: this.clock() }] };
      }
      if (args.title !== undefined) content.title = args.title;
      if (args.owner !== undefined) content.owner = args.owner;
      if (args.notes !== undefined) content.notes = args.notes;
      if (args.caption !== undefined) content.caption = args.caption;
      if (args.planned_work_at !== undefined) content.plannedWorkAt = args.planned_work_at;
      content.updatedAt = this.clock();
      return content;
    });
    return { content: result, version };
  }

  async scheduleContent(input: unknown) {
    const args = scheduleSchema.parse(input);
    const { result, version } = await this.mutate((state) => {
      const content = activeContent(state, args.content_id);
      requireEditable(content, state, args.platform);
      const format = state.formats.find((f) => f.id === content.formatId);
      if (args.platform !== "salon" && !format?.allowedPlatforms.includes(args.platform)) throw new DashboardToolError("รูปแบบนี้ไม่รองรับแพลตฟอร์มที่เลือก");
      let schedule = content.schedules.find((s) => s.platform === args.platform);
      if (!schedule) {
        schedule = { platform: args.platform, enabled: false, publishAt: null, latestAttemptId: null, manualEvidence: null };
        content.schedules.push(schedule);
      }
      schedule.enabled = true; schedule.publishAt = args.publish_at;
      content.updatedAt = this.clock();
      return content;
    });
    return { content: result, version, published: false };
  }

  async unscheduleContent(input: unknown) {
    const args = unscheduleSchema.parse(input);
    const { result, version } = await this.mutate((state) => {
      const content = activeContent(state, args.content_id);
      requireEditable(content, state, args.platform);
      const schedule = content.schedules.find((s) => s.platform === args.platform);
      if (!schedule) return content;
      schedule.enabled = false; schedule.publishAt = null;
      content.updatedAt = this.clock(); return content;
    });
    return { content: result, version };
  }

  async deleteContent(input: unknown) {
    const { content_id } = contentIdSchema.parse(input);
    const { result, version } = await this.mutate((state) => {
      const content = activeContent(state, content_id); requireEditable(content, state);
      content.deletedAt = this.clock(); content.updatedAt = content.deletedAt;
      return { id: content.id, deleted_at: content.deletedAt, recoverable: true };
    });
    return { ...result, version };
  }
}
