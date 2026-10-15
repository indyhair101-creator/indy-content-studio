"use client";

import { useRef, useState } from "react";
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
  const [accountId, setAccountId] = useState("");
  const requestInFlight = useRef(false);
  const check = async () => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/reports/connections", { cache: "no-store" });
      if (!response.ok) throw new Error(response.status === 401 ? "กรุณาเข้าสู่ระบบผู้ดูแลอีกครั้ง" : "ตรวจการเชื่อมต่อไม่สำเร็จ");
      const data = await response.json() as { connections: ReportConnection[]; setup: Setup; warnings?: string[] };
      setConnections(data.connections); setSetup(data.setup);
      await dashboard.mutate((current) => ({ ...current, reporting: { ...(current.reporting ?? emptyReportingState()), connections: data.connections } }));
      setNotice(data.warnings?.length ? data.warnings.join(" • ") : "ตรวจสถานะล่าสุดแล้ว การมีค่าตั้งค่าอย่างเดียวไม่ถือว่าเชื่อมต่อสำเร็จ");
    } catch (error) { setNotice(error instanceof Error ? error.message : "ตรวจการเชื่อมต่อไม่สำเร็จ"); } finally { requestInFlight.current = false; setBusy(false); }
  };
  const sync = async () => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/reports/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ range: range ?? presetRange("30d"), ...(accountId ? { accountId } : {}) }) });
      if (!response.ok) throw new Error(response.status === 401 ? "กรุณาเข้าสู่ระบบผู้ดูแลอีกครั้ง" : "อัปเดตข้อมูลไม่สำเร็จ");
      const data = await response.json() as Sync;
      setConnections((previous) => [...new Map([...(previous ?? dashboard.state?.reporting?.connections ?? []), ...data.connections].map((c) => [c.id, c])).values()]);
      await dashboard.mutate((current) => {
        const reporting = current.reporting ?? emptyReportingState();
        const publications = new Map(reporting.publications.map((p) => [p.id, p]));
        for (const p of data.publications) publications.set(p.id, { ...p, contentId: publications.get(p.id)?.contentId ?? null });
        const observations = new Map(reporting.observations.map((o) => [o.id, o]));
        for (const o of data.observations) observations.set(o.id, o);
        const updatedConnections = new Map(reporting.connections.map((c) => [c.id, c]));
        for (const c of data.connections) updatedConnections.set(c.id, c);
        return { ...current, reporting: { ...reporting, connections: [...updatedConnections.values()], publications: [...publications.values()], observations: [...observations.values()] } };
      });
      setNotice(`บันทึก ${data.publications.length} โพสต์ / ${data.observations.length} ชุดตัวเลข${data.warnings.length ? ` • ${data.warnings.join(" • ")}` : ""}`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "บันทึกข้อมูลไม่สำเร็จ"); } finally { requestInFlight.current = false; setBusy(false); }
  };
  const displayed = connections ?? dashboard.state?.reporting?.connections ?? [];
  return <section className="report-sync-panel" aria-label="การเชื่อมต่อข้อมูลรายงาน">
    <div className="report-sync-heading"><div><strong>ข้อมูลจากบัญชีที่เชื่อมไว้</strong><small>อ่านสถิติเท่านั้น ไม่แก้ไขหรือเผยแพร่โพสต์</small></div><button type="button" disabled={busy || !dashboard.state} onClick={() => void sync()}>{busy ? "กำลังดึงตัวเลขจริง…" : "ดึงข้อมูลล่าสุดจากโซเชียล"}</button></div>
    <div className="report-connection-pills">{displayed.filter(c => c.accountId).map(c => <span key={c.id} data-status={c.status}>{REPORT_PLATFORM_LABELS[c.platform]} · {statuses[c.status]}</span>)}</div>
    {notice && <p role="status" className="report-sync-notice">{notice}</p>}
    <details><summary>สถานะบัญชีและขอบเขตการดึงข้อมูล</summary>
    <p>ดึงสูงสุด 60 โพสต์ล่าสุดต่อบัญชีต่อรอบ ไม่ใช่ข้อมูลย้อนหลังทั้งหมด ยอดสะสมไม่ใช่ผลเฉพาะช่วงวันที่เลือก • แสดงข้อมูลที่บันทึกไว้ และดึงสถิติใหม่เฉพาะเมื่อกด “ดึงข้อมูลล่าสุดจากโซเชียล”</p>
    <label>บัญชีที่จะอัปเดต <select value={accountId} onChange={(event) => setAccountId(event.target.value)} disabled={busy}><option value="">ทุกบัญชีที่มีสิทธิ์</option>{displayed.filter((c) => c.accountId).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
    <div className="actions"><button type="button" disabled={busy} onClick={() => void check()}>ตรวจการเชื่อมต่อ / ตรวจใหม่</button></div>
    {!displayed.length && <p>ยังไม่ได้ตรวจบัญชี กดตรวจการเชื่อมต่อเพื่อดูสิทธิ์จริงและสิ่งที่ต้องตั้งค่า</p>}
    {displayed.map((c) => <article key={c.id} className="panel">
      <h3>{REPORT_PLATFORM_LABELS[c.platform]} · {c.label}</h3><p>{statuses[c.status]} — {c.message}</p>
      <p>ตรวจล่าสุด: {c.checkedAt ? new Date(c.checkedAt).toLocaleString("th-TH") : "ยังไม่ตรวจ"} • ตัวเลขที่อ่านได้: {c.availableMetrics.join(", ") || "ยังไม่มี"}</p>
      {c.id.startsWith("zernio:") ? <details><summary>ตรวจสิทธิ์ / เชื่อมบัญชีใหม่ผ่าน Zernio</summary><p>ให้ผู้ดูแลตรวจบัญชีนี้ใน Zernio และสิทธิ์ Analytics ของแผน จากนั้นกลับมากดตรวจใหม่ ระบบไม่ซื้อแผนหรือเริ่มเชื่อมบัญชีให้อัตโนมัติ</p><p>ยอดในรายการเป็น snapshot สะสมตามเวลาที่ Zernio อัปเดต ไม่ใช่ยอดกิจกรรมเฉพาะวันที่เลือก ค่าศูนย์ของตัวเลขที่แพลตฟอร์มไม่รองรับจะไม่ถูกนำมาแสดง</p></details>
        : setup?.[c.platform] && <details><summary>วิธีตั้งค่า / ต่ออายุสิทธิ์</summary><p>ให้ผู้ดูแลตั้งค่า environment บนเซิร์ฟเวอร์: {setup[c.platform].variables.join(", ")}</p><p>{setup[c.platform].permissions}</p><p>{setup[c.platform].limitation}</p><p>ระบบนี้ยังไม่มีหน้าล็อกอิน OAuth สำหรับเชื่อมบัญชีใหม่ ต้องรับสิทธิ์จากแพลตฟอร์มและตั้งค่าบนเซิร์ฟเวอร์ก่อนตรวจใหม่</p></details>}
    </article>)}
    </details>
  </section>;
}
