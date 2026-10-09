import { NeonDashboardRepository, StaleDashboardStateError } from "../../../../../features/data/server/neon-dashboard-repository";
import type { DashboardState, PublicationAttempt } from "../../../../../features/domain/types";
import { applyPublicationResult } from "../../../../../features/publication/server/make-publication-handler";
import { ApprovedPublicationQueue, PublicationQueueError, verifyPublicationJobToken } from "../../../../../features/publication/server/approved-publication-queue";

type ResultBody = { jobId?: string; attemptId?: string; status?: PublicationAttempt["status"]; providerPublicationId?: string; receiptUrl?: string; errorCode?: string };

export const runtime = "nodejs";

async function mutateDashboard(mutate: (state: DashboardState) => DashboardState): Promise<void> {
  const repository = new NeonDashboardRepository();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const snapshot = await repository.loadDashboardState();
    try { await repository.saveDashboardState(mutate(snapshot.state), snapshot.version); return; } catch (error) { if (!(error instanceof StaleDashboardStateError) || attempt === 2) throw error; }
  }
}

export async function POST(request: Request): Promise<Response> {
  const expectedToken = process.env.MAKE_API_TOKEN;
  if (!expectedToken) return Response.json({ error: "ยังไม่ได้ตั้งค่า Make callback" }, { status: 503 });
  let body: ResultBody;
  try { body = await request.json() as ResultBody; } catch { return Response.json({ error: "รูปแบบคำขอไม่ถูกต้อง" }, { status: 400 }); }
  const id = body?.jobId ?? body?.attemptId;
  if (typeof id !== "string" || !id || (body.jobId && body.attemptId && body.jobId !== body.attemptId)) return Response.json({ error: "ข้อมูลผลเผยแพร่ไม่ครบ" }, { status: 400 });
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const queuedJob = id.startsWith("approved-");
  try {
    if (queuedJob ? !verifyPublicationJobToken(id, token) : token !== expectedToken) return Response.json({ error: "ไม่ได้รับอนุญาต" }, { status: 401 });
  } catch { return Response.json({ error: "ยังไม่ได้ตั้งค่า Make callback" }, { status: 503 }); }
  const validStatuses: PublicationAttempt["status"][] = ["publishing", "published", "failed", "cancelled"];
  if (!body.status || !validStatuses.includes(body.status) || [body.providerPublicationId, body.receiptUrl, body.errorCode].some((value) => value !== undefined && typeof value !== "string")) return Response.json({ error: "ข้อมูลผลเผยแพร่ไม่ครบ" }, { status: 400 });
  if (body.status === "published" && !body.providerPublicationId?.trim() && !body.receiptUrl?.trim()) return Response.json({ error: "ผล published ต้องมีหลักฐาน" }, { status: 400 });
  try {
    if (queuedJob) {
      await new ApprovedPublicationQueue().result(id, token, { status: body.status as "publishing" | "published" | "failed" | "cancelled", providerPublicationId: body.providerPublicationId, receiptUrl: body.receiptUrl, errorCode: body.errorCode });
    } else {
      // Compatibility only for jobs already sent by the previous integration.
      await mutateDashboard((state) => applyPublicationResult(state, { id, status: body.status!, providerPublicationId: body.providerPublicationId ?? null, receiptUrl: body.receiptUrl ?? null, errorCode: body.errorCode ?? null }, new Date().toISOString()));
    }
    return Response.json({ status: "accepted" });
  } catch (error) { return Response.json({ error: error instanceof PublicationQueueError ? error.message : "บันทึกผลเผยแพร่ไม่สำเร็จ" }, { status: error instanceof PublicationQueueError ? error.status : 409 }); }
}
