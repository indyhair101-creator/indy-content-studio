import type { InsightPublication } from "../insight-selectors";
import { METRIC_DEFINITIONS } from "../metric-definitions";
import type { MetricKey } from "../report-types";
import { selectVideoRankings } from "../video-ranking-selectors";

const valueLabel = (value: number) => value.toLocaleString("th-TH", { maximumFractionDigits: 2 });
export function VideoRankings({ rows, metric, onOpenContent }: { rows: InsightPublication[]; metric: MetricKey; onOpenContent?: (id: string) => void }) {
  const panels: Array<{ title: string; metric: MetricKey; organic?: boolean; below?: boolean }> = [
    { title: "Organic · ครั้งรับชม", metric: "views", organic: true },
    { title: "การเข้าถึงรายโพสต์", metric: "reach" },
    { title: "เวลารับชมเฉลี่ยรายคลิป", metric: "averageWatchSeconds" },
    { title: "แชร์รายโพสต์", metric: "shares" },
    { title: "บันทึกรายโพสต์", metric: "saves" },
    { title: "ผู้ติดตามที่เพิ่มจากโพสต์", metric: "followers" },
    { title: `ต่ำกว่าค่าเฉลี่ยกลุ่ม · ${metric === "views" ? "รับชม (ครั้ง)" : METRIC_DEFINITIONS[metric].label}`, metric, below: true },
  ];
  return <section className="report-card">
    <h3>อันดับวิดีโอแยกตามตัวชี้วัด</h3>
    <p>ใช้ข้อมูลตามตัวกรองปัจจุบัน ต้องมีอย่างน้อย 3 โพสต์ที่มีตัวเลขจริงในกลุ่มเดียวกัน จึงแสดงอันดับภายในกลุ่ม ไม่มีผู้ชนะรวมข้ามกลุ่ม</p>
    <p>แยกช่องทาง บัญชี รูปแบบ ความยาวคลิป แหล่งข้อมูล เขตเวลา และแหล่งยอด ยอดสะสมเทียบในช่วงอายุเดียวกันกว้าง 1 ชั่วโมง; กิจกรรมต้องครอบคลุมช่วงข้อมูลเดียวกันและเผยแพร่วันเดียวกัน อันดับไม่ยืนยันเหตุหรือคุณภาพของเนื้อหา</p>
    <p>Organic ต้องยืนยันจากข้อมูล ไม่ใช้ยอดรวมแทน หากเลือกยอดรวมอยู่ให้เปลี่ยนแหล่งยอดเป็น Organic เพื่อดูอันดับนี้ · ไม่จัดอันดับแหล่งยอด unknown หรือช่วงกิจกรรมที่ไม่ทราบเขตเวลา · ค่าเฉลี่ยจำนวนคือค่าเฉลี่ยต่อโพสต์ ไม่ใช่จำนวนผู้ชมที่ตัดซ้ำแล้ว</p>
    <div className="report-grid">{panels.map(panel => {
      const result = selectVideoRankings(rows, panel.metric, panel.organic);
      return <article className="report-card" key={panel.title}><h4>{panel.title}</h4>
        <p>{METRIC_DEFINITIONS[panel.metric].note} · หน่วย {METRIC_DEFINITIONS[panel.metric].unit}</p>
        <p>ไม่มีข้อมูลที่เข้าเงื่อนไข {result.unavailable} โพสต์ (ไม่เติมศูนย์)</p>
        {!result.cohorts.length && <p>ยังไม่มีกลุ่มข้อมูลที่เปรียบเทียบได้</p>}
        {result.cohorts.map(cohort => {
          const entries = panel.below ? cohort.entries.filter(entry => entry.belowAverage) : cohort.entries;
          return <details key={cohort.key} open={cohort.sample >= 3}><summary>{cohort.label} · n={cohort.sample}</summary>
            {cohort.sample < 3 ? <p>ขนาดตัวอย่างไม่พอ แสดงข้อมูลรายโพสต์ได้ในตารางผลคอนเทนต์</p> : <>
              {panel.below && <p>{cohort.average === null ? "ไม่มีฐานที่ใช้คำนวณค่าเฉลี่ยกลุ่มได้" : `${panel.metric === "averageWatchSeconds" ? "ค่าเฉลี่ยถ่วงด้วยฐานรับชม" : "ค่าเฉลี่ยต่อโพสต์"} ${valueLabel(cohort.average)} ${METRIC_DEFINITIONS[panel.metric].unit}`}</p>}
              {panel.below && cohort.average !== null && !entries.length && <p>ไม่มีโพสต์ต่ำกว่าค่าเฉลี่ยกลุ่มนี้</p>}
              {!!entries.length && <table className="report-table"><thead><tr><th>{panel.below ? "เทียบค่าเฉลี่ย" : "อันดับในกลุ่ม"}</th><th>คอนเทนต์</th><th>{METRIC_DEFINITIONS[panel.metric].label}</th></tr></thead><tbody>{entries.map(entry => <tr key={entry.row.publication.id}><td>{panel.below ? "ต่ำกว่า" : entry.rank}</td><td>{onOpenContent ? <button type="button" onClick={() => onOpenContent(entry.row.content.id)}>{entry.row.content.title}</button> : entry.row.content.title}</td><td>{valueLabel(entry.value)}</td></tr>)}</tbody></table>}
            </>}
          </details>;
        })}
      </article>;
    })}</div>
  </section>;
}
