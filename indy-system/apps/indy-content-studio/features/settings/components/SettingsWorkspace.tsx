"use client";

import { useMemo, useState } from "react";
import { useDashboardData } from "../../data/DashboardDataProvider";
import { addCategory, addFormat, addOwnerOption, deleteCategory, deleteFormat, deleteOwnerOption, renameCategory, renameFormat, renameOwnerOption, setCategoryApprovalRequired, setMonthlyGoal } from "../settings-commands";
import type { FormatDefinition, IntegrationStatus, Platform } from "../../domain/types";
import { DataManagementPanel } from "../../backup/components/DataManagementPanel";
import { ContentTrashPanel } from "../../content/components/ContentTrashPanel";

type Notice = { kind: "success" | "error"; message: string } | null;
const platforms: Platform[] = ["facebook", "instagram", "tiktok"];
const providerLabels: Record<IntegrationStatus["provider"], string> = {
  database: "Database", "google-sheets": "Google Sheets", "google-drive": "Google Drive", blob: "Vercel Blob", line: "LINE OA", make: "Make", tiktok: "TikTok", "online-media": "Online Media", "ai-caption": "AI Caption",
};

function nextId(prefix: string) { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }

export function SettingsWorkspace() {
  const dashboard = useDashboardData();
  const [notice, setNotice] = useState<Notice>(null);
  const [categoryDialog, setCategoryDialog] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [editingOwner, setEditingOwner] = useState<string | null>(null);
  const [editingOwnerName, setEditingOwnerName] = useState("");
  const [formatDialog, setFormatDialog] = useState(false);
  const [formatName, setFormatName] = useState("");
  const [formatKind, setFormatKind] = useState<FormatDefinition["mediaKind"]>("image");
  const [goal, setGoal] = useState("");
  const [healthLoading, setHealthLoading] = useState(false);
  const [health, setHealth] = useState<IntegrationStatus[] | null>(null);
  const currentMonth = useMemo(() => new Date().toISOString().slice(0, 7), []);
  const savedGoal = dashboard.state?.monthlyGoals.find((item) => item.month === currentMonth)?.target;

  async function mutate(work: (state: NonNullable<typeof dashboard.state>) => NonNullable<typeof dashboard.state>, success: string) {
    try { await dashboard.mutate(work); setNotice({ kind: "success", message: success }); } catch (error) { setNotice({ kind: "error", message: error instanceof Error ? error.message : "บันทึกไม่สำเร็จ" }); }
  }

  function saveCategory() {
    void mutate((state) => addCategory(state, categoryName, { id: nextId("category"), now: new Date().toISOString() }), "เพิ่มหมวดแล้ว").then(() => { setCategoryName(""); setCategoryDialog(false); });
  }

  function saveFormat() {
    void mutate((state) => addFormat(state, formatName, formatKind, platforms, { id: nextId("format"), now: new Date().toISOString() }), "เพิ่มรูปแบบแล้ว").then(() => { setFormatName(""); setFormatDialog(false); });
  }

  async function saveOwnerOption() {
    try {
      await dashboard.mutate((state) => addOwnerOption(state, ownerName));
      setNotice({ kind: "success", message: "เพิ่มชื่อผู้รับผิดชอบแล้ว" });
      setOwnerName("");
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "เพิ่มชื่อไม่สำเร็จ" });
    }
  }

  async function saveOwnerRename(currentName: string) {
    try {
      await dashboard.mutate((state) => renameOwnerOption(state, currentName, editingOwnerName));
      setNotice({ kind: "success", message: "เปลี่ยนชื่อผู้รับผิดชอบแล้ว" });
      setEditingOwner(null);
      setEditingOwnerName("");
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "เปลี่ยนชื่อไม่สำเร็จ" });
    }
  }

  function refreshHealth() {
    setHealthLoading(true);
    void fetch("/api/integrations/health").then(async (response) => {
      if (!response.ok) throw new Error("ตรวจการเชื่อมต่อไม่สำเร็จ");
      setHealth((await response.json()).integrations);
      setNotice({ kind: "success", message: "อัปเดตสถานะการเชื่อมต่อแล้ว" });
    }).catch(() => setNotice({ kind: "error", message: "ตรวจการเชื่อมต่อไม่สำเร็จ" })).finally(() => setHealthLoading(false));
  }

  if (!dashboard.state) return <section aria-labelledby="settings-heading"><h1 id="settings-heading">ตั้งค่าและข้อมูล</h1><p>กำลังโหลดข้อมูล…</p></section>;
  const state = dashboard.state;
  return <section className="settings-workspace" aria-labelledby="settings-heading">
    <div className="workspace-heading-row"><div><p className="eyebrow">INDY / SETTINGS</p><h1 id="settings-heading">ตั้งค่าและข้อมูล</h1><p>จัดการ taxonomy, กติกาอนุมัติ และตรวจสุขภาพการเชื่อมต่อ</p></div>{notice && <p className={`settings-notice ${notice.kind}`} role="status">{notice.message}</p>}</div>
    <div className="settings-grid">
      <section className="settings-panel" aria-labelledby="categories-heading"><div className="settings-panel-heading"><div><p className="panel-label">TAXONOMY</p><h2 id="categories-heading">หมวดคอนเทนต์</h2></div><button type="button" onClick={() => setCategoryDialog(true)}>เพิ่มหมวด</button></div><p className="settings-meta">หมวดคอนเทนต์ใช้บอกว่าเนื้อหาเกี่ยวกับอะไร เช่น ความรู้ รีวิว หรือเบื้องหลัง</p>
        <div className="settings-list">{state.categories.map((category) => { const used = state.contents.some((content) => content.categoryId === category.id); const fallback = state.categories.find((item) => item.id !== category.id); return <article key={category.id} className="settings-item"><div className="settings-item-main">{editingCategory === category.id ? <input aria-label={`ชื่อหมวด${category.name}`} value={editingCategoryName} onChange={(event) => setEditingCategoryName(event.target.value)} /> : <strong>{category.name}</strong>}<label className="settings-checkbox"><input type="checkbox" checked={category.requiresApproval} onChange={(event) => void mutate((current) => setCategoryApprovalRequired(current, category.id, event.target.checked), "อัปเดตกติกาอนุมัติแล้ว")} />ต้องอนุมัติก่อนเผยแพร่</label></div><div className="settings-item-actions">{editingCategory === category.id ? <button type="button" onClick={() => { void mutate((current) => renameCategory(current, category.id, editingCategoryName), "เปลี่ยนชื่อหมวดแล้ว").then(() => setEditingCategory(null)); }} aria-label="บันทึกชื่อหมวด">บันทึก</button> : <button type="button" onClick={() => { setEditingCategory(category.id); setEditingCategoryName(category.name); }} aria-label="แก้ชื่อหมวด">แก้ชื่อ</button>}<button type="button" title={used ? `งานที่ใช้หมวดนี้จะย้ายไป ${fallback?.name ?? "หมวดอื่น"}` : undefined} onClick={() => void mutate((current) => deleteCategory(current, category.id), used && fallback ? `ลบหมวดแล้ว และย้ายงานไปที่ ${fallback.name}` : "ลบหมวดแล้ว")} aria-label={`ลบหมวด ${category.name}`}>ลบ</button></div>{used && <small>{fallback ? `หากลบ งานที่ใช้หมวดนี้จะย้ายไป ${fallback.name}` : "เพิ่มหมวดอื่นก่อนลบหมวดสุดท้ายที่ยังมีงานใช้อยู่"}</small>}</article>; })}</div>
      </section>
      <section className="settings-panel" aria-labelledby="owner-options-heading"><div className="settings-panel-heading"><div><p className="panel-label">TEAM</p><h2 id="owner-options-heading">ผู้รับผิดชอบ</h2></div></div><p className="settings-meta">รายชื่อเหล่านี้จะเป็นตัวเลือกในฟอร์มคอนเทนต์ การนำชื่อออกไม่เปลี่ยนชื่อที่บันทึกในงานเดิม</p>
        <form className="owner-option-form" onSubmit={(event) => { event.preventDefault(); void saveOwnerOption(); }}><label>เพิ่มชื่อผู้รับผิดชอบ<input aria-label="ชื่อผู้รับผิดชอบใหม่" value={ownerName} onChange={(event) => setOwnerName(event.target.value)} /></label><button type="submit" disabled={!ownerName.trim()}>เพิ่มชื่อ</button></form>
        <div className="settings-list">{state.ownerOptions.map((owner) => <article key={owner} className="settings-item"><div className="settings-item-main">{editingOwner === owner ? <input aria-label={`ชื่อผู้รับผิดชอบ ${owner}`} value={editingOwnerName} onChange={(event) => setEditingOwnerName(event.target.value)} /> : <strong>{owner}</strong>}</div><div className="settings-item-actions">{editingOwner === owner ? <button type="button" onClick={() => void saveOwnerRename(owner)} aria-label={`บันทึกชื่อ ${owner}`}>บันทึก</button> : <button type="button" onClick={() => { setEditingOwner(owner); setEditingOwnerName(owner); }} aria-label={`แก้ชื่อ ${owner}`}>แก้ชื่อ</button>}<button type="button" onClick={() => void mutate((current) => deleteOwnerOption(current, owner), `นำ ${owner} ออกจากตัวเลือกแล้ว`)} aria-label={`ลบชื่อ ${owner}`}>ลบ</button></div></article>)}</div>
      </section>
      <section className="settings-panel" aria-labelledby="formats-heading"><div className="settings-panel-heading"><div><p className="panel-label">OUTPUT</p><h2 id="formats-heading">รูปแบบการนำเสนอ</h2></div><button type="button" onClick={() => setFormatDialog(true)}>เพิ่มรูปแบบ</button></div><p className="settings-meta">รูปแบบการนำเสนอใช้บอกว่าจะเผยแพร่เป็นอะไร เช่น วิดีโอ ภาพเดี่ยว หรืออัลบั้ม</p>
        <div className="settings-list">{state.formats.map((format) => { const used = state.contents.some((content) => !content.deletedAt && content.formatId === format.id); return <article key={format.id} className="settings-item"><div className="settings-item-main"><strong>{format.name}</strong><span className="settings-meta">{format.mediaKind} · {format.allowedPlatforms.join(", ")}</span></div><div className="settings-item-actions"><button type="button" onClick={() => { const next = window.prompt("ชื่อรูปแบบ", format.name); if (next) void mutate((current) => renameFormat(current, format.id, next), "เปลี่ยนชื่อรูปแบบแล้ว"); }} aria-label={`แก้ชื่อรูปแบบ ${format.name}`}>แก้ชื่อ</button><button type="button" disabled={used} title={used ? "รูปแบบนี้มีชิ้นงานใช้อยู่" : undefined} onClick={() => void mutate((current) => deleteFormat(current, format.id), "ลบรูปแบบแล้ว")} aria-label={`ลบรูปแบบ ${format.name}`}>ลบ</button></div></article>; })}</div>
      </section>
      <section className="settings-panel" aria-labelledby="goals-heading"><p className="panel-label">PLANNING</p><h2 id="goals-heading">เป้าหมายรายเดือน</h2><p className="settings-meta">เดือนปัจจุบัน {currentMonth}</p><label>เป้าหมายเดือนนี้<input type="number" min="0" value={goal || savedGoal?.toString() || ""} onChange={(event) => setGoal(event.target.value)} /></label><button type="button" onClick={() => void mutate((current) => setMonthlyGoal(current, currentMonth, Number(goal || savedGoal || 0)), "บันทึกเป้าหมายแล้ว")}>บันทึกเป้าหมาย</button></section>
      <section className="settings-panel" aria-labelledby="health-heading"><div className="settings-panel-heading"><div><p className="panel-label">CONNECTIONS</p><h2 id="health-heading">การเชื่อมต่อ</h2></div><button type="button" onClick={refreshHealth} disabled={healthLoading}>{healthLoading ? "กำลังตรวจ…" : "ตรวจการเชื่อมต่อ"}</button></div><div className="settings-list">{(health ?? state.integrations).map((integration) => <article key={integration.provider} className="settings-item"><div className="settings-item-main"><strong>{providerLabels[integration.provider]}</strong><span className="settings-meta">{integration.message}</span></div><span className={`health-dot ${integration.status}`}>{integration.status}</span></article>)}</div></section>
    </div>
    <DataManagementPanel />
    <ContentTrashPanel />
    {categoryDialog && <div className="settings-dialog-backdrop"><section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="category-dialog-heading"><h2 id="category-dialog-heading">เพิ่มหมวดคอนเทนต์</h2><label>ชื่อหมวด<input autoFocus aria-label="ชื่อหมวด" value={categoryName} onChange={(event) => setCategoryName(event.target.value)} /></label><div className="settings-dialog-actions"><button type="button" onClick={() => setCategoryDialog(false)}>ยกเลิก</button><button type="button" onClick={saveCategory}>บันทึกหมวด</button></div></section></div>}
    {formatDialog && <div className="settings-dialog-backdrop"><section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="format-dialog-heading"><h2 id="format-dialog-heading">เพิ่มรูปแบบ</h2><label>ชื่อรูปแบบ<input autoFocus aria-label="ชื่อรูปแบบ" value={formatName} onChange={(event) => setFormatName(event.target.value)} /></label><label>ชนิดสื่อ<select aria-label="ชนิดสื่อ" value={formatKind} onChange={(event) => setFormatKind(event.target.value as FormatDefinition["mediaKind"])}><option value="image">ภาพ</option><option value="video">วิดีโอ</option><option value="other">อื่น ๆ</option></select></label><div className="settings-dialog-actions"><button type="button" onClick={() => setFormatDialog(false)}>ยกเลิก</button><button type="button" onClick={saveFormat}>บันทึกรูปแบบ</button></div></section></div>}
  </section>;
}
