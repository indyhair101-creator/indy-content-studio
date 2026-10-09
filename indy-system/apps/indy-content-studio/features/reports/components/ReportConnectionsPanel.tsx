"use client";

import { useState } from "react";
import { useDashboardData } from "../../data/DashboardDataProvider";
import { presetRange } from "../report-dates";
import { emptyReportingState, REPORT_PLATFORM_LABELS, type MetricObservation, type ReportConnection, type ReportPlatform, type ReportPublication, type ReportRange } from "../report-types";

type Setup = Record<ReportPlatform, { variables: string[]; permissions: string; limitation: string }>;
type Sync = { connections: ReportConnection[]; publications: ReportPublication[]; observations: MetricObservation[]; warnings: string[]; truncated: boolean };
const statuses: Record<ReportConnection["status"], string> = { connected: "อ่านข้อมูลได้", disconnected: "ยังไม่ตั้งค่า", expired: "สิทธิ์หมดอายุ", "missing-permission": "ขาดสิทธิ์", error: "อ่านได้ไม่ครบ / ขัดข้อง" };
export function ReportConnectionsPanel({ range }: { range?: ReportRange } = {}) {
  const dashboard = useDashboardData();
  const [connections, setConnections] = useState<ReportConnection[] | null>(null);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const check = async () => {
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/reports/connections", { cache: "no-store" });
      if (!response.ok) throw new Error(response.status === 401 ? "กรุณาเข้าสู่ระบบผู้ดูแลอีกครั้ง" : "ตรวจการเชื่อมต่อไม่สำเร็จ");
      const data = await response.json() as { connections: ReportConnection[]; setup: Setup };
      setConnections(data.connections); setSetup(data.setup);
      await dashboard.mutate((current) => ({ ...current, reporting: { ...(current.reporting ?? emptyReportingState()), connections: data.connections } }));
      setNotice("ตรวจสถานะล่าสุดแล้ว การมีค่าตั้งค่าอย่างเดียวไม่ถือว่าเชื่อมต่อสำเร็จ");
    } catch (error) { setNotice(error instanceof Error ? error.message : "ตรวจการเชื่อมต่อไม่สำเร็จ"); } finally { setBusy(false); }
  };
  const sync = async () => {
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/reports/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ range: range ?? presetRange("30d") }) });
      if (!response.ok) throw new Error(response.status === 401 ? "กรุณาเข้าสู่ระบบผู้ดูแลอีกครั้ง" : "อัปเดตข้อมูลไม่สำเร็จ");
      const data = await response.json() as Sync; setConnections(data.connections);
      await dashboard.mutate((current) => {
        const reporting = current.reporting ?? emptyReportingState();
        const publications = new Map(reporting.publications.map((p) => [p.id, p]));
        for (const p of data.publications) publications.set(p.id, { ...p, contentId: publications.get(p.id)?.contentId ?? null });
        const observations = new Map(reporting.observations.map((o) => [o.id, o]));
        for (const o of data.observations) observations.set(o.id, o);
        return { ...current, reporting: { ...reporting, connections: data.connections, publications: [...publications.values()], observations: [...observations.values()] } };
      });
      setNotice(`บันทึก ${data.publications.length} โพสต์ / ${data.observations.length} ชุดตัวเลข${data.warnings.length ? ` • ${data.warnings.join(" • ")}` : ""}`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "บันทึกข้อมูลไม่สำเร็จ"); } finally { setBusy(false); }
  };
  const displayed = connections ?? dashboard.state?.reporting?.connections ?? [];
  return <section className="panel" aria-label="การเชื่อมต่อข้อมูลรายงาน">
    <h2>การเชื่อมต่อข้อมูลรายงาน</h2>
    <p>ตรวจสิทธิ์และดึงข้อมูลแบบอ่านอย่างเดียว ตั้งค่า token เฉพาะบนเซิร์ฟเวอร์ ไม่มีช่องกรอกรหัสผ่านที่นี่</p>
    <p>ดึงสูงสุด 60 โพสต์ล่าสุดต่อบัญชีต่อรอบ ไม่ใช่ข้อมูลย้อนหลังทั้งหมด ยอดสะสมไม่ใช่ผลเฉพาะช่วงที่เลือก • YouTube Analytics ใช้วัน Pacific</p>
    <div className="actions"><button type="button" disabled={busy} onClick={() => void check()}>{busy ? "กำลังตรวจ / ดึงข้อมูล…" : "ตรวจการเชื่อมต่อ / ตรวจใหม่"}</button><button type="button" disabled={busy || !dashboard.state} onClick={() => void sync()}>อัปเดตข้อมูลและบันทึก snapshot</button></div>
    {notice && <p role="status">{notice}</p>}
    {!displayed.length && <p>ยังไม่ได้ตรวจบัญชี กดตรวจการเชื่อมต่อเพื่อดูสิทธิ์จริงและสิ่งที่ต้องตั้งค่า</p>}
    {displayed.map((c) => <article key={c.id} className="panel"><h3>{REPORT_PLATFORM_LABELS[c.platform]} · {c.label}</h3><p>{statuses[c.status]} — {c.message}</p><p>ตรวจล่าสุด: {c.checkedAt ? new Date(c.checkedAt).toLocaleString("th-TH") : "ยังไม่ตรวจ"} • ตัวเลขที่อ่านได้: {c.availableMetrics.join(", ") || "ยังไม่มี"}</p>{setup?.[c.platform] && <details><summary>วิธีตั้งค่า / ต่ออายุสิทธิ์</summary><p>ให้ผู้ดูแลตั้งค่า environment บนเซิร์ฟเวอร์: {setup[c.platform].variables.join(", ")}</p><p>{setup[c.platform].permissions}</p><p>{setup[c.platform].limitation}</p><p>ระบบนี้ยังไม่มีหน้าล็อกอิน OAuth สำหรับเชื่อมบัญชีใหม่ ต้องรับสิทธิ์จากแพลตฟอร์มและตั้งค่าบนเซิร์ฟเวอร์ก่อนตรวจใหม่</p></details>}</article>)}
  </section>;
}
