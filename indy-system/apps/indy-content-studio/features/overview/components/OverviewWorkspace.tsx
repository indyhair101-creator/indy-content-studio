"use client";

import { useMemo, useState } from "react";
import { useDashboardData } from "../../data/DashboardDataProvider";
import { selectMonthlyOverview } from "../overview-selectors";
import { setCategoryMonthlyGoal } from "../overview-commands";

export function OverviewWorkspace() {
  const dashboard = useDashboardData();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [query, setQuery] = useState("");
  const [goalDrafts, setGoalDrafts] = useState<Record<string, string>>({});
  const [goalError, setGoalError] = useState<string | null>(null);
  const [goalNotice, setGoalNotice] = useState<string | null>(null);
  const [savingGoal, setSavingGoal] = useState<string | null>(null);
  const view = useMemo(() => dashboard.state
    ? selectMonthlyOverview(dashboard.state, { month, query, now: new Date().toISOString() })
    : null, [dashboard.state, month, query]);

  if (!view) return <section><h2>ภาพรวมรายเดือน</h2><p>กำลังโหลดข้อมูล…</p></section>;

  async function saveCategoryGoal(categoryId: string, draftKey: string) {
    if (!Object.hasOwn(goalDrafts, draftKey)) return;
    const value = goalDrafts[draftKey].trim();
    const target = value ? Number(value) : null;
    setSavingGoal(draftKey);
    setGoalError(null);
    setGoalNotice(null);
    try {
      await dashboard.mutate((state) => setCategoryMonthlyGoal(state, month, categoryId, target));
      setGoalDrafts((current) => { const next = { ...current }; delete next[draftKey]; return next; });
      setGoalNotice(target === null ? "ล้างเป้าหมายรายหมวดแล้ว" : "บันทึกเป้าหมายรายหมวดแล้ว");
    } catch (error) {
      setGoalError(error instanceof Error ? error.message : "บันทึกเป้าหมายไม่สำเร็จ");
    } finally {
      setSavingGoal(null);
    }
  }

  return (
    <section className="overview-workspace" aria-labelledby="monthly-overview-heading">
      <div className="workspace-heading-row">
        <div><p className="eyebrow">MONTHLY OVERVIEW</p><h2 id="monthly-overview-heading">ภาพรวมรายเดือน</h2></div>
        <input type="month" aria-label="เดือนที่ดู" value={month} onChange={(event) => setMonth(event.target.value)} />
      </div>
      <label className="workspace-search-inline">ค้นหาคอนเทนต์<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <div className="metric-grid">
        <article><span>เป้าหมาย</span><strong>{view.metrics.target}</strong></article>
        <article><span>วางแผน</span><strong>{view.metrics.planned}</strong></article>
        <article><span>เสร็จแล้ว</span><strong>{view.metrics.completed}</strong></article>
        <article><span>เผยแพร่ครบ</span><strong>{view.metrics.fullyPublished}</strong></article>
      </div>
      <section className="category-progress-section" aria-labelledby="category-progress-heading">
        <div><p className="eyebrow">CATEGORY PROGRESS</p><h3 id="category-progress-heading">ความคืบหน้าตามประเภทคอนเทนต์</h3><p>ตั้งเป้าหมายจำนวนชิ้นงานแยกตามหมวดได้เองในแต่ละเดือน</p></div>
        {goalError && <p className="overview-state" role="alert">{goalError}</p>}
        {goalNotice && <p className="overview-state" role="status">{goalNotice}</p>}
        {view.categoryProgress.length === 0
          ? <p className="overview-state">ยังไม่มีประเภทคอนเทนต์ ไปเพิ่มได้ที่ตั้งค่า</p>
          : <div className="category-progress-grid">
            {view.categoryProgress.map((progress) => {
              const draftKey = `${month}:${progress.categoryId}`;
              const inputValue = Object.hasOwn(goalDrafts, draftKey) ? goalDrafts[draftKey] : progress.target?.toString() ?? "";
              return <div className="category-progress-card" key={progress.categoryId}>
                <div
                  className="category-progress-ring"
                  role={progress.target ? "progressbar" : "img"}
                  aria-label={progress.target
                    ? `${progress.categoryName} ความคืบหน้า ${progress.completed} จาก ${progress.target}`
                    : `${progress.categoryName} ส่งแล้ว ${progress.completed} ชิ้น ยังไม่กำหนดเป้าหมาย`}
                  aria-valuemin={progress.target ? 0 : undefined}
                  aria-valuemax={progress.target ?? undefined}
                  aria-valuenow={progress.target ? Math.min(progress.completed, progress.target) : undefined}
                  aria-valuetext={progress.target ? `${progress.completed} จาก ${progress.target} ชิ้น` : undefined}
                  style={{ background: `conic-gradient(var(--sage) ${progress.percentage}%, rgba(45,42,39,.1) ${progress.percentage}% 100%)` }}
                >
                  <span>{progress.completed}/{progress.target ?? "—"}</span>
                </div>
                <strong>{progress.categoryName}</strong>
                <label className="category-progress-goal">เป้าหมาย
                  <input
                    type="number"
                    min="1"
                    step="1"
                    inputMode="numeric"
                    aria-label={`เป้าหมาย ${progress.categoryName}`}
                    value={inputValue}
                    disabled={savingGoal === draftKey}
                    onChange={(event) => { setGoalNotice(null); setGoalDrafts((current) => ({ ...current, [draftKey]: event.target.value })); }}
                    onBlur={() => void saveCategoryGoal(progress.categoryId, draftKey)}
                    onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
                  />
                  <span>ชิ้น</span>
                </label>
                <small>ส่งแล้ว {progress.completed} · ทั้งหมด {progress.total}</small>
              </div>;
            })}
          </div>}
      </section>
      <div className="overview-ratios"><span>วิดีโอ {view.ratios.video.count} ({view.ratios.video.percent}%)</span><span>ภาพ {view.ratios.image.count} ({view.ratios.image.percent}%)</span></div>
      <div className="overview-warnings"><span>ยังไม่มีแผน {view.warnings.missingPlan}</span><span>ยังไม่มี actual {view.warnings.missingActual}</span><span>receipt ไม่ครบ {view.warnings.unverifiedReceipts}</span></div>
      {view.items.length === 0
        ? <p className="overview-state">ไม่พบคอนเทนต์ในเดือนหรือคำค้นนี้</p>
        : <table><thead><tr><th>คอนเทนต์</th></tr></thead><tbody>{view.items.map((item) => <tr key={item.id}><td>{item.title}</td></tr>)}</tbody></table>}
    </section>
  );
}
