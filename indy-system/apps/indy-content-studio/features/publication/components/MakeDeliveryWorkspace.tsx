"use client";

import { useState } from "react";
import { useDashboardData } from "../../data/DashboardDataProvider";
import type { Platform } from "../../domain/types";

const platformLabels: Record<Platform, string> = { facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok" };
const statusLabels: Record<string, string> = { "local-plan": "รอส่ง Make", submitting: "กำลังส่ง", queued: "ตั้งเวลาแล้ว", publishing: "กำลังโพสต์", published: "โพสต์แล้ว", failed: "ส่งไม่สำเร็จ", cancelled: "ยกเลิกคิวแล้ว" };

export function MakeDeliveryWorkspace() {
  const dashboard = useDashboardData();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  if (!dashboard.state) return <section><h1>ส่งโพสต์ผ่าน Make</h1><p>กำลังโหลดข้อมูล…</p></section>;

  async function deliver(attemptId: string) {
    const attempt = dashboard.state?.publicationAttempts.find((item) => item.id === attemptId);
    if (!attempt) return;
    try {
      const response = await fetch("/api/make/publications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attemptId }) });
      const body = await response.json().catch(() => ({})) as { error?: string; queueId?: string; reasons?: string[] };
      if (!response.ok) throw new Error(body.error ?? body.reasons?.join(" · ") ?? "ส่ง Make ไม่สำเร็จ");
      await dashboard.reload();
      setError(null);
      setNotice("ส่งเข้าคิว Make แล้ว ระบบจะเปลี่ยนเป็นเขียวเมื่อได้รับผลโพสต์สำเร็จ");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "ส่ง Make ไม่สำเร็จ"); }
  }

  return <section className="make-delivery-workspace" aria-labelledby="make-delivery-heading">
    <div className="workspace-heading-row"><div><p className="eyebrow">INDY / MAKE</p><h1 id="make-delivery-heading">ส่งโพสต์ผ่าน Make</h1><p>คิวนี้เกิดจากงานที่ Final แล้ว และแสดงผลแยกตามช่องทาง</p></div></div>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    <section aria-labelledby="publication-queue-heading"><h2 id="publication-queue-heading">คิวเผยแพร่</h2>{dashboard.state.publicationAttempts.length === 0 ? <p className="empty-state">ยังไม่มีคิวเผยแพร่จากงาน Final</p> : <ul>{dashboard.state.publicationAttempts.map((attempt) => { const content = dashboard.state?.contents.find((item) => item.id === attempt.contentId); return <li key={attempt.id}><strong>{content?.title ?? attempt.contentId}</strong><span>{platformLabels[attempt.platform]} · {attempt.publishAt} · {statusLabels[attempt.status] ?? attempt.status}</span>{attempt.status === "local-plan" || attempt.status === "failed" ? <button type="button" onClick={() => void deliver(attempt.id)}>{attempt.status === "failed" ? "ลองส่งอีกครั้ง" : "ส่งเข้า Make"}</button> : null}{attempt.status === "published" && (attempt.receiptUrl || attempt.providerPublicationId) ? <a href={attempt.receiptUrl ?? "#"} target="_blank" rel="noreferrer">ดูหลักฐานโพสต์</a> : null}</li>; })}</ul>}</section>
  </section>;
}
