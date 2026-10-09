"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useDashboardData } from "../../data/DashboardDataProvider";
import { beginReviewCycle, resolveCorrection } from "../review-model";

type ConnectionState = {
  status: "loading" | "error" | "not_connected" | "pairing" | "connected" | "disabled";
  maskedRecipient: string | null;
  pairedAt: string | null;
};

type PairingCode = { pairingCode: string; expiresAt: string };

export function CorrectionsWorkspace({ onOpenContent }: { onOpenContent?: (contentId: string) => void } = {}) {
  const dashboard = useDashboardData();
  const [selectedContentId, setSelectedContentId] = useState("");
  const [connection, setConnection] = useState<ConnectionState>({ status: "loading", maskedRecipient: null, pairedAt: null });
  const [pairingCode, setPairingCode] = useState<PairingCode | null>(null);
  const [isPairing, setIsPairing] = useState(false);
  const [isConfiguringWebhook, setIsConfiguringWebhook] = useState(false);
  const [isSendingReview, setIsSendingReview] = useState(false);
  const [isStartingReview, setIsStartingReview] = useState(false);
  const [isRefreshingFeedback, setIsRefreshingFeedback] = useState(false);
  const [resolvingCorrectionId, setResolvingCorrectionId] = useState<string | null>(null);
  const refreshPending = useRef(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const readyContent = useMemo(() => dashboard.state?.contents.filter((content) => !content.deletedAt && content.productionStatus === "ready") ?? [], [dashboard.state]);

  useEffect(() => {
    let active = true;
    void fetch("/api/line/pairing", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("line_connection_unavailable");
        const result = await response.json() as { status?: unknown; maskedRecipient?: unknown; pairedAt?: unknown };
        if (active) setConnection({
          status: result.status === "connected" || result.status === "pairing" || result.status === "disabled" ? result.status : "not_connected",
          maskedRecipient: typeof result.maskedRecipient === "string" ? result.maskedRecipient : null,
          pairedAt: typeof result.pairedAt === "string" ? result.pairedAt : null,
        });
      })
      .catch(() => { if (active) setConnection({ status: "error", maskedRecipient: null, pairedAt: null }); });
    return () => { active = false; };
  }, []);

  if (!dashboard.state) return <section><h1>งานที่ต้องแก้</h1><p>กำลังโหลดข้อมูล…</p></section>;

  const openCorrections = dashboard.state.corrections.filter((correction) => correction.status === "open");
  const resolvedCorrections = dashboard.state.corrections.filter((correction) => correction.status === "resolved");
  const selectedContent = dashboard.state.contents.find((content) => content.id === selectedContentId) ?? readyContent[0] ?? null;
  const lineConnected = connection.status === "connected";
  const reviewAlreadySent = selectedContent?.lineReview.status === "sent" || selectedContent?.lineReview.status === "approved";

  async function refreshFeedback() {
    if (refreshPending.current) return;
    refreshPending.current = true;
    setIsRefreshingFeedback(true);
    setFeedbackError(null);
    try {
      await dashboard.reload();
    } catch {
      setFeedbackError("รีเฟรช feedback จาก LINE ไม่สำเร็จ ลองอีกครั้งได้");
    } finally {
      refreshPending.current = false;
      setIsRefreshingFeedback(false);
    }
  }

  async function acknowledgeCorrection(correctionId: string) {
    if (resolvingCorrectionId) return;
    setResolvingCorrectionId(correctionId);
    setFeedbackError(null);
    try {
      await dashboard.mutate((state) => resolveCorrection(state, correctionId, new Date().toISOString()));
    } catch {
      setFeedbackError("บันทึกสถานะงานที่ต้องแก้ไม่สำเร็จ ลองอีกครั้งได้");
    } finally {
      setResolvingCorrectionId(null);
    }
  }

  async function refreshConnection() {
    setConnection((current) => ({ ...current, status: "loading" }));
    try {
      const response = await fetch("/api/line/pairing", { cache: "no-store" });
      if (!response.ok) throw new Error("line_connection_unavailable");
      const result = await response.json() as { status?: unknown; maskedRecipient?: unknown; pairedAt?: unknown };
      setConnection({
        status: result.status === "connected" || result.status === "pairing" || result.status === "disabled" ? result.status : "not_connected",
        maskedRecipient: typeof result.maskedRecipient === "string" ? result.maskedRecipient : null,
        pairedAt: typeof result.pairedAt === "string" ? result.pairedAt : null,
      });
    } catch {
      setConnection({ status: "error", maskedRecipient: null, pairedAt: null });
    }
  }

  async function createPairingCode() {
    setIsPairing(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/line/pairing", { method: "POST" });
      const result = await response.json() as { pairingCode?: unknown; expiresAt?: unknown; connection?: { status?: unknown; maskedRecipient?: unknown; pairedAt?: unknown }; error?: string };
      if (!response.ok || typeof result.pairingCode !== "string" || typeof result.expiresAt !== "string") {
        throw new Error(result.error ?? "line_pairing_unavailable");
      }
      setPairingCode({ pairingCode: result.pairingCode, expiresAt: result.expiresAt });
      setConnection({ status: "pairing", maskedRecipient: null, pairedAt: null });
      setNotice("สร้างรหัสแล้ว เพิ่ม LINE OA เป็นเพื่อน แล้วส่งคำสั่งที่แสดงด้านล่างจากบัญชีผู้รับ");
    } catch {
      setError("สร้างรหัสจับคู่ไม่สำเร็จ ลองตรวจสอบการเชื่อมต่อแล้วทำซ้ำ");
    } finally {
      setIsPairing(false);
    }
  }

  async function configureWebhook() {
    setIsConfiguringWebhook(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/line/webhook-settings", { method: "POST" });
      const result = await response.json() as { configured?: unknown; verified?: unknown; active?: unknown };
      if (!response.ok || result.configured !== true || result.verified !== true || result.active !== true) {
        throw new Error("line_webhook_unavailable");
      }
      setNotice("LINE webhook ตั้งค่าและตรวจสอบแล้ว พร้อมรับคำสั่งจับคู่จากแชตผู้รับ");
    } catch {
      setError("ตั้งค่า LINE webhook ไม่สำเร็จ ตรวจสอบ URL และค่าช่องทาง LINE ใน Vercel");
    } finally {
      setIsConfiguringWebhook(false);
    }
  }

  async function startReview() {
    if (!selectedContent || isStartingReview) return;
    setIsStartingReview(true);
    setError(null);
    try {
      const cycleId = `cycle-${selectedContent.id}-${Date.now()}`;
      await dashboard.mutate((state) => ({ ...state, contents: state.contents.map((content) => content.id === selectedContent.id ? beginReviewCycle(content, cycleId, new Date().toISOString()) : content) }));
      setSelectedContentId(selectedContent.id);
      setNotice("เริ่มรอบตรวจแล้ว พร้อมส่งผ่าน LINE ที่จับคู่ไว้");
    } catch {
      setError("เริ่มรอบตรวจไม่สำเร็จ ลองอีกครั้งได้");
    } finally {
      setIsStartingReview(false);
    }
  }

  async function sendReview() {
    const content = dashboard.state?.contents.find((item) => item.id === selectedContentId) ?? selectedContent;
    if (!lineConnected) { setError("ต้องจับคู่ LINE OA ก่อนส่งตรวจ"); return; }
    if (!content?.lineReview.activeCycleId || !content.lineReview.reviewCode) { setError("เริ่มรอบตรวจก่อนส่ง"); return; }

    setIsSendingReview(true);
    setError(null);
    try {
      const response = await fetch("/api/line/send-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentId: content.id, cycleId: content.lineReview.activeCycleId, reviewCode: content.lineReview.reviewCode }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "line_delivery_failed");
      setNotice("ส่งรอบตรวจไปยัง LINE ที่จับคู่ไว้แล้ว");
      try { await dashboard.reload(); } catch {
        setFeedbackError("ส่ง LINE แล้ว แต่รีเฟรชสถานะไม่สำเร็จ กดรีเฟรชจาก LINE ได้");
      }
    } catch {
      setError("ส่งตรวจไม่สำเร็จ ลองใหม่ได้โดยใช้รอบตรวจเดิม");
    } finally {
      setIsSendingReview(false);
    }
  }

  return <section className="corrections-workspace" aria-labelledby="corrections-heading">
    <div className="workspace-heading-row"><div><p className="eyebrow">INDY / LINE REVIEW</p><h1 id="corrections-heading">งานที่ต้องแก้</h1><p>ตอบ LINE ว่า “ผ่าน” เพื่ออนุมัติและส่งเข้าคิว Make หรือ “ไม่ผ่าน” เพื่อส่งกลับมาแก้ หากมีรายละเอียด ให้เว้นวรรคหรือขึ้นบรรทัดใหม่แล้วพิมพ์ต่อในข้อความเดียวกัน คำตอบใช้กับงานล่าสุดที่ส่งให้ตรวจเท่านั้น</p><p>ระบบอัปเดตอัตโนมัติทุก 15 วินาทีขณะเปิดหน้านี้</p></div></div>
    {error && <p role="alert">{error}</p>}{(feedbackError || dashboard.error) && <p role="alert">{feedbackError ?? dashboard.error?.message}</p>}{notice && <p role="status">{notice}</p>}
    <section className="settings-panel" aria-labelledby="line-review-heading">
      <h2 id="line-review-heading">เชื่อมต่อและส่งงานตรวจผ่าน LINE</h2>
      {connection.status === "loading" && <p role="status">กำลังตรวจสอบสถานะ LINE…</p>}
      {connection.status === "error" && <p role="alert">ตรวจสอบสถานะ LINE ไม่สำเร็จ ลองรีเฟรชสถานะ</p>}
      {connection.status === "not_connected" && <p role="status">ยังไม่ได้จับคู่ LINE</p>}
      {connection.status === "pairing" && <p role="status">รอการจับคู่ LINE กับบัญชีผู้รับ</p>}
      {lineConnected && <p role="status">เชื่อมต่อ LINE แล้ว: {connection.maskedRecipient ?? "ผู้รับที่จับคู่ไว้"}</p>}
      {connection.status === "disabled" && <p role="status">การเชื่อมต่อ LINE ถูกปิดไว้</p>}
      <button type="button" onClick={() => void configureWebhook()} disabled={isConfiguringWebhook}>{isConfiguringWebhook ? "กำลังตั้งค่า webhook…" : "ตั้งค่า webhook LINE"}</button>
      {!lineConnected && <button type="button" onClick={() => void createPairingCode()} disabled={isPairing || connection.status === "loading"}>{isPairing ? "กำลังสร้างรหัส…" : "สร้างรหัสจับคู่"}</button>}
      {connection.status === "pairing" && <button type="button" onClick={() => void refreshConnection()}>รีเฟรชสถานะ LINE</button>}
      {pairingCode && <div className="line-pairing-instructions" aria-label="คำแนะนำการจับคู่ LINE">
        <p>ส่งข้อความนี้ให้ LINE OA จากบัญชีผู้รับ:</p>
        <p><code>เชื่อมต่อ {pairingCode.pairingCode}</code></p>
        <p>รหัสหมดอายุ {new Date(pairingCode.expiresAt).toLocaleString("th-TH")}</p>
      </div>}
      <label>คอนเทนต์<select aria-label="คอนเทนต์สำหรับส่งตรวจ" value={selectedContent?.id ?? ""} onChange={(event) => setSelectedContentId(event.target.value)}><option value="">เลือกคอนเทนต์</option>{readyContent.map((content) => <option key={content.id} value={content.id}>{content.title}</option>)}</select></label>
      {readyContent.length === 0 && <p>ยังไม่มีคอนเทนต์พร้อมส่งตรวจ คำตอบ “ไม่ผ่าน” ที่ยังไม่มีรอบตรวจจะเก็บเป็นฟีดแบ็กที่ยังไม่ได้ผูกกับคอนเทนต์</p>}
      {selectedContent?.lineReview.reviewCode && <p>รหัสรอบตรวจ: <code>{selectedContent.lineReview.reviewCode}</code> · สถานะ {selectedContent.lineReview.status}</p>}
      <div className="settings-dialog-actions">
        <button type="button" onClick={() => void startReview()} disabled={!selectedContent || isStartingReview || isSendingReview}>เริ่มรอบตรวจ</button>
        <button type="button" onClick={() => void sendReview()} disabled={!lineConnected || !selectedContent?.lineReview.reviewCode || reviewAlreadySent || isSendingReview || isStartingReview}>{isSendingReview ? "กำลังส่ง…" : "ส่งตรวจผ่าน LINE"}</button>
      </div>
    </section>
    <section aria-labelledby="open-corrections-heading">
      <div className="workspace-heading-row"><h2 id="open-corrections-heading">รายการที่รอแก้ ({openCorrections.length})</h2><button type="button" onClick={() => void refreshFeedback()} disabled={isRefreshingFeedback}>{isRefreshingFeedback ? "กำลังรีเฟรช…" : "รีเฟรชจาก LINE"}</button></div>
      {openCorrections.length === 0 ? <p className="empty-state">ยังไม่มีงานที่ต้องแก้</p> : <ul>{openCorrections.map((correction) => {
        const content = dashboard.state?.contents.find((item) => item.id === correction.contentId);
        const unassigned = correction.source === "line-unmatched";
        return <li key={correction.id}>
          <strong>{unassigned ? "ฟีดแบ็กจาก LINE — ยังไม่ได้ผูกกับคอนเทนต์" : content?.title ?? "ไม่พบคอนเทนต์ในแดชบอร์ด"}</strong>
          {unassigned && <p>ได้รับข้อความแล้ว แต่ไม่มีรอบตรวจที่ใช้งานอยู่ ส่งคอนเทนต์ผ่าน LINE ก่อนตอบครั้งถัดไป หากต้องการให้ฟีดแบ็กผูกกับงานนั้น</p>}
          {!content && !unassigned && <p>รหัสคอนเทนต์: <code>{correction.contentId}</code></p>}
          {content?.deletedAt && <p>คอนเทนต์นี้อยู่ในถังขยะ</p>}
          <p className="line-feedback-comment" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", flexBasis: "100%" }}>{correction.comment}</p>
          <time dateTime={correction.receivedAt}>รับเมื่อ {new Date(correction.receivedAt).toLocaleString("th-TH")}</time>
          {content && !content.deletedAt && onOpenContent && <button type="button" onClick={() => onOpenContent(content.id)}>เปิดคอนเทนต์</button>}
          <button type="button" disabled={resolvingCorrectionId !== null} onClick={() => void acknowledgeCorrection(correction.id)}>{resolvingCorrectionId === correction.id ? "กำลังบันทึก…" : unassigned ? "รับทราบฟีดแบ็ก" : "รับทราบและเตรียมรอบใหม่"}</button>
        </li>;
      })}</ul>}
      {resolvedCorrections.length > 0 && <details><summary>ประวัติที่รับทราบแล้ว ({resolvedCorrections.length})</summary><ul>{resolvedCorrections.map((correction) => <li key={correction.id}>
        <strong>{correction.source === "line-unmatched" ? "ฟีดแบ็กจาก LINE — ยังไม่ได้ผูกกับคอนเทนต์" : dashboard.state?.contents.find((item) => item.id === correction.contentId)?.title ?? correction.contentId}</strong>
        <p className="line-feedback-comment" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", flexBasis: "100%" }}>{correction.comment}</p>
        <time dateTime={correction.receivedAt}>รับเมื่อ {new Date(correction.receivedAt).toLocaleString("th-TH")}</time>
        {correction.resolvedAt && <time dateTime={correction.resolvedAt}>รับทราบเมื่อ {new Date(correction.resolvedAt).toLocaleString("th-TH")}</time>}
      </li>)}</ul></details>}
    </section>
  </section>;
}
