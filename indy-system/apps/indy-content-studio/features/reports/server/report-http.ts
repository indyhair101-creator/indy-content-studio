import { getAdminActor } from "../../auth/server/admin-session";
import { assertRange, presetRange } from "../report-dates";
import type { ReportPlatform, ReportRange } from "../report-types";
import { fetchProvider, REPORT_PLATFORMS, REPORT_SETUP, type ProviderDependencies } from "./providers";
import { fetchZernio } from "./zernio";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
export async function reportConnections(request: Request, deps: ProviderDependencies = {}): Promise<Response> {
  if (!await getAdminActor(request, deps.env as NodeJS.ProcessEnv | undefined)) return json({ error: "ต้องเข้าสู่ระบบผู้ดูแล" }, 401);
  const data = await fetchReportProviders(presetRange("30d", deps.now?.()), deps, { probe: true });
  return json({ connections: data.connections, setup: REPORT_SETUP, warnings: data.warnings, zernioConfigured: data.zernioConfigured });
}
export async function fetchReportProviders(range: ReportRange, deps: ProviderDependencies, options: { probe?: boolean; platform?: ReportPlatform; accountId?: string } = {}) {
  const platforms = options.platform ? [options.platform] : REPORT_PLATFORMS;
  const env = deps.env ?? process.env;
  const directPlatforms = platforms.filter((p) => {
    const accountVariable = p === "instagram" ? "REPORT_INSTAGRAM_ACCOUNT_ID" : REPORT_SETUP[p].variables.find((v) => v.endsWith("_ID"))!;
    const nativeId = env[accountVariable];
    const canDiscoverInstagram = p === "instagram" && !nativeId && Boolean(env.REPORT_FACEBOOK_PAGE_ID);
    return !options.accountId || options.accountId === nativeId || options.accountId === `report:${p}:${nativeId}` || canDiscoverInstagram;
  });
  const [zernio, direct] = await Promise.all([fetchZernio(range, deps, options), Promise.all(directPlatforms.map((p) => fetchProvider(p, range, deps, options.probe)))]);
  const filtered = direct.filter((r) => {
    const c = r.connection;
    if (options.accountId && c.accountId !== options.accountId && c.id !== options.accountId) return false;
    return !zernio.results.some((z) => z.connection.platform === c.platform && (!c.accountId || z.connection.accountId === c.accountId));
  });
  const results = [...zernio.results, ...filtered];
  return { connections: results.map((r) => r.connection), publications: results.flatMap((r) => r.publications), observations: results.flatMap((r) => r.observations), warnings: [...zernio.warnings, ...results.flatMap((r) => r.warnings.map((w) => `${r.connection.label}: ${w}`))], truncated: zernio.truncated || results.some((r) => r.truncated), zernioConfigured: zernio.configured };
}
export async function reportSync(request: Request, deps: ProviderDependencies = {}): Promise<Response> {
  if (!await getAdminActor(request, deps.env as NodeJS.ProcessEnv | undefined)) return json({ error: "ต้องเข้าสู่ระบบผู้ดูแล" }, 401);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "ไม่อนุญาตคำขอจากเว็บไซต์อื่น" }, 403);
  let range: ReportRange; let platform: ReportPlatform | undefined; let accountId: string | undefined;
  try {
    const raw = await request.text(); if (raw.length > 2000) return json({ error: "คำขอใหญ่เกินกำหนด" }, 413);
    const body = JSON.parse(raw);
    if (!body || !body.range || typeof body.range.start !== "string" || typeof body.range.end !== "string") throw new Error();
    range = { start: body.range.start, end: body.range.end }; assertRange(range);
    if (Date.parse(range.end) - Date.parse(range.start) > 365 * 86_400_000) throw new Error();
    if (body.platform !== undefined && !REPORT_PLATFORMS.includes(body.platform)) throw new Error();
    if (body.accountId !== undefined && (typeof body.accountId !== "string" || !/^[\w:-]{1,300}$/.test(body.accountId))) throw new Error();
    platform = body.platform; accountId = body.accountId;
  } catch { return json({ error: "เลือกบัญชี ช่องทาง และช่วงวันที่ถูกต้อง ไม่เกิน 366 วัน" }, 400); }
  return json(await fetchReportProviders(range, deps, { platform, accountId }));
}
