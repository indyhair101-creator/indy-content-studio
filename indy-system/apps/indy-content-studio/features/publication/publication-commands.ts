import type { DashboardState, Platform, PublicationAttempt } from "../domain/types";
import { buildPublicationIdempotencyKey } from "./publication-eligibility";

export interface PublicationPlanInput {
  contentId: string;
  platform: Platform;
  publishAt: string;
  idempotencyKey?: string;
  attemptId?: string;
}

export function createPublicationAttempt(state: DashboardState, input: PublicationPlanInput, now: string): DashboardState {
  const content = state.contents.find((item) => item.id === input.contentId && !item.deletedAt);
  if (!content) throw new Error("ไม่พบคอนเทนต์สำหรับเผยแพร่");
  if (content.localApproval !== "approved") throw new Error("ต้องอนุมัติคอนเทนต์ก่อนเผยแพร่");
  if (content.productionStatus !== "ready") throw new Error("คอนเทนต์ยังไม่อยู่สถานะพร้อมเผยแพร่");
  const schedule = content.schedules.find((item) => item.platform === input.platform && item.enabled);
  if (!schedule) throw new Error("ยังไม่ได้เปิดช่องทางนี้ในกำหนดการ");

  if (schedule.publishAt && input.publishAt !== schedule.publishAt && input.publishAt !== schedule.publishAt.slice(0, 16)) throw new Error("เวลาส่งไม่ตรงกับกำหนดการของคอนเทนต์");
  const idempotencyKey = input.idempotencyKey ?? buildPublicationIdempotencyKey(content, input.platform, schedule);
  const existing = state.publicationAttempts.find((attempt) => attempt.idempotencyKey === idempotencyKey);
  if (existing) return state;
  const attempt: PublicationAttempt = { id: input.attemptId ?? `publication-${Date.now()}`, idempotencyKey, contentId: input.contentId, platform: input.platform, publishAt: input.publishAt, status: "local-plan", queueId: null, providerPublicationId: null, receiptUrl: null, errorCode: null, createdAt: now, updatedAt: now };
  return {
    ...state,
    contents: state.contents.map((item) => item.id !== content.id ? item : { ...item, schedules: item.schedules.map((itemSchedule) => itemSchedule.platform === input.platform ? { ...itemSchedule, latestAttemptId: attempt.id } : itemSchedule), updatedAt: now }),
    publicationAttempts: [...state.publicationAttempts, attempt],
  };
}

export function updatePublicationAttempt(state: DashboardState, attemptId: string, patch: Partial<Pick<PublicationAttempt, "status" | "queueId" | "providerPublicationId" | "receiptUrl" | "errorCode">>, now: string): DashboardState {
  if (!state.publicationAttempts.some((attempt) => attempt.id === attemptId)) throw new Error("ไม่พบรายการเผยแพร่");
  return { ...state, publicationAttempts: state.publicationAttempts.map((attempt) => attempt.id === attemptId ? { ...attempt, ...patch, updatedAt: now } : attempt) };
}

export function markPublicationEvidence(state: DashboardState, contentId: string, platform: Platform, evidence: { receiptUrl: string; note: string }, now: string): DashboardState {
  return {
    ...state,
    contents: state.contents.map((content) => content.id === contentId ? { ...content, schedules: content.schedules.map((schedule) => schedule.platform === platform ? { ...schedule, manualEvidence: { ...evidence, confirmedAt: now } } : schedule), updatedAt: now } : content),
  };
}
