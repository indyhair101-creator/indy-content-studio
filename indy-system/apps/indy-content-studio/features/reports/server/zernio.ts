import type { MetricKey, MetricObservation, ReportConnection, ReportPlatform, ReportPublication, ReportRange } from "../report-types";
import { REPORT_PLATFORMS, type ProviderDependencies, type ProviderResult } from "./providers";

type Json = Record<string, any>;
type Account = { id: string; nativeId: string; platform: ReportPlatform; label: string; inactive: boolean; reconnect: boolean };
export interface ZernioResults { results: ProviderResult[]; warnings: string[]; truncated: boolean; configured: boolean }
const stamp = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
const count = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
const url = (value: unknown) => { try { const u = new URL(String(value)); return u.protocol === "https:" && !u.searchParams.has("access_token") ? u.toString() : ""; } catch { return ""; } };
const validId = (value: unknown): value is string => typeof value === "string" && /^[\w-]{1,100}$/.test(value);
class ZernioError extends Error { constructor(readonly status: ReportConnection["status"], message: string) { super(message); } }
function errorFor(status: number) {
  if (status === 401) return new ZernioError("expired", "Zernio: API key หรือสิทธิ์บัญชีใช้ไม่ได้/หมดอายุ ตรวจหรือเชื่อมบัญชีใหม่ใน Zernio");
  if (status === 402) return new ZernioError("missing-permission", "Zernio: แผนปัจจุบันไม่มีสิทธิ์ Analytics (analytics add-on) ระบบไม่ได้ซื้อหรือเปลี่ยนแผน");
  if (status === 403 || status === 412) return new ZernioError("missing-permission", "Zernio: ขาดสิทธิ์ Analytics หรือบัญชีอยู่นอกขอบเขตแผน/API key");
  if (status === 429) return new ZernioError("error", "Zernio จำกัดการเรียกข้อมูล กรุณาลองใหม่ภายหลัง");
  return new ZernioError("error", "Zernio ยังส่งข้อมูลไม่ครบหรือขัดข้อง ส่วนที่อ่านสำเร็จยังใช้งานได้");
}

/** The analytics list contains absolute snapshots. The date filter never turns them into activity totals. */
export function mapZernioPost(post: Json, entry: Json, account: Account, fetchedAt: string): { publication: ReportPublication; observation: MetricObservation | null } | null {
  if (entry.platform !== account.platform || entry.accountId !== account.id || entry.status !== "published" || !validId(entry.platformPostId)) return null;
  const publishedAt = stamp(post.publishedAt); const link = url(entry.platformPostUrl);
  if (!publishedAt || !link) return null;
  const id = `${account.platform}:${account.nativeId}:${entry.platformPostId}`;
  const analytics = entry.analytics && typeof entry.analytics === "object" ? entry.analytics as Json : {};
  const publication: ReportPublication = { id, contentId: null, platform: account.platform, accountId: account.nativeId, providerPostId: entry.platformPostId, title: String(post.content ?? "").slice(0, 2000), publishedAt, url: link, mediaKind: post.mediaType === "video" ? "video" : post.mediaType === "image" ? "image" : "other", durationSeconds: account.platform === "instagram" ? count(analytics.videoDurationSeconds) : null, thumbnailUrl: url(post.thumbnailUrl) || null };
  if (entry.syncStatus !== "synced") return { publication, observation: null };
  const metrics: MetricObservation["metrics"] = {};
  // Basic interaction counters are supported on these four platforms. Never use a multi-account rollup.
  for (const key of ["likes", "comments", "shares"] as const) { const value = count(analytics[key]); if (value !== null) metrics[key] = value; }
  if (publication.mediaKind === "video") { const value = count(analytics.views); if (value !== null) metrics.views = value; }
  // Zernio zero-fills unsupported fields. Positive optional values are evidence; zero is ambiguous.
  if (account.platform === "facebook" || account.platform === "instagram") { const value = count(analytics.reach); if (value !== null && value > 0) metrics.reach = value; }
  if (account.platform === "instagram") { const value = count(analytics.saves); if (value !== null && value > 0) metrics.saves = value; }
  if (account.platform !== "youtube") {
    for (const [raw, key] of [["igReelsAvgWatchTime", "averageWatchSeconds"], ["igReelsVideoViewTotalTime", "watchSeconds"]] as const) { const value = count(analytics[raw]); if (value !== null && value > 0 && publication.mediaKind === "video") metrics[key] = value / 1000; }
    const follows = count(analytics.follows); if (follows !== null && follows > 0) metrics.followers = follows;
  }
  if (account.platform === "tiktok") { const value = count(analytics.completionRate); if (value !== null && value > 0 && value <= 1) metrics.completionRate = value * 100; }
  const retention = account.platform === "facebook" && analytics.retentionCurve && typeof analytics.retentionCurve === "object" ? Object.entries(analytics.retentionCurve).filter(([position, ratio]) => /^\d+$/.test(position) && count(ratio) !== null && Number(ratio) <= 1).slice(0, 41).map(([position, ratio]) => ({ positionSeconds: Number(position), ratio: Number(ratio) })).sort((a, b) => a.positionSeconds - b.positionSeconds) : [];
  const sourceStamp = stamp(analytics.lastUpdated);
  if (!Object.keys(metrics).length && !retention.length) return { publication, observation: null };
  return { publication, observation: { id: `${id}:zernio:lifetime:${fetchedAt}`, publicationId: id, fetchedAt, source: "api", sourceLabel: `Zernio / ${account.platform} — ยอดสะสม; ต้นทางอัปเดต ${sourceStamp ?? "ไม่ระบุ"}; ช่องทางยอดไม่ยืนยัน${account.platform === "facebook" ? "; likes คือปฏิกิริยาที่ผู้ให้บริการรายงาน; retention เป็นสัดส่วนตัวอย่างที่ Meta ไม่เปิดฐาน" : ""}${post.isAd === true ? "; มียอดโฆษณาปะปน ไม่ใช่ Organic" : ""}`, scope: "lifetime", period: null, traffic: "unknown", metrics, averageWatchWeight: null, retention: retention.length ? retention : null } };
}

