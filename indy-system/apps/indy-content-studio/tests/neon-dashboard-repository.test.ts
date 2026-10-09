import { describe, expect, it } from "vitest";
import { createEmptyDashboardState } from "../features/domain/create-empty-state";
import {
  ActivePublicationEditError,
  NeonDashboardRepository,
  StaleDashboardStateError,
} from "../features/data/server/neon-dashboard-repository";
import { createNeonExecutor } from "../features/data/server/neon-client";

describe("NeonDashboardRepository", () => {
  it("rejects manual completion when an authoritative Make job is missing from the browser projection", async () => {
    const state = createEmptyDashboardState();
    state.contents.push({ id: "one", title: "งาน", categoryId: "category-knowledge", formatId: "format-video", owner: "ทีม", objective: "awareness", priority: "normal", plannedWorkAt: null, lastWorkedAt: null, readyDate: null, productionStatus: "ready", assetIds: [], processSteps: [], caption: "", captionSource: null, schedules: [], referenceIds: [], notes: "", localApproval: "approved", lineReview: { status: "approved", activeCycleId: "cycle", reviewCode: null, providerReceipts: [], lastEventAt: null, history: [] }, createdAt: "now", updatedAt: "now", deletedAt: null });
    let saved = state;
    const repository = new NeonDashboardRepository({ execute: async (query, params) => {
      if (query.includes("FROM approved_publication_jobs")) return [{ content_id: "one" }];
      if (query.startsWith("SELECT")) return [{ version: 1, state: saved }];
      if (query.startsWith("UPDATE")) { saved = params[1] as typeof state; return [{ version: 2 }]; }
      throw new Error("Unexpected query");
    } });
    const next = structuredClone(state);
    next.contents[0].productionStatus = "published";
    next.contents[0].lineReview.activeCycleId = null;
    await expect(repository.saveDashboardState(next, 1)).rejects.toBeInstanceOf(ActivePublicationEditError);
    expect(saved.contents[0].productionStatus).toBe("ready");
  });
  it("requires a database URL outside injected tests", () => {
    expect(() => createNeonExecutor("")).toThrow("DATABASE_URL is required");
  });

  it("initializes once, persists a versioned snapshot, and rejects stale writes", async () => {
    const database = new Map<string, { version: number; state: unknown }>();
    const repository = new NeonDashboardRepository({
      execute: async (query, params) => {
        if (query.startsWith("SELECT")) {
          const row = database.get(String(params[0]));
          return row ? [{ ...row }] : [];
        }
        if (query.startsWith("INSERT")) {
          database.set(String(params[0]), { version: 1, state: params[1] });
          return [{ version: 1 }];
        }
        if (query.startsWith("UPDATE")) {
          const row = database.get(String(params[0]));
          if (!row || row.version !== Number(params[2])) return [];
          row.version += 1;
          row.state = params[1];
          return [{ version: row.version }];
        }
        throw new Error(`Unexpected query: ${query}`);
      },
    });

    const initial = await repository.loadDashboardState();
    expect(initial.version).toBe(1);

    const next = createEmptyDashboardState();
    next.notificationReadIds.push("notice-1");
    await expect(repository.saveDashboardState(next, initial.version)).resolves.toEqual({ version: 2 });
    await expect(repository.loadDashboardState()).resolves.toMatchObject({ version: 2, state: { notificationReadIds: ["notice-1"] } });
    await expect(repository.saveDashboardState(next, initial.version)).rejects.toBeInstanceOf(StaleDashboardStateError);
  });

  it("rejects an invalid database snapshot", async () => {
    const repository = new NeonDashboardRepository({ execute: async () => [{ version: 1, state: { schemaVersion: 1 } }] });

    await expect(repository.loadDashboardState()).rejects.toThrow("ไม่รองรับข้อมูล dashboard");
  });

  it("locks caption and schedule edits while Make is actively processing", async () => {
    const database = new Map<string, { version: number; state: unknown }>();
    const repository = new NeonDashboardRepository({
      execute: async (query, params) => {
        if (query.startsWith("SELECT")) { const row = database.get(String(params[0])); return row ? [{ ...row }] : []; }
        if (query.startsWith("INSERT")) { database.set(String(params[0]), { version: 1, state: params[1] }); return [{ version: 1 }]; }
        if (query.startsWith("UPDATE")) { const row = database.get(String(params[0])); if (!row || row.version !== Number(params[2])) return []; row.version += 1; row.state = params[1]; return [{ version: row.version }]; }
        throw new Error(`Unexpected query: ${query}`);
      },
    });
    const initial = await repository.loadDashboardState();
    const state = createEmptyDashboardState();
    state.contents.push({ id: "locked", title: "งาน", categoryId: "category-knowledge", formatId: "format-video", owner: "ทีม", objective: "awareness", priority: "normal", plannedWorkAt: null, lastWorkedAt: null, readyDate: null, productionStatus: "ready", assetIds: [], processSteps: [], caption: "เดิม", captionSource: null, schedules: [{ platform: "facebook", enabled: true, publishAt: "2026-10-01T09:00:00+07:00", latestAttemptId: "attempt", manualEvidence: null }], referenceIds: [], notes: "", localApproval: "approved", lineReview: { status: "approved", activeCycleId: null, reviewCode: null, providerReceipts: [], lastEventAt: null, history: [] }, createdAt: "now", updatedAt: "now", deletedAt: null });
    state.publicationAttempts.push({ id: "attempt", idempotencyKey: "key", contentId: "locked", platform: "facebook", publishAt: "2026-10-01T09:00:00+07:00", status: "queued", queueId: "q", providerPublicationId: null, receiptUrl: null, errorCode: null, createdAt: "now", updatedAt: "now" });
    await repository.saveDashboardState(state, initial.version);
    const edited = structuredClone(state); edited.contents[0].caption = "เปลี่ยนแล้ว";
    await expect(repository.saveDashboardState(edited, 2)).rejects.toBeInstanceOf(ActivePublicationEditError);
  });
});
