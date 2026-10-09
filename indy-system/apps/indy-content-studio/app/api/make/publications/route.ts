import { NeonDashboardRepository } from "../../../../features/data/server/neon-dashboard-repository";
import { ApprovedPublicationQueue, PublicationQueueError } from "../../../../features/publication/server/approved-publication-queue";

export const runtime = "nodejs";

/** Authenticated dashboard approval uses server-owned content and the same durable queue as LINE. */
export async function POST(request: Request): Promise<Response> {
  let body: { attemptId?: string; contentId?: string };
  try { body = await request.json() as typeof body; } catch { return Response.json({ error: "รูปแบบคำขอไม่ถูกต้อง" }, { status: 400 }); }
  if ((!body?.attemptId || typeof body.attemptId !== "string") && (!body?.contentId || typeof body.contentId !== "string")) return Response.json({ error: "ข้อมูลคิวเผยแพร่ไม่ครบ" }, { status: 400 });
  if (!process.env.MAKE_PUBLICATION_WEBHOOK_URL || !process.env.MAKE_API_TOKEN) return Response.json({ error: "ยังไม่ได้เชื่อมต่อ Make ครบถ้วน" }, { status: 503 });
  try {
    const { state } = await new NeonDashboardRepository().loadDashboardState();
    const attempt = state.publicationAttempts.find((item) => item.id === body.attemptId);
    if (body.attemptId && !attempt) return Response.json({ error: "ไม่พบรายการเผยแพร่" }, { status: 404 });
    const content = state.contents.find((item) => item.id === (attempt?.contentId ?? body.contentId) && !item.deletedAt);
    if (!content) return Response.json({ error: "ไม่พบคอนเทนต์สำหรับเผยแพร่" }, { status: 409 });
    const queue = new ApprovedPublicationQueue();
    if (attempt?.id.startsWith("approved-") && content.lineReview.activeCycleId && content.lineReview.reviewCode && content.lineReview.status === "approved") {
      await queue.enqueue({ contentId: content.id, cycleId: content.lineReview.activeCycleId, reviewCode: content.lineReview.reviewCode });
    } else {
      await queue.enqueueDashboard(content.id);
    }
    const projected = await queue.sync(state);
    const queued = projected.publicationAttempts.find((item) => item.contentId === content.id && (!attempt || item.platform === attempt.platform) && item.id.startsWith("approved-") && projected.contents.find((item) => item.id === content.id)?.schedules.some((schedule) => schedule.enabled && schedule.latestAttemptId === item.id));
    if (!queued || queued.status === "failed" || queued.status === "cancelled") return Response.json({ error: "ยังไม่สามารถเผยแพร่ กรุณาตรวจเวลาลงและสื่อ แล้วอนุมัติรอบใหม่", errorCode: queued?.errorCode ?? "APPROVED_QUEUE_REQUIRED" }, { status: 409 });
    return Response.json({ status: queued.status, queueId: queued.id });
  } catch (error) { return Response.json({ error: error instanceof PublicationQueueError ? error.message : "ระบบเผยแพร่ไม่พร้อมใช้งาน" }, { status: error instanceof PublicationQueueError ? error.status : 503 }); }
}
