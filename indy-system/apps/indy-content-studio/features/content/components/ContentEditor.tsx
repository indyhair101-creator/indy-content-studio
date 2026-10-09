import type { AssetState } from "../send-eligibility";

export function ContentEditor({
  assetState,
  caption,
}: {
  assetState: AssetState;
  caption: string;
}) {
  return (
    <section aria-labelledby="content-editor-heading">
      <h2 id="content-editor-heading">เตรียมส่งคอนเทนต์</h2>
      <p>ไฟล์: {assetState === "ready" ? "พร้อม" : "ยังไม่พร้อม"}</p>
      <p>แคปชัน: {caption.trim() || "ยังไม่กรอก"}</p>
      <p>การส่งจริงทำจากรายละเอียดงาน หลังจับคู่ LINE และอัปโหลดไฟล์เรียบร้อยแล้ว</p>
    </section>
  );
}
