import type { DashboardState, ReferenceIdea } from "../domain/types";

type ReferenceInput = {
  id: string;
  title: string;
  url: string;
  platform?: string;
  tags?: string[];
  notes?: string;
  now: string;
};

type ReferencePatch = Partial<Pick<ReferenceIdea, "title" | "url" | "platform" | "tags" | "notes">>;

function toHttpsUrl(url: string) {
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== "https:") throw new Error();
    return parsed.toString();
  } catch {
    throw new Error("ลิงก์อ้างอิงต้องเป็น https");
  }
}

function requiredTitle(title: string) {
  const clean = title.trim();
  if (!clean) throw new Error("กรุณาระบุชื่อไอเดีย");
  return clean;
}

function cleanTags(tags: string[] = []) {
  const values = tags.map((tag) => tag.trim()).filter(Boolean);
  if (new Set(values.map((tag) => tag.toLowerCase())).size !== values.length) {
    throw new Error("แท็กซ้ำกัน");
  }
  return values;
}

function hasActiveDuplicateUrl(references: ReferenceIdea[], url: string, exceptId?: string) {
  return references.some((item) => item.id !== exceptId && !item.deletedAt && item.url === url);
}

export function addReference(state: DashboardState, input: ReferenceInput): DashboardState {
  const title = requiredTitle(input.title);
  const url = toHttpsUrl(input.url);
  if (hasActiveDuplicateUrl(state.references, url)) throw new Error("มีลิงก์นี้อยู่แล้ว");

  const reference: ReferenceIdea = {
    id: input.id,
    title,
    url,
    platform: input.platform?.trim() || "ไม่ระบุ",
    tags: cleanTags(input.tags),
    notes: input.notes?.trim() || "",
    createdAt: input.now,
    updatedAt: input.now,
    deletedAt: null,
  };
  return { ...state, references: [...state.references, reference] };
}

export function updateReference(state: DashboardState, id: string, patch: ReferencePatch, now?: string): DashboardState {
  const reference = state.references.find((item) => item.id === id);
  if (!reference) return state;

  const title = patch.title === undefined ? reference.title : requiredTitle(patch.title);
  const url = patch.url === undefined ? reference.url : toHttpsUrl(patch.url);
  if (!reference.deletedAt && hasActiveDuplicateUrl(state.references, url, id)) throw new Error("มีลิงก์นี้อยู่แล้ว");

  const updated: ReferenceIdea = {
    ...reference,
    title,
    url,
    platform: patch.platform === undefined ? reference.platform : patch.platform.trim() || "ไม่ระบุ",
    tags: patch.tags === undefined ? reference.tags : cleanTags(patch.tags),
    notes: patch.notes === undefined ? reference.notes : patch.notes.trim(),
    updatedAt: now ?? reference.updatedAt,
  };

  return {
    ...state,
    references: state.references.map((item) => (item.id === id ? updated : item)),
  };
}

export function deleteReference(state: DashboardState, id: string, now: string): DashboardState {
  return {
    ...state,
    references: state.references.map((item) =>
      item.id === id ? { ...item, deletedAt: now, updatedAt: now } : item,
    ),
  };
}
