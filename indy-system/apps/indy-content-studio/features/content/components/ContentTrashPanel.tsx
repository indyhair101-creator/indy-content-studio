"use client";

import { useDashboardData } from "../../data/DashboardDataProvider";
import { permanentlyDeleteContent, restoreContent } from "../content-trash-commands";

export function ContentTrashPanel() {
  const dashboard = useDashboardData();
  if (!dashboard.state) return <section><h2>ถังขยะคอนเทนต์</h2><p>กำลังโหลดข้อมูล…</p></section>;
  const deleted = dashboard.state.contents.filter((content) => content.deletedAt);
  return <section className="settings-panel" aria-labelledby="content-trash-heading"><div className="settings-panel-heading"><div><p className="panel-label">DATA HYGIENE</p><h2 id="content-trash-heading">ถังขยะคอนเทนต์</h2></div><span>{deleted.length} รายการ</span></div>{deleted.length === 0 ? <p className="empty-state">ถังขยะว่าง</p> : <div className="settings-list">{deleted.map((content) => <article className="settings-item" key={content.id}><div className="settings-item-main"><strong>{content.title}</strong><span className="settings-meta">ลบเมื่อ {content.deletedAt}</span></div><div className="settings-item-actions"><button type="button" onClick={() => void dashboard.mutate((state) => restoreContent(state, content.id, new Date().toISOString()))}>กู้คืน</button><button type="button" onClick={() => { if (window.confirm(`ลบ ${content.title} ถาวรหรือไม่`)) void dashboard.mutate((state) => permanentlyDeleteContent(state, content.id)); }}>ลบถาวร</button></div></article>)}</div>}</section>;
}
