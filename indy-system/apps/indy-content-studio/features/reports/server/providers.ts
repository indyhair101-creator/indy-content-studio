import type { MetricKey, MetricObservation, ReportConnection, ReportPlatform, ReportPublication, ReportRange } from "../report-types";

// This module is imported only by server routes. Never return configuration or upstream errors.
type Json = Record<string, any>;
export interface ProviderResult { connection: ReportConnection; publications: ReportPublication[]; observations: MetricObservation[]; warnings: string[]; truncated: boolean }
export interface ProviderDependencies { env?: Record<string, string | undefined>; fetch?: typeof fetch; now?: () => Date }
export const REPORT_SETUP: Record<ReportPlatform, { variables: string[]; permissions: string; limitation: string }> = {
  facebook: { variables: ["REPORT_META_GRAPH_VERSION", "REPORT_FACEBOOK_PAGE_ID", "REPORT_FACEBOOK_PAGE_TOKEN"], permissions: "Page access token: pages_read_engagement", limitation: "จำนวนความคิดเห็นและแชร์สะสม • ไม่ดึง Reach หรือ Organic ที่ยังไม่ยืนยัน" },
  instagram: { variables: ["REPORT_META_GRAPH_VERSION", "REPORT_INSTAGRAM_ACCOUNT_ID", "REPORT_INSTAGRAM_ACCESS_TOKEN"], permissions: "Facebook Login: instagram_basic, pages_read_engagement; Insights: instagram_manage_insights", limitation: "บัญชี Business/Creator • ไลก์/ความคิดเห็นสะสม • Insights แยกตามสิทธิ์และชนิดสื่อ" },
  youtube: { variables: ["REPORT_YOUTUBE_CHANNEL_ID", "REPORT_YOUTUBE_ACCESS_TOKEN"], permissions: "OAuth: youtube.readonly และ yt-analytics.readonly", limitation: "Data API เป็นยอดสะสม; Analytics เป็นผลในช่วงวัน Pacific ของ YouTube (ไม่ใช่วันกรุงเทพฯ)" },
  tiktok: { variables: ["REPORT_TIKTOK_OPEN_ID", "REPORT_TIKTOK_ACCESS_TOKEN"], permissions: "Login Kit / Display API: user.info.basic, video.list", limitation: "วิดีโอสาธารณะและยอดสะสม • ไม่มี Reach/เวลาเฉลี่ย/Retention ใน Display API" },
};
const labels: Record<ReportPlatform, string> = { facebook: "Facebook", instagram: "Instagram", youtube: "YouTube", tiktok: "TikTok" };
export const REPORT_PLATFORMS = Object.keys(labels) as ReportPlatform[];
class ProviderError extends Error {
  constructor(readonly status: ReportConnection["status"], message: string) { super(message); }
}
export function classifyProviderError(status: number, code: unknown): ProviderError {
  if (status === 401 || code === 190 || code === "access_token_invalid" || code === "invalid_token") return new ProviderError("expired", "สิทธิ์เข้าถึงหมดอายุหรือใช้ไม่ได้ ให้ผู้ดูแลต่ออายุ token บนเซิร์ฟเวอร์แล้วตรวจใหม่");
  if (status === 403 || code === 10 || code === 200 || code === "scope_not_authorized") return new ProviderError("missing-permission", "บัญชีไม่มีสิทธิ์อ่านข้อมูลที่ร้องขอ ตรวจสิทธิ์แอปและบัญชีแล้วตรวจใหม่");
  if (status === 429 || code === 4 || code === 17 || code === "rate_limit_exceeded") return new ProviderError("error", "แพลตฟอร์มจำกัดการเรียกข้อมูล กรุณาลองใหม่ภายหลัง");
  return new ProviderError("error", "แพลตฟอร์มส่งข้อมูลไม่สำเร็จหรือไม่รองรับข้อมูลนี้ ส่วนที่ดึงได้ยังคงใช้งานได้");
}
const number = (value: unknown): number | null => (typeof value === "number" || (typeof value === "string" && value.trim() !== "")) && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
const safeUrl = (value: unknown): string => { try { const url = new URL(String(value)); return url.protocol === "https:" && !url.searchParams.has("access_token") ? url.toString() : ""; } catch { return ""; } };
const iso = (value: unknown): string | null => { const date = new Date(String(value)); return Number.isFinite(date.getTime()) ? date.toISOString() : null; };
function duration(value: unknown): number | null { const m = String(value).match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/); return m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : null; }

