import { ContentEditor } from "../../content/components/ContentEditor";
import { ContentTable } from "../../content/components/ContentTable";
import { ProductionBoard } from "../../content/components/ProductionBoard";
import { OverviewPage } from "./OverviewPage";

const content = [
  {
    id: "classroom",
    title: "หนึ่งวันในห้องเรียน INDY",
    category: "บรรยากาศ",
    format: "อัลบั้ม",
    readyDate: "2026-09-04",
    captionState: "ยังไม่เขียน",
    status: "พร้อมโพสต์",
  },
  {
    id: "scissors",
    title: "เลือกกรรไกรคู่แรกให้เหมาะกับมือ",
    category: "ความรู้",
    format: "วิดีโอ",
    readyDate: "2026-09-06",
    captionState: "ยังไม่เขียน",
    status: "รอตรวจ",
  },
  {
    id: "student-work",
    title: "รีวิวผลงานนักเรียนรุ่นล่าสุด",
    category: "รีวิว",
    format: "วิดีโอ",
    readyDate: "2026-09-08",
    captionState: "ยังไม่เขียน",
    status: "ตัดต่อ",
  },
];

export function DashboardPreview() {
  return (
    <div className="dashboard-preview">
      <OverviewPage
        overview={{
          plannedCount: 12,
          completedCount: 3,
          publishedCount: 0,
          totalCount: 12,
          imageCount: 4,
          videoCount: 8,
        }}
      />
      <ContentTable items={content} />
      <ProductionBoard
        items={content.map(({ id, title, status }) => ({ id, title, status }))}
      />
      <ContentEditor assetState="missing" caption="" />
    </div>
  );
}
