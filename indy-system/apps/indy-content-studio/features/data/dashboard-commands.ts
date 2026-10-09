import type { ContentItem, DashboardState } from "../domain/types";

export function upsertContent(state: DashboardState, item: ContentItem): DashboardState {
  const exists = state.contents.some((content) => content.id === item.id);
  const contents = exists
    ? state.contents.map((content) => content.id === item.id ? item : content)
    : [...state.contents, item];

  return { ...state, contents };
}
