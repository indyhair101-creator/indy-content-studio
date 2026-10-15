"use client";

import { useState, type ReactNode } from "react";
import { useDashboardData } from "../../data/DashboardDataProvider";
import { defaultReportFilters, previousRange, bangkokDate } from "../report-dates";
import { aggregateInsightMetric, comparisonCompatible, completeMetricCoverage, exactAgeSnapshot, groupInsightContents, metricObservations, safePostUrl, selectInsightPublications, type InsightPublication } from "../insight-selectors";
import { REPORT_PLATFORM_LABELS, type MetricKey, type ReportFilters } from "../report-types";
import { ReportFilterBar } from "./ReportFilterBar";
import { METRIC_DEFINITIONS } from "../metric-definitions";
import { VideoRankings } from "./VideoRankings";
import { InsightOverview } from "./InsightOverview";

const labels: Record<MetricKey, string> = { views: "รับชม (ครั้ง)", reach: "เข้าถึงรายโพสต์", uniqueViewers: "ผู้ชมไม่ซ้ำรายโพสต์", likes: "ถูกใจ", comments: "ความคิดเห็น", shares: "แชร์", saves: "บันทึก", followers: "ติดตาม", clicks: "คลิก", conversions: "ผลลัพธ์ธุรกิจ", watchSeconds: "เวลารับชมรวม (วินาที)", averageWatchSeconds: "ดูเฉลี่ย (วินาที)", averageWatchPercent: "สัดส่วนดูเฉลี่ย (%)", completionRate: "อัตราดูจบ (%)" };
const number = (value: number | null | undefined) => value === null || value === undefined ? "ไม่มีข้อมูล" : value.toLocaleString("th-TH", { maximumFractionDigits: 2 });
type Tab = "overview" | "results" | "deep" | "video" | "ai" | "saved";
const tabs: [Tab, string][] = [["overview", "ภาพรวม"], ["results", "ผลรายคอนเทนต์"], ["deep", "เจาะลึก"], ["video", "วิเคราะห์วิดีโอ"], ["ai", "AI วิเคราะห์"], ["saved", "รายงานที่บันทึก"]];

