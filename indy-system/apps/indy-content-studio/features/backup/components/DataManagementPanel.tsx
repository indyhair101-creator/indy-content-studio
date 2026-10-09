"use client";

import { useState } from "react";
import { useDashboardData } from "../../data/DashboardDataProvider";
import { applyDashboardImport, parseDashboardBackup, previewDashboardImport, type DashboardBackupV1 } from "../import-dashboard";
import { exportDashboardState } from "../export-dashboard";
import { parseIdeasImport } from "../ideas-import";

async function readFile(file: File): Promise<string> { const candidate = file as File & { text?: () => Promise<string> }; if (candidate.text) return candidate.text(); return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result ?? "")); reader.onerror = () => reject(reader.error ?? new Error("อ่านไฟล์ไม่สำเร็จ")); reader.readAsText(file); }); }

function downloadJson(value: unknown, filename: string) { const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }); if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return; const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url); }

export function DataManagementPanel() {
  const dashboard = useDashboardData();
  const [backup, setBackup] = useState<DashboardBackupV1 | null>(null);
  const [preview, setPreview] = useState<ReturnType<typeof previewDashboardImport> | null>(null);
  const [replaceConfirmation, setReplaceConfirmation] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!dashboard.state) return <section><h2>สำรองและย้ายข้อมูล</h2><p>กำลังโหลดข้อมูล…</p></section>;

  function exportBackup() { downloadJson(exportDashboardState(dashboard.state!), `indy-content-studio-backup-${new Date().toISOString().slice(0, 10)}.json`); setNotice("สร้างไฟล์สำรองแล้ว"); }
  async function handleBackupFile(file: File | undefined) { if (!file) return; try { const parsed = parseDashboardBackup(await readFile(file)); setBackup(parsed); setPreview(previewDashboardImport(dashboard.state!, parsed, "merge")); setError(null); } catch (caught) { setBackup(null); setPreview(null); setError(caught instanceof Error ? caught.message : "อ่านไฟล์สำรองไม่สำเร็จ"); } }
  async function handleIdeasFile(file: File | undefined) { if (!file) return; try { const result = parseIdeasImport(await readFile(file), dashboard.state!); await dashboard.mutate(() => result.previewState); setError(null); setNotice(`นำเข้าไอเดียสำเร็จ ${result.report.mapped} รายการ`); } catch (caught) { setError(caught instanceof Error ? caught.message : "นำเข้าไอเดียไม่สำเร็จ"); } }
  async function apply(mode: "merge" | "replace") { if (!backup) return; if (mode === "replace" && replaceConfirmation !== "แทนที่ข้อมูล") { setError("พิมพ์ แทนที่ข้อมูล เพื่อยืนยัน"); return; } try { const before = exportDashboardState(dashboard.state!); if (mode === "replace") downloadJson(before, `indy-content-studio-pre-restore-${new Date().toISOString().slice(0, 10)}.json`); await dashboard.mutate((state) => applyDashboardImport(state, backup, { mode, preRestoreBackup: before })); setNotice("นำเข้าสำเร็จ"); setError(null); setBackup(null); setPreview(null); setReplaceConfirmation(""); } catch (caught) { setError(caught instanceof Error ? caught.message : "นำเข้าไม่สำเร็จ"); } }

  return <section className="settings-panel" aria-labelledby="data-management-heading"><div className="settings-panel-heading"><div><p className="panel-label">BACKUP / RESTORE</p><h2 id="data-management-heading">สำรองและย้ายข้อมูล</h2></div><button type="button" onClick={exportBackup}>ดาวน์โหลดไฟล์สำรอง</button></div><p className="settings-meta">ไฟล์สำรองเก็บเฉพาะ metadata ไม่รวม blob สื่อและ secret</p><label>เลือกไฟล์สำรอง<input aria-label="เลือกไฟล์สำรอง" type="file" accept="application/json" onChange={(event) => void handleBackupFile(event.target.files?.[0])} /></label><label>นำเข้าไอเดีย<input aria-label="เลือกไฟล์ไอเดีย" type="file" accept="application/json" onChange={(event) => void handleIdeasFile(event.target.files?.[0])} /></label>{error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}{preview && backup && <section className="settings-item"><div className="settings-item-main"><strong>ตัวอย่างไฟล์ {backup.exportedAt}</strong><span className="settings-meta">จะเพิ่มชิ้นงาน {preview.counts.contents} รายการ · media {preview.counts.media} · Reference {preview.counts.references} · เป้าหมายแยกหมวด {preview.counts.categoryMonthlyGoals}</span>{preview.omittedMediaFiles.length > 0 && <span className="settings-meta">ไม่รวมไฟล์สื่อ {preview.omittedMediaFiles.length} รายการ</span>}</div><div className="settings-item-actions"><button type="button" onClick={() => void apply("merge")}>รวมข้อมูล</button><label>ยืนยันแทนที่<input aria-label="ยืนยันแทนที่ข้อมูล" value={replaceConfirmation} onChange={(event) => setReplaceConfirmation(event.target.value)} placeholder="แทนที่ข้อมูล" /></label><button type="button" onClick={() => void apply("replace")}>แทนที่ข้อมูล</button></div></section>}</section>;
}
