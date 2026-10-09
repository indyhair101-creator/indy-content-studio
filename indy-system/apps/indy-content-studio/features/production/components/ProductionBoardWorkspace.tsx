"use client";

import { useMemo, useState } from "react";
import { useDashboardData } from "../../data/DashboardDataProvider";
import { moveContentToStatus, PRODUCTION_STATUS_LABELS, PRODUCTION_STATUS_ORDER, selectProductionBoard, type ProductionBoardFilters } from "../production-board-model";
import type { ProductionStatus } from "../../domain/types";

export function ProductionBoardWorkspace() {
  const dashboard = useDashboardData();
  const [filters, setFilters] = useState<ProductionBoardFilters>({ priority: "all", status: "all" });
  const [error, setError] = useState<string | null>(null);
  const configuredOwners = dashboard.state?.ownerOptions ?? [];
  const legacyOwners = dashboard.state?.contents.filter((item) => !item.deletedAt).map((item) => item.owner) ?? [];
  const owners = [...new Set([...configuredOwners, ...legacyOwners])];
  const activeOwner = filters.owner && owners.includes(filters.owner) ? filters.owner : "";
  const view = useMemo(() => dashboard.state ? selectProductionBoard(dashboard.state, { ...filters, owner: activeOwner }) : null, [dashboard.state, filters, activeOwner]);

  if (!view) return <section><h1>บอร์ดการผลิต</h1><p>กำลังโหลดข้อมูล…</p></section>;

  async function move(contentId: string, target: ProductionStatus) {
    try {
      await dashboard.mutate((state) => moveContentToStatus(state, contentId, target, new Date().toISOString()));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ย้ายสถานะไม่สำเร็จ");
    }
  }

  return <section className="production-workspace" aria-labelledby="production-workspace-heading">
    <div className="workspace-heading-row">
      <div><p className="eyebrow">INDY / PRODUCTION</p><h1 id="production-workspace-heading">บอร์ดการผลิต</h1><p>ลากงานผ่านสถานะการผลิตและตรวจเงื่อนไขก่อนเผยแพร่</p></div>
      <div className="production-filters" aria-label="ตัวกรองบอร์ดการผลิต">
        <label>ค้นหา<input aria-label="ค้นหาบอร์ดการผลิต" type="search" value={filters.query ?? ""} onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))} /></label>
        <div className="production-owner-filter" role="group" aria-label="กรองผู้รับผิดชอบ">
          <span className="production-filter-label">ผู้รับผิดชอบ</span>
          <button type="button" aria-pressed={activeOwner === ""} onClick={() => setFilters((current) => ({ ...current, owner: "" }))}>รวมทั้งหมด</button>
          {owners.map((owner) => <button key={owner} type="button" aria-pressed={activeOwner === owner} onClick={() => setFilters((current) => ({ ...current, owner }))}>{owner}</button>)}
        </div>
        <label>ความสำคัญ<select aria-label="ความสำคัญ" value={filters.priority ?? "all"} onChange={(event) => setFilters((current) => ({ ...current, priority: event.target.value as ProductionBoardFilters["priority"] }))}><option value="all">ทั้งหมด</option><option value="urgent">ด่วนมาก</option><option value="high">สูง</option><option value="normal">ปกติ</option><option value="low">ต่ำ</option></select></label>
      </div>
    </div>
    {error && <p role="alert">{error}</p>}
    <div className="production-board-grid">
      {view.map((column) => <section key={column.status} className="production-column" aria-label={column.label}>
        <div className="production-column-heading"><h2>{column.label}</h2><span>{column.items.length}</span></div>
        {column.items.length === 0 ? <p className="empty-state">ยังไม่มีงาน</p> : <div className="production-card-list">{column.items.map((item) => <article key={item.id} className="production-card">
          <div><h3>{item.title}</h3><p>{item.owner} · {item.priority}</p>{item.schedules.filter((schedule) => schedule.enabled).length > 0 && <small>{item.schedules.filter((schedule) => schedule.enabled).map((schedule) => schedule.platform).join(" · ")}</small>}</div>
          <label className="production-status-control">ย้ายไป<select aria-label={`ย้าย ${item.title}`} value={item.productionStatus} onChange={(event) => void move(item.id, event.target.value as ProductionStatus)}>{PRODUCTION_STATUS_ORDER.map((status) => <option key={status} value={status}>{PRODUCTION_STATUS_LABELS[status]}</option>)}</select></label>
        </article>)}</div>}
      </section>)}
    </div>
  </section>;
}