export async function fetchProvider(platform: ReportPlatform, range: ReportRange, deps: ProviderDependencies = {}, probe = false): Promise<ProviderResult> {
  const env = deps.env ?? process.env;
  const fetcher = deps.fetch ?? fetch;
  const fetchedAt = (deps.now?.() ?? new Date()).toISOString();
  const deadline = Date.now() + 45_000;
  const setup = REPORT_SETUP[platform];
  const accountVariable = setup.variables.find((v) => v.endsWith("_ID"))!;
  const account = env[accountVariable] ?? "";
  const token = env[setup.variables.find((v) => v.endsWith("_TOKEN"))!] ?? "";
  const connection: ReportConnection = { id: `report:${platform}:${account || "unconfigured"}`, platform, accountId: account, label: labels[platform], status: "disconnected", checkedAt: fetchedAt, message: "", availableMetrics: [] };
  const result: ProviderResult = { connection, publications: [], observations: [], warnings: [], truncated: false };
  const missing = setup.variables.filter((key) => !env[key]);
  if (missing.length) { connection.message = `ยังไม่ตั้งค่าเซิร์ฟเวอร์: ${missing.join(", ")}`; return result; }
  if (!/^[\w-]+$/.test(account) || ((platform === "facebook" || platform === "instagram") && !/^v\d+\.\d+$/.test(env.REPORT_META_GRAPH_VERSION!))) {
    connection.status = "error"; connection.message = "รูปแบบรหัสบัญชีหรือ Graph API version บนเซิร์ฟเวอร์ไม่ถูกต้อง"; return result;
  }
  const request = async (base: string, params: Record<string, string> = {}, body?: Json): Promise<Json> => {
    const url = new URL(base); Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    try {
      if (Date.now() >= deadline) throw new ProviderError("error", "ครบเวลารอบดึงข้อมูลแล้ว ส่วนที่ดึงสำเร็จยังใช้งานได้");
      const response = await fetcher(url.toString(), { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(Math.max(1, Math.min(12_000, deadline - Date.now()))), cache: "no-store", redirect: "error" });
      const data = await response.json() as Json;
      if (!response.ok || (data.error && data.error.code !== "ok")) throw classifyProviderError(response.status, data.error?.code);
      return data;
    } catch (error) { if (error instanceof ProviderError) throw error; throw new ProviderError("error", "ติดต่อแพลตฟอร์มไม่ได้หรือใช้เวลานานเกินกำหนด กรุณาลองใหม่"); }
  };
  const addPublication = (id: unknown, published: unknown, title: unknown, url: unknown, mediaKind: ReportPublication["mediaKind"], seconds: number | null = null, thumbnail: unknown = null): ReportPublication | null => {
    const publishedAt = iso(published);
    if (typeof id !== "string" || !/^[\w-]+$/.test(id) || !publishedAt || !safeUrl(url)) { result.warnings.push("ข้ามรายการที่ไม่มีรหัส วันเผยแพร่ หรือลิงก์โพสต์ที่ถูกต้อง"); return null; }
    const item: ReportPublication = { id: `${platform}:${account}:${id}`, contentId: null, platform, accountId: account, providerPostId: id, url: safeUrl(url), title: String(title ?? "").slice(0, 2000), publishedAt, mediaKind, durationSeconds: seconds, thumbnailUrl: safeUrl(thumbnail) || null };
    result.publications.push(item); return item;
  };
  const observe = (p: ReportPublication, metrics: MetricObservation["metrics"], sourceLabel: string, period: ReportRange | null = null) => {
    const present = Object.fromEntries(Object.entries(metrics).filter(([, value]) => value !== null && value !== undefined)) as MetricObservation["metrics"];
    if (!Object.keys(present).length) return;
    const observation: MetricObservation = { id: `${p.id}:${period ? `activity:${period.start}:${period.end}` : "lifetime"}:${fetchedAt}`, publicationId: p.id, fetchedAt, source: "api", sourceLabel, scope: period ? "activity" : "lifetime", period, traffic: "unknown", metrics: present, averageWatchWeight: null, retention: null };
    if (platform === "youtube" && period) Object.assign(observation, { timeZone: "America/Los_Angeles" });
    result.observations.push(observation);
  };
  const partial = (error: unknown) => { const e = error instanceof ProviderError ? error : classifyProviderError(500, null); connection.status = e.status; result.warnings.push(e.message); };
  try {
    if (platform === "facebook" || platform === "instagram") {
      const graph = `https://graph.facebook.com/${env.REPORT_META_GRAPH_VERSION}`;
      const profile = await request(`${graph}/${account}`, { fields: platform === "facebook" ? "id,name" : "id,username" });
      if (profile.id !== account) throw classifyProviderError(403, null);
      connection.label = String(profile.name ?? profile.username ?? labels[platform]);
      connection.status = "connected";
      let after = "";
      for (let page = 0; page < (probe ? 1 : 3); page++) {
        const fields = platform === "facebook" ? "id,message,created_time,permalink_url,full_picture,shares,comments.limit(0).summary(true)" : "id,caption,timestamp,permalink,media_type,thumbnail_url,like_count,comments_count";
        const data = await request(`${graph}/${account}/${platform === "facebook" ? "posts" : "media"}`, { fields, limit: probe ? "1" : "20", ...(after ? { after } : {}) });
        if (!Array.isArray(data.data)) throw classifyProviderError(500, null);
        for (const row of data.data as Json[]) {
          const p = addPublication(row.id, row.created_time ?? row.timestamp, row.message ?? row.caption, row.permalink_url ?? row.permalink, row.media_type === "VIDEO" ? "video" : row.media_type === "IMAGE" ? "image" : "other", null, row.thumbnail_url ?? row.full_picture);
          if (!p) continue;
          const metrics = platform === "facebook" ? { comments: number(row.comments?.summary?.total_count), shares: number(row.shares?.count) } : { likes: number(row.like_count), comments: number(row.comments_count) };
          if (platform === "instagram") {
            // Metrics vary by media type/permission; a failed insights call must not discard basic counters.
            try {
              const insights = await request(`${graph}/${p.providerPostId}/insights`, { metric: "reach,saved,shares,views", period: "lifetime" });
              const keys: Record<string, MetricKey> = { reach: "reach", saved: "saves", shares: "shares", views: "views" };
              for (const metric of (insights.data ?? []) as Json[]) if (keys[metric.name]) Object.assign(metrics, { [keys[metric.name]]: number(metric.total_value?.value ?? metric.values?.[0]?.value) });
            } catch (error) { partial(error); }
          }
          observe(p, metrics, `${labels[platform]} Graph API — ยอดสะสม ณ เวลาดึง`);
        }
        // Never follow provider next URLs: they can carry access tokens or an untrusted host.
        after = typeof data.paging?.cursors?.after === "string" && data.paging?.next ? data.paging.cursors.after : "";
        if (!after) break;
        if (page === (probe ? 0 : 2)) result.truncated = true;
      }
    } else if (platform === "tiktok") {
      const profile = await request("https://open.tiktokapis.com/v2/user/info/", { fields: "open_id,display_name" });
      if (profile.data?.user?.open_id !== account) throw classifyProviderError(403, null);
      connection.label = String(profile.data.user.display_name ?? "TikTok"); connection.status = "connected";
      let cursor: number | undefined;
      for (let page = 0; page < (probe ? 1 : 3); page++) {
        const data = await request("https://open.tiktokapis.com/v2/video/list/", { fields: "id,title,create_time,share_url,cover_image_url,duration,view_count,like_count,comment_count,share_count" }, { max_count: probe ? 1 : 20, ...(cursor === undefined ? {} : { cursor }) });
        if (!Array.isArray(data.data?.videos)) throw classifyProviderError(500, null);
        for (const row of data.data.videos as Json[]) {
          const stamp = number(row.create_time); const date = stamp === null ? null : new Date(stamp * 1000);
          const p = addPublication(row.id, date && Number.isFinite(date.getTime()) ? date.toISOString() : null, row.title, row.share_url, "video", number(row.duration), row.cover_image_url);
          if (p) observe(p, { views: number(row.view_count), likes: number(row.like_count), comments: number(row.comment_count), shares: number(row.share_count) }, "TikTok Display API — ยอดสะสม ณ เวลาดึง");
        }
        if (!data.data.has_more) break;
        const next = number(data.data.cursor);
        if (next === null || next === cursor) { result.truncated = true; break; }
        cursor = next; if (page === (probe ? 0 : 2)) result.truncated = true;
      }
    } else {
      const base = "https://www.googleapis.com/youtube/v3";
      const profile = await request(`${base}/channels`, { part: "id,snippet,contentDetails", mine: "true" });
      const channel = (profile.items as Json[] | undefined)?.find((c) => c.id === account);
      if (!channel) throw classifyProviderError(403, null);
      connection.label = String(channel.snippet?.title ?? "YouTube"); connection.status = "connected";
      const playlist = channel.contentDetails?.relatedPlaylists?.uploads;
      if (typeof playlist !== "string") throw classifyProviderError(500, null);
      let pageToken = "";
      for (let page = 0; page < (probe ? 1 : 3); page++) {
        const list = await request(`${base}/playlistItems`, { part: "contentDetails", playlistId: playlist, maxResults: probe ? "1" : "20", ...(pageToken ? { pageToken } : {}) });
        if (!Array.isArray(list.items)) throw classifyProviderError(500, null);
        const ids = (list.items as Json[]).map((r) => r.contentDetails?.videoId).filter((id): id is string => typeof id === "string" && /^[\w-]+$/.test(id));
        if (ids.length) {
          const videos = await request(`${base}/videos`, { part: "snippet,contentDetails,statistics", id: ids.join(",") });
          for (const row of (videos.items ?? []) as Json[]) {
            const p = addPublication(row.id, row.snippet?.publishedAt, row.snippet?.title, `https://www.youtube.com/watch?v=${encodeURIComponent(row.id)}`, "video", duration(row.contentDetails?.duration), row.snippet?.thumbnails?.medium?.url);
            if (p) observe(p, { views: number(row.statistics?.viewCount), likes: number(row.statistics?.likeCount), comments: number(row.statistics?.commentCount) }, "YouTube Data API — ยอดสะสม ณ เวลาดึง");
          }
          try {
            const analytics = await request("https://youtubeanalytics.googleapis.com/v2/reports", { ids: `channel==${account}`, startDate: range.start, endDate: range.end, dimensions: "video", filters: `video==${ids.join(",")}`, metrics: "views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,likes,comments,shares,subscribersGained", maxResults: "200", sort: "-views" });
            const columns = (analytics.columnHeaders ?? []).map((h: Json) => h.name);
            for (const row of (analytics.rows ?? []) as unknown[][]) {
              const read = (key: string) => row[columns.indexOf(key)];
              const p = result.publications.find((item) => item.providerPostId === read("video"));
              if (!p) continue;
              const minutes = number(read("estimatedMinutesWatched"));
              observe(p, { views: number(read("views")), watchSeconds: minutes === null ? null : minutes * 60, averageWatchSeconds: number(read("averageViewDuration")), averageWatchPercent: number(read("averageViewPercentage")), likes: number(read("likes")), comments: number(read("comments")), shares: number(read("shares")), followers: number(read("subscribersGained")) }, "YouTube Analytics — วัน Pacific (America/Los_Angeles); subscribersGained จากหน้าวิดีโอ; ไม่มีฐานถ่วงเฉลี่ยที่ยืนยัน", range);
            }
          } catch (error) { partial(error); }
        }
        pageToken = typeof list.nextPageToken === "string" ? list.nextPageToken : "";
        if (!pageToken) break; if (page === (probe ? 0 : 2)) result.truncated = true;
      }
    }
  } catch (error) { partial(error); }
  connection.availableMetrics = [...new Set(result.observations.flatMap((o) => Object.keys(o.metrics) as MetricKey[]))];
  result.publications = [...new Map(result.publications.map((p) => [p.id, p])).values()];
  result.observations = [...new Map(result.observations.map((o) => [o.id, o])).values()];
  result.warnings = [...new Set(result.warnings)];
  connection.message = result.warnings.join(" • ") || `ตรวจการอ่านข้อมูลสำเร็จ${result.publications.length ? "" : " • ยังไม่มีรายการที่ API ส่งกลับ"}`;
  if (result.truncated) result.warnings.push("อ่านเฉพาะรายการล่าสุด สูงสุด 60 รายการต่อบัญชี ยังมีข้อมูลย้อนหลังที่ไม่ได้ดึง");
  if (probe) { result.publications = []; result.observations = []; result.truncated = false; }
  return result;
}
