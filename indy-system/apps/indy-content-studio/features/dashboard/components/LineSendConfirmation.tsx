"use client";

import { useEffect, useState } from "react";
import { canSendToLine } from "../../content/send-eligibility";
import type { DashboardTask } from "../dashboard-model";

type SendState = "ready" | "pending" | "success" | "error";

export interface LineDeliveryResult {
  id: string;
  status: "sent" | "failed";
  errorCategory: string | null;
  sentAt: string | null;
}

const safeErrorLabels: Record<string, string> = {
  configuration: "ตั้งค่า LINE ไม่พร้อม",
  recipient: "ผู้รับ LINE ยังไม่พร้อม",
  quota: "โควตาการส่ง LINE เต็ม",
  media_fetch: "LINE เปิดไฟล์สื่อไม่ได้",
  timeout: "การส่งหมดเวลา ลองใหม่ได้",
  provider: "บริการ LINE ขัดข้อง ลองใหม่ได้",
  stale_content: "ข้อมูลชิ้นงานเปลี่ยนแล้ว กรุณาปิดและเปิดหน้าต่างนี้ใหม่",
  caption_required: "ต้องมีแคปชันก่อนส่ง",
  asset_not_ready: "ไฟล์ยังไม่พร้อมส่งผ่าน LINE",
  asset_unsupported: "เลือกไฟล์เดียวเป็น JPG, PNG หรือ MP4 หากตั้งเวลาโพสต์ต้องใช้คลิป MP4",
  preview_missing: "วิดีโอยังไม่มีภาพตัวอย่าง",
};

function sendAssetFor(task: DashboardTask) {
  return task.assets?.find((asset) => asset.remoteReady) ?? null;
}

interface LineSendConfirmationProps {
  task: DashboardTask | null;
  open: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<LineDeliveryResult>;
  connectedRecipient: boolean;
  authenticatedAdmin: boolean;
  recipientMasked: string | null;
  expectedUpdatedAt: string | null;
}

export function LineSendConfirmation({ task, open, onCancel, onConfirm, connectedRecipient, authenticatedAdmin, recipientMasked, expectedUpdatedAt }: LineSendConfirmationProps) {
  const [sendState, setSendState] = useState<SendState>("ready");
  const [delivery, setDelivery] = useState<LineDeliveryResult | null>(null);
  const [errorCategory, setErrorCategory] = useState("provider");

  useEffect(() => {
    setSendState("ready");
    setDelivery(null);
    setErrorCategory("provider");
  }, [open, task?.id]);

  const selectedAsset = task ? sendAssetFor(task) : null;
  const canSend = task && canSendToLine({
    assetState: selectedAsset ? "ready" : task.assets?.length ? "uploading" : "missing",
    caption: task.caption ?? "",
    connectedRecipient,
    authenticatedAdmin,
    isSending: false,
    assetType: selectedAsset?.type,
    previewReady: selectedAsset?.previewReady ?? false,
  });
  if (!open || !task || !selectedAsset || !expectedUpdatedAt || !canSend) {
    return null;
  }

  const isPending = sendState === "pending";

  async function submit() {
    if (isPending || sendState === "success") return;

    setSendState("pending");
    try {
      const result = await onConfirm();
      if (result.status === "sent" && result.id) {
        setDelivery(result);
        setSendState("success");
      } else {
        setErrorCategory(result.errorCategory ?? "provider");
        setSendState("error");
      }
    } catch {
      setErrorCategory("provider");
      setSendState("error");
    }
  }

  return (
    <div className="line-confirmation-backdrop">
      <section className="line-send-confirmation motion-material-surface motion-modal" role="dialog" aria-modal="true" aria-labelledby="line-confirmation-heading">
        <p className="eyebrow">ตรวจสอบก่อนส่ง</p>
        <h2 id="line-confirmation-heading">ยืนยันการส่งเข้า LINE OA</h2>

        {sendState === "success" ? (
          <div className="line-send-receipt" role="status">
            <strong>ส่งเข้า LINE OA เรียบร้อยแล้ว</strong>
            <span>ไฟล์: {selectedAsset.name}</span>
            <span>Delivery ID: {delivery?.id}</span>
            <span>เวลาส่ง: {delivery?.sentAt ? new Date(delivery.sentAt).toLocaleString("th-TH") : "ไม่พบเวลาจากเซิร์ฟเวอร์"}</span>
          </div>
        ) : (
          <>
            <div className="line-confirmation-preview" aria-label={`ไฟล์ที่เลือก ${selectedAsset.name}`}>
              <span className="line-preview-icon" aria-hidden="true">▣</span>
              <div>
                <span className="panel-label">ไฟล์ที่เลือก</span>
                <strong>{selectedAsset.name}</strong>
              </div>
            </div>
            <div className="line-caption-preview">
              <span className="panel-label">ตัวอย่างแคปชัน</span>
              <p>{task.caption}</p>
            </div>
            {selectedAsset.type === "video/mp4" && selectedAsset.size > 200_000_000 && <p className="line-composer-guidance">จะส่งภาพตัวอย่างพร้อมลิงก์ดูคลิปต้นฉบับ คุณภาพเดิม ลิงก์มีอายุ 1 ชั่วโมง และตอบ “ผ่าน/ไม่ผ่าน” ใน LINE ได้ตามเดิม</p>}
            {/^\d{4}-\d{2}-\d{2}$/.test(task.scheduledTime) && <div className="line-recipient"><span>วันที่ลงในปฏิทิน</span><strong>{task.scheduledTime}</strong></div>}
            <p className="line-composer-guidance">วันที่เป็นข้อมูลวางแผนเท่านั้น การกดยืนยันจะส่งเข้า LINE ทันที</p>
            <div className="line-recipient"><span>ผู้รับที่จับคู่ไว้</span><strong>{recipientMasked}</strong></div>
            {sendState === "error" && <p className="line-send-error" role="alert">ส่งไม่สำเร็จ: {safeErrorLabels[errorCategory] ?? "บริการขัดข้อง ลองใหม่ได้"} <span>({errorCategory})</span></p>}
          </>
        )}

        <div className="line-confirmation-actions">
          <button type="button" className="drawer-secondary-button" onClick={onCancel} disabled={isPending}>
            {sendState === "success" ? "ปิด" : "ยกเลิก"}
          </button>
          {sendState !== "success" && (
            <button type="button" className="drawer-delivery-button" onClick={submit} disabled={isPending}>
              {isPending ? "กำลังส่ง…" : sendState === "error" ? "ลองส่งอีกครั้ง" : "ยืนยันส่ง"}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