export async function fetchZernio(range: ReportRange, deps: ProviderDependencies = {}, options: { probe?: boolean; platform?: ReportPlatform; accountId?: string } = {}): Promise<ZernioResults> {
  const env = deps.env ?? process.env; const token = env.Zernio_API_KEY || env.ZERNIO_API_KEY;
  const output: ZernioResults = { results: [], warnings: [], truncated: false, configured: Boolean(token) };
  if (!token) return output;
  const fetchedAt = (deps.now?.() ?? new Date()).toISOString(); const deadline = Date.now() + 45_000;
  const get = async (path: string, params: Record<string, string> = {}): Promise<Json> => {
    try {
      if (Date.now() >= deadline) throw errorFor(504);
      const endpoint = new URL(`https://zernio.com/api/v1/${path}`); Object.entries(params).forEach(([k, v]) => endpoint.searchParams.set(k, v));
      const response = await (deps.fetch ?? fetch)(endpoint.toString(), { method: "GET", headers: { Authorization: `Bearer ${token}` }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(Math.max(1, Math.min(12_000, deadline - Date.now()))) });
      if (!response.ok || response.status === 202) throw errorFor(response.status);
      const data: unknown = await response.json(); if (!data || typeof data !== "object") throw errorFor(500); return data as Json;
    } catch (error) { if (error instanceof ZernioError) throw error; throw errorFor(500); }
  };
  const accounts: Account[] = []; let analyticsAccess: boolean | undefined;
  try {
    for (let page = 1; page <= 3; page++) {
      const data = await get("accounts", { page: String(page), limit: "100", category: "social", excludeHidden: "true", ...(options.platform ? { platform: options.platform } : {}) });
      if (!Array.isArray(data.accounts)) throw errorFor(500);
      if (typeof data.hasAnalyticsAccess === "boolean") analyticsAccess = data.hasAnalyticsAccess;
      for (const row of data.accounts as Json[]) {
        if (!validId(row._id) || !REPORT_PLATFORMS.includes(row.platform)) continue;
        const nativeId = row.platform === "instagram" && validId(row.metadata?.instagramScopedId) ? row.metadata.instagramScopedId : validId(row.platformUserId) ? row.platformUserId : `zernio_${row._id}`;
        accounts.push({ id: row._id, nativeId, platform: row.platform, label: String(row.displayName ?? row.username ?? row.platform).slice(0, 1900), inactive: row.isActive === false, reconnect: row.needsReconnection === true });
      }
      if (data.accounts.length < 100 || (typeof data.pagination?.pages === "number" && data.pagination.pages <= page)) break;
      if (page === 3) { output.truncated = true; output.warnings.push("การค้นหาบัญชี Zernio จำกัด 300 บัญชี รอบนี้อาจยังไม่ครบทุกรายการ"); }
    }
  } catch (error) { output.warnings.push(error instanceof ZernioError ? error.message : errorFor(500).message); }
  const selected = [...new Map(accounts.map((a) => [`${a.platform}:${a.nativeId}`, a])).values()].filter((a) => (!options.platform || a.platform === options.platform) && (!options.accountId || options.accountId === a.nativeId || options.accountId === `zernio:${a.platform}:${a.id}`));
  if (selected.length > 20) { output.truncated = true; output.warnings.push("Zernio: รอบนี้ตรวจสูงสุด 20 บัญชี กรุณาเลือกบัญชีเพื่อดึงแยก"); }
  if (!selected.length && options.accountId) output.warnings.push("ไม่พบบัญชีที่เลือกในรายการที่ API key มีสิทธิ์อ่าน");
  for (const account of selected.slice(0, 20)) {
    const result: ProviderResult = { connection: { id: `zernio:${account.platform}:${account.id}`, platform: account.platform, accountId: account.nativeId, label: `${account.label} · Zernio`, status: "error", checkedAt: fetchedAt, message: "ยังไม่ได้ตรวจสิทธิ์ Analytics", availableMetrics: [] }, publications: [], observations: [], warnings: [], truncated: false };
    output.results.push(result);
    try {
      if (account.inactive || account.reconnect) throw new ZernioError("expired", "บัญชีนี้ต้องเชื่อมต่อใหม่ใน Zernio ก่อนอ่านรายงาน");
      const health = await get(`accounts/${encodeURIComponent(account.id)}/health`);
      if (health.tokenStatus?.valid === false) throw new ZernioError("expired", "บัญชีนี้ token หมดอายุหรือใช้ไม่ได้ ต้องเชื่อมต่อใหม่ใน Zernio");
      if (health.tokenStatus?.valid !== true || health.status === "error") throw errorFor(500);
      if (analyticsAccess === false) throw errorFor(402);
      if (health.permissions?.canFetchAnalytics !== true) throw errorFor(403);
      result.connection.status = "connected"; result.connection.message = "Zernio ยืนยันสิทธิ์อ่าน Analytics; ยังไม่รับรองความครบถ้วนของตัวเลข";
      if (options.probe) continue;
      for (let page = 1; page <= 3; page++) {
        const data = await get("analytics", { accountId: account.id, platform: account.platform, source: "all", fromDate: range.start, toDate: range.end, page: String(page), limit: "20", sortBy: "date", order: "desc" });
        if (data.hasAnalyticsAccess === false) throw errorFor(402);
        if (!Array.isArray(data.posts)) throw errorFor(500);
        for (const post of data.posts as Json[]) {
          for (const entry of (Array.isArray(post.platforms) ? post.platforms : []) as Json[]) {
            const mapped = mapZernioPost(post, entry, account, fetchedAt); if (!mapped) continue;
            result.publications.push(mapped.publication);
            if (mapped.observation) result.observations.push(mapped.observation);
            else result.warnings.push("บางโพสต์ยังรอ sync หรือไม่มีตัวเลขที่ยืนยันได้ ไม่แทนด้วยศูนย์");
            if (entry.errorCode === "permission_missing") result.connection.status = "missing-permission";
          }
        }
        if (data.overview?.dataStaleness?.staleAccountCount > 0) result.warnings.push("Zernio แจ้งว่าข้อมูลต้นทางบางบัญชียังไม่อัปเดต");
        if (data.posts.length < 20 || (typeof data.pagination?.pages === "number" && data.pagination.pages <= page)) break;
        if (page === 3) { result.truncated = true; result.warnings.push("อ่านสูงสุด 60 โพสต์ต่อบัญชีในช่วงที่ร้องขอ ยังไม่ใช่ประวัติทั้งหมด"); }
      }
    } catch (error) { const problem = error instanceof ZernioError ? error : errorFor(500); result.connection.status = problem.status; result.connection.message = problem.message; result.warnings.push(problem.message); }
    result.connection.availableMetrics = [...new Set(result.observations.flatMap((o) => Object.keys(o.metrics) as MetricKey[]))];
    result.publications = [...new Map(result.publications.map((p) => [p.id, p])).values()]; result.observations = [...new Map(result.observations.map((o) => [o.id, o])).values()];
    result.warnings = [...new Set(result.warnings)];
    if (result.warnings.length) result.connection.message = [...new Set([result.connection.message, ...result.warnings])].join(" • ").slice(0, 2000);
  }
  output.truncated ||= output.results.some((r) => r.truncated);
  return output;
}
