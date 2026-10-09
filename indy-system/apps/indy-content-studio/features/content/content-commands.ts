import type { ContentItem, DashboardState, FormatDefinition } from "../domain/types";
import { contentToDraft, type ContentDraft, validateContentDraft } from "./content-draft";
import type { LineReviewState } from "../domain/types";
export function hasApprovalSensitiveChanges(content: ContentItem, draft: ContentDraft) { return content.caption !== draft.caption || content.assetIds.join("|") !== draft.assetIds.join("|"); }
export function saveContentDraft(content: ContentItem | null, draft: ContentDraft, now: string, format?: FormatDefinition): ContentItem {
  const validation = validateContentDraft(draft, now, format); if (!validation.valid) throw new Error(Object.values(validation.errors)[0]); const sensitive = content ? hasApprovalSensitiveChanges(content, draft) : false; const history = sensitive && content ? [...content.lineReview.history, { id: `approval-reset-${now}`, cycleId: content.lineReview.activeCycleId ?? "", event: "approval-reset" as const, comment: "แก้ไขสื่อหรือแคปชัน", occurredAt: now }] : content?.lineReview.history ?? [];
  return { id: content?.id ?? `content-${Date.now()}`, title: draft.title.trim(), categoryId: draft.categoryId, formatId: draft.formatId, owner: draft.owner, objective: draft.objective, priority: draft.priority, plannedWorkAt: draft.plannedWorkAt || null, lastWorkedAt: content?.lastWorkedAt ?? null, readyDate: draft.readyDate || null, productionStatus: draft.productionStatus, assetIds: [...draft.assetIds], processSteps: draft.processSteps.map((step) => ({ ...step })), caption: draft.caption, captionSource: content?.captionSource ?? null, schedules: draft.schedules.map((schedule) => ({ ...schedule })), referenceIds: [...draft.referenceIds], notes: draft.notes, localApproval: sensitive ? "pending" : draft.localApproval, lineReview: sensitive ? { ...content!.lineReview, status: "not-sent", activeCycleId: null, reviewCode: null, providerReceipts: [], lastEventAt: now, history } : content?.lineReview ?? { status: "not-sent", activeCycleId: null, reviewCode: null, providerReceipts: [], lastEventAt: null, history: [] }, createdAt: content?.createdAt ?? now, updatedAt: now, deletedAt: content?.deletedAt ?? null };
}
export function upsertDraft(state: DashboardState, content: ContentItem): DashboardState { const exists = state.contents.some((item) => item.id === content.id); return { ...state, contents: exists ? state.contents.map((item) => item.id === content.id ? content : item) : [...state.contents, content] }; }

export function copyContentAsNew(source: ContentItem, newId: string, now: string): ContentItem {
  const lineReview: LineReviewState = {
    status: "not-sent",
    activeCycleId: null,
    reviewCode: null,
    providerReceipts: [],
    lastEventAt: null,
    history: [],
  };
  return {
    ...source,
    id: newId,
    title: `${source.title} (สำเนา)`,
    assetIds: [...source.assetIds],
    captionSource: source.captionSource ? { ...source.captionSource, values: { ...source.captionSource.values } } : null,
    lastWorkedAt: null,
    readyDate: null,
    productionStatus: "waiting-shoot",
    processSteps: source.processSteps.map((step, index) => ({
      ...step,
      id: `${newId}-step-${index + 1}`,
      status: "todo",
    })),
    schedules: source.schedules.map((schedule) => ({
      ...schedule,
      enabled: false,
      publishAt: null,
      latestAttemptId: null,
      manualEvidence: null,
    })),
    referenceIds: [...source.referenceIds],
    lineReview,
    localApproval: "pending",
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

export function saveEditedContentDraft(state: DashboardState, baseline: ContentItem | null, draft: ContentDraft, now: string): DashboardState {
  if (!baseline) {
    const format = state.formats.find((item) => item.id === draft.formatId);
    return upsertDraft(state, saveContentDraft(null, draft, now, format));
  }
  const current = state.contents.find((item) => item.id === baseline.id && !item.deletedAt);
  if (!current) throw new Error("รายการนี้ถูกลบแล้ว กรุณาปิดตัวแก้ไขและโหลดข้อมูลใหม่");
  const originalDraft = contentToDraft(baseline);
  const currentDraft = contentToDraft(current);
  const changed: Partial<ContentDraft> = {};
  for (const key of Object.keys(draft) as Array<keyof ContentDraft>) {
    if (JSON.stringify(draft[key]) === JSON.stringify(originalDraft[key])) continue;
    if (JSON.stringify(currentDraft[key]) !== JSON.stringify(originalDraft[key])
      && JSON.stringify(currentDraft[key]) !== JSON.stringify(draft[key])) {
      throw new Error("ช่องที่คุณแก้ไขถูกแก้ไขจากอีกหน้าต่างหรือ ChatGPT แล้ว กรุณาปิดตัวแก้ไขและเปิดใหม่");
    }
    Object.assign(changed, { [key]: draft[key] });
  }
  const merged = { ...currentDraft, ...changed };
  const format = state.formats.find((item) => item.id === merged.formatId);
  return upsertDraft(state, saveContentDraft(current, merged, now, format));
}

export { contentToDraft };