function PublicationDetails({ row }: { row: InsightPublication }) {
  const { state } = useDashboardData();
  const snapshots = state?.reporting?.observations ?? [];
  const traffic = row.observations[0]?.traffic;
  const url = safePostUrl(row.publication.url);
  const retention = row.observations.find(o => o.retention?.length)?.retention;
  const retentionMax = Math.max(...(retention ?? []).map(point => point.positionSeconds), 1);
  const retentionRatioMax = Math.max(...(retention ?? []).map(point => point.ratio), 1);
  return <section className="report-card">
    <h4>{REPORT_PLATFORM_LABELS[row.publication.platform]} · {row.publication.title}</h4>
    <p>เผยแพร่ {row.publication.publishedAt} · บัญชี {row.publication.accountId} · ความยาว {number(row.publication.durationSeconds)} วินาที</p>
    {url && <a href={url} target="_blank" rel="noopener noreferrer">เปิดโพสต์จริง ↗</a>}
    <dl className="report-metrics">{Object.entries(labels).map(([metric, label]) => <div className="report-stat" key={metric}><dt title={METRIC_DEFINITIONS[metric as MetricKey].note}>{label}</dt><dd>{number(row.metrics[metric as MetricKey])}</dd></div>)}</dl>
    <p>ครั้งรับชมอาจรวมคนเดิมหลายครั้ง การเข้าถึงและผู้ชมไม่ซ้ำแสดงเฉพาะรายโพสต์ · สัดส่วนดูเฉลี่ยกับอัตราดูจบเป็นคนละตัวชี้วัด</p>
    {row.publication.mediaKind === "video" && <><h4>ผลตามอายุหลังเผยแพร่จริง</h4><table className="report-table"><thead><tr><th>อายุ</th><th>รับชม (ครั้ง)</th><th>ดูเฉลี่ย (วินาที)</th><th>หลักฐาน</th></tr></thead><tbody>{([24, 168, 720] as const).map(hours => { const snapshot = traffic ? exactAgeSnapshot(row.publication, snapshots, hours, traffic) : null; return <tr key={hours}><th>{hours === 24 ? "24 ชั่วโมง" : `${hours / 24} วัน`}</th><td>{number(snapshot?.metrics.views)}</td><td>{number(snapshot?.metrics.averageWatchSeconds)}</td><td>{snapshot ? `${snapshot.id} · ${snapshot.traffic} · ${snapshot.fetchedAt}` : "ไม่มี snapshot ตรงอายุ"}</td></tr>; })}</tbody></table><p>ใช้เฉพาะ snapshot สะสมที่เวลาตรงอายุจริง ไม่ประมาณย้อนจากยอดล่าสุด · ผลหลังดูแสดงเป็นจำนวนเมื่อไม่มีฐานอัตราที่แพลตฟอร์มยืนยัน</p></>}
    <h4>การดูต่อและจุดออก</h4>
    {retention?.length ? <><svg viewBox="0 0 640 180" role="img" aria-label="การดูต่อตามตำแหน่งวิดีโอจากข้อมูลต้นทาง"><text x="0" y="20" fontSize="12">{number(retentionRatioMax * 100)}%</text><text x="0" y="150" fontSize="12">0%</text><text x="50" y="175" fontSize="12">0 วินาที</text><text x="630" y="175" fontSize="12" textAnchor="end">{number(retentionMax)} วินาที</text><line x1="50" x2="630" y1={150 - 130 / retentionRatioMax} y2={150 - 130 / retentionRatioMax} stroke="currentColor" strokeDasharray="4 4" opacity="0.3" /><polyline fill="none" stroke="currentColor" strokeWidth="3" points={[...retention].sort((a, b) => a.positionSeconds - b.positionSeconds).map(p => `${50 + p.positionSeconds / retentionMax * 580},${150 - p.ratio / retentionRatioMax * 130}`).join(" ")} /></svg><p>แกนตั้ง 0–{number(retentionRatioMax * 100)}% · เส้นประคือ 100% · ค่ามากกว่า 100% คงตามต้นทาง อาจรวมการดูซ้ำตามนิยามแพลตฟอร์ม</p><table className="report-table"><thead><tr><th>ตำแหน่ง (วินาที)</th><th>สัดส่วนดูต่อ</th></tr></thead><tbody>{retention.map((p, i) => <tr key={i}><td>{number(p.positionSeconds)}</td><td>{number(p.ratio * 100)}%</td></tr>)}</tbody></table><p>กราฟใช้จุดที่แหล่งข้อมูลส่งมา ไม่อนุมานจุดออกหรือการดูซ้ำจากยอดรวม</p></> : <p className="report-empty">ยังไม่มีข้อมูล retention จากแหล่งข้อมูล จึงยังระบุจุดออกและการดูซ้ำไม่ได้</p>}
    <h4>แหล่งข้อมูล</h4>
    {row.observations.length ? <ul>{row.observations.map(o => <li key={o.id}>{o.sourceLabel} ({o.source}) · {o.traffic} · {o.scope === "lifetime" ? "สะสมตลอดอายุโพสต์" : `${o.period?.start} – ${o.period?.end}`} · เขตเวลา {o.timeZone ?? "ตามแหล่งข้อมูล / ไม่ระบุ"} · ดึงล่าสุด {o.fetchedAt} · หลักฐาน {o.id}</li>)}</ul> : <p>ยังไม่มีตัวเลขที่ตรงกับช่วงเวลาและแหล่งยอดที่เลือก</p>}
  </section>;
}

