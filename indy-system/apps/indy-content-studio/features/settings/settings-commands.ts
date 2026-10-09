import type { DashboardState, FormatDefinition, Platform } from "../domain/types";

export interface SettingsItemMeta {
  id: string;
  now: string;
}

function cleanName(name: string): string {
  const cleaned = name.trim();
  if (!cleaned) throw new Error("กรุณาระบุชื่อ");
  return cleaned;
}

function ensureUnique(names: string[], name: string, duplicateMessage: string) {
  if (names.some((current) => current.localeCompare(name, undefined, { sensitivity: "accent" }) === 0)) {
    throw new Error(duplicateMessage);
  }
}

export function addCategory(state: DashboardState, name: string, meta: SettingsItemMeta): DashboardState {
  const cleaned = cleanName(name);
  ensureUnique(state.categories.map((item) => item.name.toLocaleLowerCase()), cleaned.toLocaleLowerCase(), "มีหมวดนี้อยู่แล้ว");
  return { ...state, categories: [...state.categories, { id: meta.id, name: cleaned, requiresApproval: false }] };
}

export function renameCategory(state: DashboardState, id: string, name: string): DashboardState {
  const cleaned = cleanName(name);
  ensureUnique(state.categories.filter((item) => item.id !== id).map((item) => item.name.toLocaleLowerCase()), cleaned.toLocaleLowerCase(), "มีหมวดนี้อยู่แล้ว");
  return { ...state, categories: state.categories.map((item) => item.id === id ? { ...item, name: cleaned } : item) };
}

export function setCategoryApprovalRequired(state: DashboardState, id: string, requiresApproval: boolean): DashboardState {
  return { ...state, categories: state.categories.map((item) => item.id === id ? { ...item, requiresApproval } : item) };
}

export function addOwnerOption(state: DashboardState, name: string): DashboardState {
  const cleaned = cleanName(name);
  ensureUnique(state.ownerOptions, cleaned, "มีชื่อผู้รับผิดชอบนี้อยู่แล้ว");
  return { ...state, ownerOptions: [...state.ownerOptions, cleaned] };
}

export function renameOwnerOption(state: DashboardState, currentName: string, name: string): DashboardState {
  const cleaned = cleanName(name);
  if (!state.ownerOptions.includes(currentName)) throw new Error("ไม่พบชื่อผู้รับผิดชอบนี้");
  ensureUnique(state.ownerOptions.filter((owner) => owner !== currentName), cleaned, "มีชื่อผู้รับผิดชอบนี้อยู่แล้ว");
  return {
    ...state,
    ownerOptions: state.ownerOptions.map((owner) => owner === currentName ? cleaned : owner),
    contents: state.contents.map((content) => content.owner === currentName ? { ...content, owner: cleaned } : content),
  };
}

export function deleteOwnerOption(state: DashboardState, name: string): DashboardState {
  return { ...state, ownerOptions: state.ownerOptions.filter((owner) => owner !== name) };
}

export function deleteCategory(state: DashboardState, id: string, now = new Date().toISOString()): DashboardState {
  const fallback = state.categories.find((item) => item.id !== id);
  const usesCategory = state.contents.some((content) => content.categoryId === id);
  if (usesCategory && !fallback) throw new Error("เพิ่มหมวดอื่นก่อนลบหมวดสุดท้าย เพื่อเก็บประเภทของงานเดิมไว้");
  return {
    ...state,
    categories: state.categories.filter((item) => item.id !== id),
    categoryMonthlyGoals: state.categoryMonthlyGoals.filter((goal) => goal.categoryId !== id),
    contents: fallback
      ? state.contents.map((content) => content.categoryId === id ? { ...content, categoryId: fallback.id, updatedAt: now } : content)
      : state.contents,
  };
}

export function addFormat(state: DashboardState, name: string, mediaKind: FormatDefinition["mediaKind"], allowedPlatforms: Platform[], meta: SettingsItemMeta): DashboardState {
  const cleaned = cleanName(name);
  ensureUnique(state.formats.map((item) => item.name.toLocaleLowerCase()), cleaned.toLocaleLowerCase(), "มีรูปแบบนี้อยู่แล้ว");
  return { ...state, formats: [...state.formats, { id: meta.id, name: cleaned, mediaKind, allowedPlatforms: [...allowedPlatforms] }] };
}

export function renameFormat(state: DashboardState, id: string, name: string): DashboardState {
  const cleaned = cleanName(name);
  ensureUnique(state.formats.filter((item) => item.id !== id).map((item) => item.name.toLocaleLowerCase()), cleaned.toLocaleLowerCase(), "มีรูปแบบนี้อยู่แล้ว");
  return { ...state, formats: state.formats.map((item) => item.id === id ? { ...item, name: cleaned } : item) };
}

export function deleteFormat(state: DashboardState, id: string): DashboardState {
  if (state.contents.some((content) => !content.deletedAt && content.formatId === id)) throw new Error("รูปแบบนี้มีชิ้นงานใช้อยู่");
  return { ...state, formats: state.formats.filter((item) => item.id !== id) };
}

export function setMonthlyGoal(state: DashboardState, month: string, target: number): DashboardState {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("เดือนต้องอยู่ในรูปแบบ YYYY-MM");
  if (!Number.isFinite(target) || target < 0) throw new Error("เป้าหมายต้องไม่ติดลบ");
  const goal = { month, target };
  const exists = state.monthlyGoals.some((item) => item.month === month);
  return { ...state, monthlyGoals: exists ? state.monthlyGoals.map((item) => item.month === month ? goal : item) : [...state.monthlyGoals, goal] };
}
