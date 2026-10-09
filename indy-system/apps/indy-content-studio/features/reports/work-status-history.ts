import type { DashboardState } from "../domain/types";
import type { WorkStatusEvent } from "./report-types";
import { bangkokDate, validDate } from "./report-dates";

export function workDate(value: string | null): string | null {
  if (!value) return null;
  if (validDate(value)) return value;
  // Existing datetime-local work plans are Bangkok wall time.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value)) return validDate(value.slice(0, 10)) ? value.slice(0, 10) : null;
  try { return bangkokDate(value); } catch { return null; }
}

type Work = Omit<WorkStatusEvent, "id" | "from" | "occurredAt" | "source">;
function works(state: DashboardState): Work[] {
  return [
    ...state.contents.filter((item) => !item.deletedAt).flatMap((item): Work[] => [
      { entity: "content", entityId: item.id, contentId: item.id, to: item.productionStatus, owner: item.owner, scheduledDate: workDate(item.readyDate ?? item.plannedWorkAt) },
      ...item.processSteps.map((step): Work => ({ entity: "step", entityId: step.id, contentId: item.id, to: step.status, owner: item.owner, scheduledDate: step.scheduledDate })),
    ]),
    ...state.actionTasks.map((task): Work => ({ entity: "action-task", entityId: task.id, contentId: null, to: task.status, owner: task.owner ?? "", scheduledDate: task.scheduledDate })),
  ];
}
function key(work: Pick<Work, "entity" | "contentId" | "entityId">): string { return JSON.stringify([work.entity, work.contentId, work.entityId]); }

/** The stored snapshot owns history. Client copies cannot erase or rewrite it. */
export function captureWorkStatusHistory(previous: DashboardState, next: DashboardState, occurredAt = new Date().toISOString(), source?: WorkStatusEvent["source"]): DashboardState {
  const history = [...(previous.statusHistory ?? [])];
  const known = new Set(history.map((event) => event.id));
  // Only the explicit backup importer can supply additional historical evidence.
  const imported = (next.statusHistory ?? []).filter((event) => !known.has(event.id) && event.id.startsWith("import:"));
  for (const event of imported) { history.push({ ...event }); known.add(event.id); }
  const before = new Map(works(previous).map((work) => [key(work), work]));
  for (const work of works(next)) {
    const old = before.get(key(work));
    if (old?.to === work.to) continue;
    if (imported.some((event) => key(event) === key(work) && event.to === work.to)) continue;
    const content = next.contents.find((item) => item.id === work.contentId);
    const oldContent = previous.contents.find((item) => item.id === work.contentId);
    const justPublished = content?.productionStatus === "published" && oldContent?.productionStatus !== "published";
    const synced = justPublished && next.publicationAttempts.some((attempt) => attempt.contentId === work.contentId && attempt.status === "published" && previous.publicationAttempts.find((oldAttempt) => oldAttempt.id === attempt.id)?.status !== "published");
    const eventSource = source ?? (synced ? "publication-sync" : justPublished ? "manual-publication" : "observed");
    const event: WorkStatusEvent = { ...work, id: `work:${key(work)}:${occurredAt}:${history.length}`, from: old?.to ?? null, occurredAt, source: eventSource };
    history.push(event);
  }
  return { ...next, statusHistory: history };
}

/** Import keeps evidence immutable and marks status-only imports as baselines, not completions. */
export function importWorkStatusHistory(current: DashboardState, next: DashboardState, incoming: WorkStatusEvent[] = [], occurredAt = new Date().toISOString()): DashboardState {
  const preserved = [...(current.statusHistory ?? [])];
  const ids = new Set(preserved.map((event) => event.id));
  for (const event of incoming) {
    const id = event.id.startsWith("import:") ? event.id : `import:${event.id}`;
    if (ids.has(event.id) || ids.has(id)) continue;
    preserved.push({ ...event, id }); ids.add(id);
  }
  const before = new Map(works(current).map((work) => [key(work), work]));
  for (const work of works(next)) {
    if (before.get(key(work))?.to === work.to) continue;
    // A baseline invalidates an old completion after restoring/reopening a record.
    const latest = preserved.filter((event) => key(event) === key(work)).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)).at(-1);
    if (latest?.to === work.to && incoming.some((event) => event.id === latest.id || `import:${event.id}` === latest.id)) continue;
    preserved.push({ ...work, id: `import:baseline:${key(work)}:${occurredAt}`, from: null, occurredAt, source: "import" });
  }
  return { ...next, statusHistory: preserved };
}

export function validateWorkStatusHistory(value: unknown): asserts value is WorkStatusEvent[] | undefined {
  if (value === undefined) return;
  if (!Array.isArray(value)) throw new Error("ประวัติสถานะไม่ถูกต้อง");
  const ids = new Set<string>();
  const statuses = { content: ["waiting-shoot", "shot", "editing", "review", "needs-changes", "ready", "published"], step: ["todo", "doing", "done"], "action-task": ["todo", "doing", "done"] };
  for (const raw of value) {
    if (!raw || typeof raw !== "object") throw new Error("ประวัติสถานะไม่ถูกต้อง");
    const event = raw as WorkStatusEvent;
    if (typeof event.id !== "string" || !event.id || ids.has(event.id) || !Object.hasOwn(statuses, event.entity)
      || typeof event.entityId !== "string" || !event.entityId || typeof event.owner !== "string"
      || (event.entity === "action-task" ? event.contentId !== null : typeof event.contentId !== "string" || !event.contentId)
      || !statuses[event.entity].includes(event.to) || (event.from !== null && !statuses[event.entity].includes(event.from))
      || typeof event.occurredAt !== "string" || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(event.occurredAt) || !validDate(event.occurredAt.slice(0, 10)) || !Number.isFinite(Date.parse(event.occurredAt))
      || (event.scheduledDate !== null && (typeof event.scheduledDate !== "string" || !validDate(event.scheduledDate)))
      || !["observed", "manual-publication", "publication-sync", "import"].includes(event.source)) throw new Error("ประวัติสถานะไม่ถูกต้อง");
    ids.add(event.id);
  }
}