export interface InsightsReportWorkspaceProps {
  onOpenContent?: (id: string) => void;
  renderAnalysis?: (filters: ReportFilters) => ReactNode;
  renderSaved?: (filters: ReportFilters) => ReactNode;
  renderActions?: (filters: ReportFilters) => ReactNode;
  renderSources?: (filters: ReportFilters) => ReactNode;
}
export function InsightsReportWorkspace({ onOpenContent, renderAnalysis, renderSaved, renderActions, renderSources }: InsightsReportWorkspaceProps) {
  const { state, status, error } = useDashboardData();
  const [filters, setFilters] = useState<ReportFilters>(() => defaultReportFilters());
  const [tab, setTab] = useState<Tab>("overview");
  const [query, setQuery] = useState("");
  const [metric, setMetric] = useState<MetricKey>("views");
  const [target, setTarget] = useState("");
  const [resultFilter, setResultFilter] = useState("all");
  const [oldOnly, setOldOnly] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  if (!state) return <section className="report-workspace"><h2>Report ข้อมูลเชิงลึก</h2><p role="status">{status === "loading" ? "กำลังโหลดข้อมูล…" : error?.message ?? "ยังไม่มีข้อมูล"}</p></section>;
  const activeFilters = { ...filters, videoOnly: tab === "video" || filters.videoOnly };
  const rows = selectInsightPublications(state, activeFilters);
  const previous = selectInsightPublications(state, { ...activeFilters, range: previousRange(filters.range) });
  const deltaAvailable = (key: MetricKey) => completeMetricCoverage(rows, key, activeFilters) && completeMetricCoverage(previous, key, { ...activeFilters, range: previousRange(filters.range) }) && aggregateInsightMetric([...rows, ...previous], key) !== null;
  const groups = groupInsightContents(rows).filter(group => group.content.title.toLowerCase().includes(query.toLowerCase()));
  const compareRows = rows.filter(row => selected.includes(row.publication.id));
  const comparable = comparisonCompatible(compareRows);
  const threshold = target.trim() === "" ? null : Number(target);
  const visibleGroups = groups.filter(group => (!oldOnly || filters.dateBasis !== "activity" || group.publications.some(row => bangkokDate(row.publication.publishedAt) < filters.range.start)) && (resultFilter === "all" || threshold !== null && group.publications.some(row => { const value = row.metrics[metric]; return value !== null && value !== undefined && (resultFilter === "good" ? value >= threshold : value < threshold); })));
  const overviewMetrics: MetricKey[] = tab === "video" ? ["views", "averageWatchSeconds", "watchSeconds", "shares", "saves", "followers"] : ["views", "likes", "comments", "shares", "clicks", "conversions"];
  const daily = new Map<string, InsightPublication[]>();
  for (const row of rows) for (const o of metricObservations(row.observations, metric)) if (o.scope === "activity" && o.period?.start === o.period?.end) {
    const day = o.period!.start;
    daily.set(day, [...daily.get(day) ?? [], { ...row, observations: [o], metrics: o.metrics }]);
  }
  const trend = [...daily.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, items]) => ({ day, value: aggregateInsightMetric(items, metric), count: items.length }));
  const latest = rows.flatMap(row => row.observations.map(o => o.fetchedAt)).sort().at(-1);
  const breakdown = (key: "categoryId" | "formatId" | "weekday") => {
    const buckets = new Map<string, InsightPublication[]>();
    rows.forEach(row => { const name = key === "weekday" ? new Intl.DateTimeFormat("th-TH", { weekday: "long", hour: "2-digit", timeZone: "Asia/Bangkok" }).format(new Date(row.publication.publishedAt)) : (key === "categoryId" ? state.categories : state.formats).find(item => item.id === row.content[key])?.name ?? "ไม่ระบุ"; buckets.set(name, [...buckets.get(name) ?? [], row]); });
    return <table className="report-table"><thead><tr><th>กลุ่ม</th><th>คอนเทนต์</th><th>โพสต์ (ขนาดตัวอย่าง)</th><th>{labels[metric]}</th></tr></thead><tbody>{[...buckets].map(([name, items]) => <tr key={name}><th>{name}</th><td>{new Set(items.map(item => item.content.id)).size}</td><td>{items.length}</td><td>{number(aggregateInsightMetric(items, metric))}</td></tr>)}</tbody></table>;
  };
  return <section className="report-workspace">
    <header className="report-header"><div><span className="insight-eyebrow">INDY · CONTENT INTELLIGENCE</span><h2>Report ข้อมูลเชิงลึก</h2><p>เห็นผลจากทุกโพสต์ เรียนรู้จากตัวเลข แล้ววางแผนคอนเทนต์ต่อไป</p></div>{renderActions?.(activeFilters)}</header>
    <ReportFilterBar filters={filters} onChange={setFilters} state={state} />
    {renderSources?.(activeFilters)}
    <nav className="report-tabs" aria-label="ส่วนรายงานข้อมูลเชิงลึก">{tabs.filter(([id]) => (id !== "ai" || renderAnalysis) && (id !== "saved" || renderSaved)).map(([id, label]) => <button type="button" key={id} aria-pressed={tab === id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>)}</nav>
    <p className="report-notice">{filters.dateBasis === "activity" ? "ผลลัพธ์ที่เกิดในช่วงนี้: ใช้เฉพาะช่วงข้อมูลที่อยู่ภายในวันที่เลือก ไม่แบ่งยอดรวมให้เป็นรายวันโดยประมาณ" : "โพสต์ที่เผยแพร่ในช่วงนี้: แสดงยอดสะสมล่าสุดตลอดอายุโพสต์ ไม่ใช่ยอดที่เกิดเฉพาะช่วงวันที่เลือก"}</p>
    <p>{groups.length} คอนเทนต์ · {rows.length} โพสต์ · มีข้อมูล {rows.filter(row => Object.values(row.metrics).some(value => value !== null)).length}/{rows.length} โพสต์ · อัปเดตล่าสุด {latest ?? "ยังไม่มีข้อมูล"}</p>
    <details className="report-methodology"><summary>วิธีอ่านตัวเลขและขอบเขตข้อมูล</summary><p>ไม่รวมผู้ชมไม่ซ้ำข้ามโพสต์ ค่าเฉลี่ยต้องมีฐานถ่วงน้ำหนักที่ยืนยันได้ “ไม่มีข้อมูล” ไม่ใช่ศูนย์ ยอดที่ไม่ทราบแหล่งไม่ถูกเรียกว่า Organic · โพสต์ที่ยังไม่จับคู่แสดงได้ แต่จะไม่อยู่ในตัวกรองผู้รับผิดชอบ หมวด หรือเป้าหมาย</p></details>
    {tab === "ai" ? renderAnalysis?.(activeFilters) ?? <p className="report-empty">ยังไม่มีผลวิเคราะห์ที่สร้างจากหลักฐานชุดนี้</p> : tab === "saved" ? renderSaved?.(activeFilters) ?? <p className="report-empty">ยังไม่มีรายงานที่บันทึกในส่วนนี้</p> : <>
      {(tab === "overview" || tab === "video") && <InsightOverview rows={rows} metric={metric} video={tab === "video"} />}
      <div className="report-filters"><label>ตัวชี้วัด<select value={metric} onChange={e => setMetric(e.target.value as MetricKey)}>{Object.entries(labels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label></div>
      {tab === "video" && <VideoRankings rows={rows} metric={metric} onOpenContent={onOpenContent} />}
      {tab === "overview" && filters.dateBasis === "activity" && <section className="report-card"><h3>แนวโน้มรายวัน · {labels[metric]}</h3>{trend.length ? <table className="report-table"><thead><tr><th>วัน</th><th>ผลลัพธ์</th><th>โพสต์ที่มีข้อมูลรายวัน</th><th>แนวโน้ม</th></tr></thead><tbody>{trend.map(point => <tr key={point.day}><th>{point.day}</th><td>{number(point.value)}</td><td>{point.count}</td><td>{point.value !== null && <meter aria-label={`${point.day} ${labels[metric]}`} min={0} max={Math.max(...trend.map(p => p.value ?? 0), 1)} value={point.value} />}</td></tr>)}</tbody></table> : <p>ไม่มีข้อมูลรายวันจริงในชุดนี้ เลือกฐานโพสต์ที่เผยแพร่ในช่วงนี้เพื่อดูยอดสะสมที่ดึงมาแล้ว</p>}<p>วันและโพสต์ที่ไม่มีข้อมูลไม่ถูกเติมเป็นศูนย์ รายงานช่วงหลายวันไม่ถูกกระจายเป็นรายวัน</p></section>}
      {tab === "deep" ? <div className="report-grid"><section className="report-card"><h3>ตามหมวด / หัวข้อ</h3>{breakdown("categoryId")}</section><section className="report-card"><h3>ตามรูปแบบ</h3>{breakdown("formatId")}</section><section className="report-card"><h3>วันและเวลาลง (กรุงเทพฯ)</h3>{breakdown("weekday")}<p>ตัวอย่างต่างขนาดและอายุโพสต์ต่างกัน ไม่สรุปว่าเวลาลงเป็นสาเหตุของผลลัพธ์</p></section><section className="report-card"><h3>ผู้ชม พื้นที่ และแหล่งที่มา</h3><p>ยังไม่มีข้อมูลมิติผู้ชมที่ได้รับอนุญาตในชุดข้อมูลนี้</p></section></div> : <>
        {tab === "video" && <section className="report-card"><h3>ขอบเขตวิดีโอ</h3><div className="report-filters"><label>ความยาวต่ำสุด (วินาที)<input type="number" min="0" value={filters.minDuration ?? ""} onChange={e => setFilters({ ...filters, minDuration: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) })} /></label><label>ความยาวสูงสุด (วินาที)<input type="number" min="0" value={filters.maxDuration ?? ""} onChange={e => setFilters({ ...filters, maxDuration: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) })} /></label></div><p>ค่าเฉลี่ยวินาที สัดส่วนดูเฉลี่ย และดูจบแสดงแยกกันในรายละเอียด · เปิดรายละเอียดเพื่อดู 24 ชั่วโมง / 7 วัน / 30 วันเมื่อมี snapshot ที่ตรงอายุจริง</p></section>}
        <section className="report-card"><h3>ผลรายคอนเทนต์</h3><div className="report-filters"><label>ค้นหาคอนเทนต์<input value={query} onChange={e => setQuery(e.target.value)} placeholder="ชื่อคอนเทนต์" /></label><label>เป้าหมายตัวเลขของตัวชี้วัดที่เลือก<input type="number" min="0" value={target} onChange={e => setTarget(e.target.value)} /></label><label>ผลเทียบเป้าหมาย<select value={resultFilter} onChange={e => setResultFilter(e.target.value)}><option value="all">ทั้งหมด</option><option value="good">ถึงเป้าหมายที่ระบุ</option><option value="below">ต่ำกว่าเป้าหมายที่ระบุ</option></select></label><label><input type="checkbox" checked={oldOnly} disabled={filters.dateBasis !== "activity"} onChange={e => setOldOnly(e.target.checked)} />คอนเทนต์เก่าที่มีผลในช่วงนี้</label></div>
          {resultFilter !== "all" && threshold === null && <p role="status">ระบุเป้าหมายตัวเลขก่อนกรองผล ยังไม่มีเป้าหมายประสิทธิภาพเริ่มต้น</p>}
          {!visibleGroups.length && <p className="report-empty">ไม่มีคอนเทนต์ตรงกับตัวกรอง หรือยังไม่มีข้อมูลโพสต์ที่จับคู่แล้ว</p>}
          {visibleGroups.map(group => <details className="report-content-row" key={group.content.id}><summary>{group.content.title} · {group.content.objective || "ยังไม่จับคู่ปฏิทิน"} · {group.publications.length} ช่องทาง/โพสต์</summary>{onOpenContent && group.publications.some(row => row.publication.contentId) && <button type="button" onClick={() => onOpenContent(group.content.id)}>เปิดคอนเทนต์</button>}<table className="report-table"><thead><tr><th>เทียบ</th><th>หน้าปก / ช่องทาง</th><th>วันที่ลง</th><th>{labels[metric]}</th><th>แหล่งยอด</th></tr></thead><tbody>{group.publications.map(row => <tr key={row.publication.id}><td><input type="checkbox" aria-label={`เปรียบเทียบ ${group.content.title} ${REPORT_PLATFORM_LABELS[row.publication.platform]}`} checked={selected.includes(row.publication.id)} disabled={!selected.includes(row.publication.id) && compareRows.length >= 4} onChange={e => setSelected(e.target.checked ? [...selected, row.publication.id] : selected.filter(id => id !== row.publication.id))} /></td><td>{safePostUrl(row.publication.thumbnailUrl) && <img src={safePostUrl(row.publication.thumbnailUrl)!} alt="" width={64} height={48} loading="lazy" />}{REPORT_PLATFORM_LABELS[row.publication.platform]}</td><td>{row.publication.publishedAt}</td><td>{number(row.metrics[metric])}</td><td>{[...new Set(row.observations.map(o => o.traffic))].join(", ") || "ไม่มีข้อมูล"}</td></tr>)}</tbody></table>{group.publications.map(row => <details key={row.publication.id}><summary>รายละเอียด / หลักฐาน {REPORT_PLATFORM_LABELS[row.publication.platform]}</summary><PublicationDetails row={row} /></details>)}</details>)}
        </section>
        <section className="report-card"><h3>เปรียบเทียบ 2–4 โพสต์ · {labels[metric]}</h3><p>เลือกโพสต์จากรายการข้างบน เงื่อนไขจัดอันดับ: ช่องทาง รูปแบบ วันที่เผยแพร่ ประเภทแหล่งยอด ช่วงข้อมูลและแหล่งข้อมูลเดียวกัน</p>{compareRows.length > 0 && <><button type="button" onClick={() => setSelected([])}>ล้างรายการเปรียบเทียบ</button>{!comparable && <p role="status">ข้อมูลยังไม่เข้าเงื่อนไขเทียบอย่างเป็นธรรม แสดงตัวเลขรายโพสต์โดยไม่จัดอันดับ</p>}<table className="report-table"><thead><tr><th>โพสต์</th><th>ช่องทาง</th><th>{labels[metric]}</th></tr></thead><tbody>{(comparable ? [...compareRows].sort((a, b) => (b.metrics[metric] ?? -1) - (a.metrics[metric] ?? -1)) : compareRows).map(row => <tr key={row.publication.id}><td>{row.content.title}</td><td>{REPORT_PLATFORM_LABELS[row.publication.platform]}</td><td>{number(row.metrics[metric])}</td></tr>)}</tbody></table></>}</section>
      </>}
    </>}
  </section>;
}
