import type { DashboardState, ReferenceIdea } from "../domain/types";

type ReferenceInput = {
  id: string;
  title: string;
  url: string;
  platform?: string;
  tags?: string[];
  notes?: string;
  now: string;
  albumId?: string | null;
  assetIds?: string[];
};

type ReferencePatch = Partial<Pick<ReferenceIdea, "title" | "url" | "platform" | "tags" | "notes" | "albumId" | "assetIds">>;

function toHttpsUrl(url: string) {
  if (!url.trim()) return "";
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error();
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
  return Boolean(url) && references.some((item) => item.id !== exceptId && !item.deletedAt && item.url === url);
}

function validateAttachments(state: DashboardState, albumId: string | null, assetIds: string[]) {
  if (albumId && !state.referenceAlbums?.some((album) => album.id === albumId)) throw new Error("ไม่พบอัลบั้มที่เลือก");
  if (new Set(assetIds).size !== assetIds.length || assetIds.some((id) => !state.media.some((asset) => asset.id === id && !asset.deletedAt))) throw new Error("ไม่พบไฟล์ที่แนบ");
}

export function saveReferenceAlbum(state: DashboardState, id: string, name: string, now: string): DashboardState {
  const clean = name.trim();
  if (!clean) throw new Error("กรุณาระบุชื่ออัลบั้ม");
  const albums = state.referenceAlbums ?? [];
  if (albums.some((album) => album.id !== id && album.name.toLocaleLowerCase() === clean.toLocaleLowerCase())) throw new Error("ชื่ออัลบั้มนี้มีอยู่แล้ว");
  const existing = albums.find((album) => album.id === id);
  const next = { id, name: clean, createdAt: existing?.createdAt ?? now, updatedAt: now };
  return { ...state, referenceAlbums: existing ? albums.map((album) => album.id === id ? next : album) : [...albums, next] };
}

export function addReference(state: DashboardState, input: ReferenceInput): DashboardState {
  const title = requiredTitle(input.title);
  const url = toHttpsUrl(input.url);
  if (hasActiveDuplicateUrl(state.references, url)) throw new Error("มีลิงก์นี้อยู่แล้ว");
  validateAttachments(state, input.albumId ?? null, input.assetIds ?? []);

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
    albumId: input.albumId ?? null,
    assetIds: input.assetIds ?? [],
  };
  return { ...state, references: [...state.references, reference] };
}

export function updateReference(state: DashboardState, id: string, patch: ReferencePatch, now?: string): DashboardState {
  const reference = state.references.find((item) => item.id === id);
  if (!reference) return state;

  const title = patch.title === undefined ? reference.title : requiredTitle(patch.title);
  const url = patch.url === undefined ? reference.url : toHttpsUrl(patch.url);
  if (!reference.deletedAt && hasActiveDuplicateUrl(state.references, url, id)) throw new Error("มีลิงก์นี้อยู่แล้ว");
  validateAttachments(state, patch.albumId === undefined ? reference.albumId ?? null : patch.albumId, patch.assetIds ?? reference.assetIds ?? []);

  const updated: ReferenceIdea = {
    ...reference,
    albumId: patch.albumId === undefined ? reference.albumId ?? null : patch.albumId,
    assetIds: patch.assetIds ?? reference.assetIds ?? [],
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
