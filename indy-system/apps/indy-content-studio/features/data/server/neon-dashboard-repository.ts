import { DashboardBackupValidationError } from "../../backup/backup-schema";
import { validateDashboardBackup } from "../../backup/export-dashboard";
import { createEmptyDashboardState } from "../../domain/create-empty-state";
import type { DashboardState } from "../../domain/types";
import { createNeonExecutor, type SqlExecutor } from "./neon-client";
import { captureWorkStatusHistory } from "../../reports/work-status-history";

const WORKSPACE_KEY = "primary";

export class StaleDashboardStateError extends Error {
  constructor() {
    super("Dashboard state changed before it could be saved");
    this.name = "StaleDashboardStateError";
  }
}

export class ActivePublicationEditError extends Error {
  constructor() {
    super("Publication payload is locked while Make is processing it");
    this.name = "ActivePublicationEditError";
  }
}

export interface DashboardSnapshot {
  state: DashboardState;
  version: number;
}

export class NeonDashboardRepository {
  private readonly execute: SqlExecutor;

  constructor({ execute = createNeonExecutor() }: { execute?: SqlExecutor } = {}) {
    this.execute = execute;
  }

  async loadDashboardState(): Promise<DashboardSnapshot> {
    const rows = await this.execute(
      "SELECT version, state FROM dashboard_snapshots WHERE workspace_key = $1",
      [WORKSPACE_KEY],
    );
    if (rows.length === 0) {
      const state = createEmptyDashboardState();
      await this.execute(
        "INSERT INTO dashboard_snapshots (workspace_key, state) VALUES ($1, $2) ON CONFLICT (workspace_key) DO NOTHING RETURNING version",
        [WORKSPACE_KEY, state],
      );
      return this.loadDashboardState();
    }

    return { version: numericVersion(rows[0].version), state: validateState(rows[0].state) };
  }

  async saveDashboardState(state: DashboardState, expectedVersion: number, options: { includeState?: boolean } = {}): Promise<{ version: number; state?: DashboardState }> {
    const validated = validateState(state);
    const currentSnapshot = await this.loadDashboardState();
    if (currentSnapshot.version !== expectedVersion) throw new StaleDashboardStateError();
    assertNoActivePublicationPayloadEdit(currentSnapshot.state, validated);
    const previousById = new Map(currentSnapshot.state.contents.map((item) => [item.id, item]));
    const changedStatusIds = validated.contents.filter((item) => {
      const previous = previousById.get(item.id);
      return previous && (item.productionStatus === "editing" || item.productionStatus === "published")
        && (previous.productionStatus !== item.productionStatus
          || previous.lineReview.activeCycleId !== item.lineReview.activeCycleId);
    }).map((item) => item.id);
    if (changedStatusIds.length) {
      const activeJobs = await this.execute(
        "SELECT content_id FROM approved_publication_jobs WHERE content_id = ANY($1::text[]) AND status IN ('queued', 'publishing') LIMIT 1",
        [changedStatusIds],
      );
      if (activeJobs.length) throw new ActivePublicationEditError();
    }
    // Enqueue also advances this revision, so a job that appears after
    // the authoritative check makes this compare-and-swap fail instead of racing.
    const persisted = captureWorkStatusHistory(currentSnapshot.state, validated);
    const rows = await this.execute(
      "UPDATE dashboard_snapshots SET state = $2, version = version + 1, updated_at = now() WHERE workspace_key = $1 AND version = $3 RETURNING version",
      [WORKSPACE_KEY, persisted, expectedVersion],
    );
    if (rows.length === 0) throw new StaleDashboardStateError();
    return { version: numericVersion(rows[0].version), ...(options.includeState ? { state: persisted } : {}) };
  }
}

function assertNoActivePublicationPayloadEdit(previous: DashboardState, next: DashboardState): void {
  const activeStatuses = new Set(["submitting", "queued", "publishing"]);
  for (const attempt of previous.publicationAttempts) {
    if (!activeStatuses.has(attempt.status)) continue;
    const nextAttempt = next.publicationAttempts.find((candidate) => candidate.id === attempt.id);
    if (!nextAttempt || !activeStatuses.has(nextAttempt.status)) continue;
    const oldContent = previous.contents.find((content) => content.id === attempt.contentId);
    const newContent = next.contents.find((content) => content.id === attempt.contentId);
    const oldSchedule = oldContent?.schedules.find((schedule) => schedule.platform === attempt.platform);
    const newSchedule = newContent?.schedules.find((schedule) => schedule.platform === attempt.platform);
    const oldPayload = JSON.stringify({ caption: oldContent?.caption ?? "", formatId: oldContent?.formatId ?? "", assetIds: oldContent?.assetIds ?? [], publishAt: oldSchedule?.publishAt ?? null, enabled: oldSchedule?.enabled ?? false });
    const newPayload = JSON.stringify({ caption: newContent?.caption ?? "", formatId: newContent?.formatId ?? "", assetIds: newContent?.assetIds ?? [], publishAt: newSchedule?.publishAt ?? null, enabled: newSchedule?.enabled ?? false });
    if (oldPayload !== newPayload) throw new ActivePublicationEditError();
  }
}

function numericVersion(value: unknown): number {
  const version = Number(value);
  if (!Number.isSafeInteger(version) || version < 1) throw new Error("Invalid dashboard snapshot version");
  return version;
}

function validateState(value: unknown): DashboardState {
  try {
    return validateDashboardBackup({
      product: "INDY Content Studio",
      schemaVersion: 1,
      exportedAt: new Date(0).toISOString(),
      data: value,
      omittedMediaFiles: [],
    }).data as DashboardState;
  } catch (error) {
    if (error instanceof DashboardBackupValidationError) {
      throw new Error("ไม่รองรับข้อมูล dashboard", { cause: error });
    }
    throw error;
  }
}
