import type { DashboardState } from "../domain/types";

export function softDeleteContent(state: DashboardState, contentId: string, now: string): DashboardState {
  if (!state.contents.some((content) => content.id === contentId)) throw new Error("ไม่พบคอนเทนต์");
  return { ...state, contents: state.contents.map((content) => content.id === contentId ? { ...content, deletedAt: now, updatedAt: now } : content) };
}

export function restoreContent(state: DashboardState, contentId: string, now: string): DashboardState {
  return { ...state, contents: state.contents.map((content) => content.id === contentId ? { ...content, deletedAt: null, updatedAt: now } : content) };
}

export function permanentlyDeleteContent(state: DashboardState, contentId: string): DashboardState {
  return { ...state, contents: state.contents.filter((content) => content.id !== contentId), corrections: state.corrections.filter((item) => item.contentId !== contentId), publicationAttempts: state.publicationAttempts.filter((item) => item.contentId !== contentId) };
}
