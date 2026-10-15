import { aggregateInsightMetric, safePostUrl, type InsightPublication } from "../insight-selectors";
import { METRIC_DEFINITIONS } from "../metric-definitions";
import { REPORT_PLATFORM_LABELS, type MetricKey, type ReportPlatform } from "../report-types";

const format = (value: number | null) => value === null ? "—" : value.toLocaleString("th-TH", { maximumFractionDigits: 1 });
const colors: Record<ReportPlatform, string> = { facebook: "#4269bd", instagram: "#b9577c", tiktok: "#366f70", youtube: "#ba5748" };
const metrics: MetricKey[] = ["views", "likes", "comments", "shares", "saves", "watchSeconds"];

export function InsightOverview({ rows, metric, video = false }: { rows: InsightPublication[]; metric: MetricKey; video?: boolean }) {
  const platforms = (["facebook", "instagram", "tiktok", "youtube"] as ReportPlatform[]).filter(platform => rows.some(row => row.publication.platform === platform));
  if (!rows.length) return <section className="report-empty"><h3>กำลังเตรียมข้อมูลจากบัญชีที่เชื่อมไว้</h3><p>เมื่อดึงสำเร็จ ตัวเลขและกราฟจะปรากฏที่นี่ แม้โพสต์นั้นยังไม่ได้จับคู่กับงานในปฏิทิน หากเลือก Organic หรือช่วงวันแล้วว่าง ให้ตรวจสถานะข้อมูลด้านบน</p></section>;
  return <div className="insight-overview">{platforms.map(platform => {
    const items = rows.filter(row => row.publication.platform === platform);
    const chartRows = items.filter(row => typeof row.metrics[metric] === "number").sort((a, b) => b.metrics[metric]! - a.metrics[metric]!).slice(0, 6);
    const max = Math.max(1, ...chartRows.map(row => row.metrics[metric]!));
    const latest = items.flatMap(row => row.observations.map(o => o.fetchedAt)).sort().at(-1);
    const videoCount = items.filter(row => row.publication.mediaKind === "video").length;
    const selectedMetrics = video ? ["views", "watchSeconds", "shares", "saves", "comments", "likes"] as MetricKey[] : metrics;
    return <section className={`insight-channel insight-channel-${platform}`} key={platform} aria-label={`สรุป ${REPORT_PLATFORM_LABELS[platform]}`}>
      <header className="insight-channel-heading"><div><span className="insight-eyebrow">CONTENT PERFORMANCE</span><h3>{REPORT_PLATFORM_LABELS[platform]}</h3><p>{items.length.toLocaleString("th-TH")} โพสต์ · {videoCount} วิดีโอ</p></div><span className="insight-updated">{latest ? `อัปเดต ${new Date(latest).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" })}` : "ยังไม่มีตัวเลขจากต้นทาง"}</span></header>
      <div className="insight-kpi-grid">{selectedMetrics.map(key => {
        const available = items.filter(row => typeof row.metrics[key] === "number");
        const value = aggregateInsightMetric(available, key);
        return <article className="insight-kpi" key={key}><span>{key === "views" ? "ยอดดู / แสดงผล" : METRIC_DEFINITIONS[key].label}</span><strong>{format(key === "watchSeconds" && value !== null ? value / 3600 : value)}</strong><small>{key === "watchSeconds" ? "ชั่วโมง" : METRIC_DEFINITIONS[key].unit} · {value === null ? available.length ? "แหล่งข้อมูลต่างนิยาม ดูรายโพสต์" : "ต้นทางยังไม่ส่งค่า" : `มีข้อมูล ${available.length}/${items.length} โพสต์`}</small></article>;
      })}</div>
      <div className="insight-visual-grid"><section className="insight-chart"><h4>โพสต์ที่มียอดสูง · {METRIC_DEFINITIONS[metric].label}</h4><p>เรียงตามตัวเลขที่ดึงได้ ไม่ใช่คะแนนคุณภาพ · อายุโพสต์อาจต่างกัน</p>
        {chartRows.length ? <><svg role="img" aria-label={`กราฟผลโพสต์ ${REPORT_PLATFORM_LABELS[platform]} ${METRIC_DEFINITIONS[metric].label}`} viewBox={`0 0 680 ${chartRows.length * 64 + 26}`}>
          <line x1="265" x2="265" y1="0" y2={chartRows.length * 64} stroke="#ddd9d0" />
          {chartRows.map((row, i) => <g key={row.publication.id}><title>{row.content.title}: {format(row.metrics[metric]!)}</title><text x="0" y={i * 64 + 24} fontSize="13" fill="#383b35">{row.content.title.slice(0, 25)}{row.content.title.length > 25 ? "…" : ""}</text><text x="0" y={i * 64 + 43} fontSize="11" fill="#777b72">{new Date(row.publication.publishedAt).toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "Asia/Bangkok" })}</text><rect x="266" y={i * 64 + 10} width={row.metrics[metric]! / max * 310} height="32" rx="6" fill={colors[platform]} /><text x={276 + row.metrics[metric]! / max * 310} y={i * 64 + 31} fontSize="13" fill="#383b35">{format(row.metrics[metric]!)}</text></g>)}
          <text x="265" y={chartRows.length * 64 + 14} fontSize="11" fill="#777b72">0</text><text x="580" y={chartRows.length * 64 + 14} textAnchor="end" fontSize="11" fill="#777b72">{format(max)} {METRIC_DEFINITIONS[metric].unit}</text>
        </svg><details><summary>ดูตัวเลขและเปิดโพสต์จริง</summary><ol className="insight-post-links">{chartRows.map(row => <li key={row.publication.id}>{safePostUrl(row.publication.url) ? <a href={safePostUrl(row.publication.url)!} target="_blank" rel="noopener noreferrer">{row.content.title}</a> : row.content.title}<strong>{format(row.metrics[metric]!)}</strong></li>)}</ol></details></> : <p className="report-empty">ยังไม่มีตัวเลขของตัวชี้วัดนี้ ลองเลือกความคิดเห็นหรือแชร์</p>}
      </section><aside className="insight-video-summary"><span className="insight-eyebrow">VIDEO CONTENT</span><div className="insight-ring" style={{ background: `conic-gradient(${colors[platform]} ${videoCount / items.length * 100}%, #e7e6df 0)` }}><div><strong>{Math.round(videoCount / items.length * 100)}%</strong><span>สัดส่วนวิดีโอ</span></div></div><p>{videoCount} จาก {items.length} โพสต์ในตัวกรองนี้</p><small>เป็นสัดส่วนจำนวนโพสต์ ไม่ใช่สัดส่วนยอดรับชม</small><p>เวลารับชมเฉลี่ยและการเข้าถึงแสดงรายโพสต์ในรายละเอียด เพื่อไม่บวกคนซ้ำหรือเฉลี่ยข้ามฐาน</p></aside></div>
    </section>;
  })}</div>;
}
