"use client";
import { useEffect, useRef, useState } from "react";
import { useDashboardData } from "../../data/DashboardDataProvider";
import type { ReportFilters } from "../report-types";
import { createReportSuggestionDraft, type ReportAnalysisResponse, type ReportSuggestion } from "../report-analysis";

const ERROR_LABELS: Record<string, string> = { unauthorized: "กรุณาเข้าสู่ระบบใหม่", invalid_origin: "ไม่สามารถยืนยันหน้าที่เรียกใช้งานได้ กรุณาโหลดหน้าใหม่", report_ai_not_configured: "AI รายงานยังไม่ได้ตั้งค่ารุ่นโมเดลหรือการเชื่อมต่อบนเซิร์ฟเวอร์", insufficient_evidence: "ยังไม่มีหลักฐานเพียงพอในตัวกรองนี้ กรุณานำเข้าข้อมูลหรือเลือกช่วงอื่น", evidence_too_large: "ข้อมูลมากเกินไป กรุณาลดช่วงเวลาหรือเลือกคอนเทนต์เดียว", invalid_ai_response: "คำตอบ AI อ้างอิงข้อมูลไม่ครบหรือรูปแบบไม่ถูกต้อง กรุณาลองใหม่", incomplete_ai_response: "AI ยังตอบไม่ครบ กรุณาลดขอบเขตข้อมูลแล้วลองใหม่", report_ai_unavailable: "AI ไม่พร้อมใช้งานชั่วคราว กรุณาลองใหม่" };
export function ReportAnalysisPanel({ kind, filters, sourceContentId, onOpenContent }: { kind: "team" | "content"; filters: ReportFilters; sourceContentId?: string; onOpenContent?: (id: string) => void }) {
  const { mutate } = useDashboardData();
  const [result, setResult] = useState<ReportAnalysisResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const selection = JSON.stringify({ kind, filters, sourceContentId });
  useEffect(() => { generation.current += 1; controller.current?.abort(); setBusy(false); setResult(null); setSaved({}); setError(""); return () => { controller.current?.abort(); }; }, [selection]);
  async function analyze() {
    const requestGeneration = ++generation.current;
    controller.current?.abort(); controller.current = new AbortController();
    setBusy(true); setError(""); setResult(null); setSaved({});
    try {
      const response = await fetch("/api/reports/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: selection, signal: controller.current.signal });
      const data = await response.json();
      if (requestGeneration !== generation.current) return;
      if (!response.ok) throw new Error(ERROR_LABELS[data.error] ?? "วิเคราะห์ไม่สำเร็จ กรุณาลองใหม่");
      setResult(data as ReportAnalysisResponse);
    } catch (caught) { if (requestGeneration === generation.current && !(caught instanceof Error && caught.name === "AbortError")) setError(caught instanceof Error ? caught.message : "วิเคราะห์ไม่สำเร็จ"); }
    finally { if (requestGeneration === generation.current) setBusy(false); }
  }
  async function saveDraft(suggestion: ReportSuggestion) {
    if (saving || saved[suggestion.id]) return;
    const id = `report-draft-${crypto.randomUUID()}`;
    setSaving(suggestion.id); setError("");
    try { await mutate((state) => createReportSuggestionDraft(state, suggestion, id, new Date().toISOString())); setSaved((current) => ({ ...current, [suggestion.id]: id })); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "บันทึกร่างไม่สำเร็จ"); }
    finally { setSaving(null); }
  }
  const citations = (ids: string[]) => <div className="report-citations">{ids.map((id) => { const item = result?.evidence.find((evidence) => evidence.id === id); return item ? <a key={id} href={`#report-evidence-${encodeURIComponent(id)}`}>{item.label}</a> : null; })}</div>;
  return <section className="report-panel report-analysis"><div className="report-header"><div><h2>AI วิเคราะห์{kind === "team" ? "การทำงานของทีม" : "ผลคอนเทนต์"}</h2><p>กดเพื่อส่งข้อมูลในตัวกรองนี้ให้ AI วิเคราะห์ แยกข้อเท็จจริง ข้อสันนิษฐาน และการทดลอง</p></div><button type="button" disabled={busy} onClick={() => void analyze()}>{busy ? "กำลังวิเคราะห์…" : "วิเคราะห์ด้วย AI"}</button></div>
    <p className="report-note">ข้อเสนอเป็นร่างสำหรับตรวจทาน ยังไม่มีการเปลี่ยนผู้รับผิดชอบหรือเผยแพร่อัตโนมัติ การวิเคราะห์อาจมีค่าใช้บริการโมเดลตามบัญชีที่ตั้งค่าไว้</p>
    {error && <p role="alert">{error}</p>}
    {result && <><p className="report-note">โมเดล {result.model} · {new Date(result.generatedAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })} · หลักฐาน {result.evidence.length} รายการ</p>
      <h3>ข้อเท็จจริงจากข้อมูล</h3>{result.analysis.facts.map((item, index) => <article className="report-card" key={index}><p>{item.text}</p>{citations(item.evidenceIds)}</article>)}{!result.analysis.facts.length && <p>ไม่มีข้อเท็จจริงเพิ่มเติมที่ AI ยืนยันจากชุดข้อมูลนี้</p>}
      <h3>ข้อสันนิษฐานที่ยังไม่ยืนยัน</h3>{result.analysis.hypotheses.map((item, index) => <article className="report-card" key={index}><p>{item.text}</p>{citations(item.evidenceIds)}</article>)}
      <h3>แผนทดลอง</h3>{result.analysis.experiments.map((item, index) => <article className="report-card" key={index}><h4>{item.title}</h4><p>{item.hypothesis}</p><p>ตัวชี้วัด: {item.metric} · เป้าหมาย: {item.target} · ประเมินใน {item.durationDays} วัน</p>{citations(item.evidenceIds)}</article>)}
      {kind === "team" && <><h3>ข้อเสนอจัดลำดับและแบ่งงาน</h3>{result.analysis.assignments.map((item, index) => <article className="report-card" key={index}><p>{item.owner || "ให้ทีมเลือกผู้รับผิดชอบ"}: {item.reason}</p>{citations(item.evidenceIds)}</article>)}</>}
      <h3>ไอเดียและร่างคอนเทนต์ต่อยอด</h3>{result.analysis.suggestions.map((item) => <article className="report-card" key={item.id}><h4>{item.title}</h4><p>ประโยคเปิด: {item.hook}</p><details><summary>สคริปต์และแคปชัน</summary><p style={{ whiteSpace: "pre-wrap" }}>{item.script}</p><p style={{ whiteSpace: "pre-wrap" }}>{item.caption}</p><p>{item.notes}</p></details>{citations(item.evidenceIds)}{saved[item.id] ? <p role="status">บันทึกเป็นงานร่างแล้ว <button onClick={() => onOpenContent?.(saved[item.id])}>เปิดงานร่าง</button></p> : <button disabled={saving !== null} onClick={() => void saveDraft(item)}>{saving === item.id ? "กำลังบันทึก…" : "บันทึกข้อเสนอเป็นงานร่าง"}</button>}</article>)}
      <h3>ข้อจำกัดของคำตอบ</h3><ul>{[...new Set([...result.warnings, ...result.analysis.limitations])].map((warning) => <li key={warning}>{warning}</li>)}</ul>
      <details><summary>หลักฐานต้นทางที่ใช้วิเคราะห์</summary>{result.evidence.map((item) => <article id={`report-evidence-${encodeURIComponent(item.id)}`} key={item.id}><h4>{item.label}</h4>{item.contentId && <button onClick={() => onOpenContent?.(item.contentId!)}>เปิดคอนเทนต์ต้นทาง</button>}<pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(item.data, null, 2)}</pre></article>)}</details>
    </>}
  </section>;
}
