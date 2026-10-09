import type { DashboardOverview } from "../server/dashboard-types";

const cards: Array<{
  label: string;
  value: keyof DashboardOverview;
}> = [
  { label: "ในแผน", value: "plannedCount" },
  { label: "ผลิตเสร็จ", value: "completedCount" },
  { label: "เผยแพร่จริงครบช่องทาง", value: "publishedCount" },
];

export function OverviewPage({ overview }: { overview: DashboardOverview }) {
  return (
    <section aria-labelledby="overview-heading">
      <p>PLAN · CREATE · PUBLISH</p>
      <h2 id="overview-heading">ภาพรวมและเป้าหมาย</h2>
      <p>วางแผนชิ้นงานและจัดการสื่อของทีม INDY</p>
      <div>
        {cards.map((card) => (
          <article key={card.label}>
            <p>{card.label}</p>
            <strong>{overview[card.value]} ชิ้น</strong>
          </article>
        ))}
      </div>
      <section aria-label="สัดส่วนภาพและคลิป">
        <h2>สัดส่วนภาพ / คลิป</h2>
        <p>ภาพ {overview.imageCount} ชิ้น</p>
        <p>คลิป {overview.videoCount} ชิ้น</p>
      </section>
    </section>
  );
}
