import { getAdminActor } from "../../auth/server/admin-session";
import { assertRange, presetRange } from "../report-dates";
import type { ReportPlatform, ReportRange } from "../report-types";
import { fetchProvider, REPORT_PLATFORMS, REPORT_SETUP, type ProviderDependencies } from "./providers";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
export async function reportConnections(request: Request, deps: ProviderDependencies = {}): Promise<Response> {
  if (!await getAdminActor(request, deps.env as NodeJS.ProcessEnv | undefined)) return json({ error: "ต้องเข้าสู่ระบบผู้ดูแล" }, 401);
  const results = await Promise.all(REPORT_PLATFORMS.map((p) => fetchProvider(p, presetRange("30d", deps.now?.()), deps, true)));
  return json({ connections: results.map((r) => r.connection), setup: REPORT_SETUP });
}
export async function reportSync(request: Request, deps: ProviderDependencies = {}): Promise<Response> {
  if (!await getAdminActor(request, deps.env as NodeJS.ProcessEnv | undefined)) return json({ error: "ต้องเข้าสู่ระบบผู้ดูแล" }, 401);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "ไม่อนุญาตคำขอจากเว็บไซต์อื่น" }, 403);
  let range: ReportRange; let platforms: ReportPlatform[];
  try {
    const raw = await request.text(); if (raw.length > 2000) return json({ error: "คำขอใหญ่เกินกำหนด" }, 413);
    const body = JSON.parse(raw);
    if (!body || !body.range || typeof body.range.start !== "string" || typeof body.range.end !== "string") throw new Error();
    range = { start: body.range.start, end: body.range.end }; assertRange(range);
    if (Date.parse(range.end) - Date.parse(range.start) > 366 * 86_400_000) throw new Error();
    if (body.platform !== undefined && !REPORT_PLATFORMS.includes(body.platform)) throw new Error();
    platforms = body.platform ? [body.platform] : REPORT_PLATFORMS;
  } catch { return json({ error: "เลือกช่องทางและช่วงวันที่ถูกต้อง ไม่เกิน 367 วัน" }, 400); }
  const results = await Promise.all(platforms.map((p) => fetchProvider(p, range, deps)));
  return json({ connections: results.map((r) => r.connection), publications: results.flatMap((r) => r.publications), observations: results.flatMap((r) => r.observations), warnings: results.flatMap((r) => r.warnings.map((w) => `${r.connection.label}: ${w}`)), truncated: results.some((r) => r.truncated) });
}
