import { createHash } from "node:crypto";
import { list } from "@vercel/blob";
import type { IntegrationStatus } from "../../domain/types";
import { createNeonExecutor, type SqlExecutor } from "../../data/server/neon-client";
import {
  createGoogleDriveMediaClientFromEnvironment,
  type Fetcher,
  type GoogleDriveMediaClient,
} from "../../media/server/google-drive-media-client";

export type IntegrationHealthCategory = "ok" | "configuration" | "timeout" | "permission" | "not_found" | "quota" | "provider";
export type IntegrationProbeResult = {
  status: IntegrationStatus["status"];
  category: IntegrationHealthCategory;
};
export type IntegrationHealth = Pick<IntegrationStatus, "provider" | "status" | "checkedAt" | "message"> & {
  category: IntegrationHealthCategory;
};
export type IntegrationHealthCheck = {
  provider: IntegrationStatus["provider"];
  check: (signal?: AbortSignal) => Promise<boolean | IntegrationProbeResult>;
  /** Opaque fingerprint used to avoid reusing a success after credentials change. */
  cacheKey?: string;
};

type HealthCacheEntry = { result: IntegrationProbeResult; checkedAt: string; expiresAt: number };
type HealthCache = Map<string, HealthCacheEntry>;
type IntegrationHealthOptions = {
  timeoutMs?: number;
  cacheTtlMs?: number;
  now?: () => number;
  cache?: HealthCache;
};
type Environment = Readonly<Record<string, string | undefined>>;
type HealthDependencies = {
  execute?: SqlExecutor;
  fetcher?: Fetcher;
  createDriveClient?: (environment: Environment, fetcher: Fetcher) => Pick<GoogleDriveMediaClient, "probeStorage"> | null;
  probeBlobStorage?: (signal?: AbortSignal) => Promise<boolean>;
};

const DEFAULT_TIMEOUT_MS = 3_000;
const DEFAULT_CACHE_TTL_MS = 30_000;
const healthCache: HealthCache = new Map();

const providerEnv: Record<IntegrationStatus["provider"], string[]> = {
  database: ["DATABASE_URL"],
  "google-sheets": ["GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_PRIVATE_KEY"],
  "google-drive": ["GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_PRIVATE_KEY", "GOOGLE_DRIVE_FOLDER_ID"],
  blob: ["BLOB_STORE_ID", "BLOB_READ_WRITE_TOKEN"],
  line: ["LINE_CHANNEL_SECRET", "LINE_CHANNEL_ACCESS_TOKEN"],
  make: ["MAKE_API_TOKEN", "MAKE_PUBLICATION_WEBHOOK_URL"],
  tiktok: ["TIKTOK_ACCESS_TOKEN"],
  "online-media": ["ONLINE_MEDIA_API_KEY"],
  "ai-caption": ["AI_CAPTION_API_KEY"],
};

export const integrationProviders = Object.keys(providerEnv) as IntegrationStatus["provider"][];

function fingerprint(provider: IntegrationStatus["provider"], env: Environment): string {
  const values = providerEnv[provider].map((name) => env[name] ?? "");
  return `${provider}:${createHash("sha256").update(values.join("\0")).digest("hex")}`;
}

function disconnected(category: Exclude<IntegrationHealthCategory, "ok" | "timeout" | "provider">): IntegrationProbeResult {
  return { status: "disconnected", category };
}

function providerError(): IntegrationProbeResult {
  return { status: "error", category: "provider" };
}

function mapDriveProbe(result: Awaited<ReturnType<NonNullable<GoogleDriveMediaClient["probeStorage"]>>>): IntegrationProbeResult {
  switch (result) {
    case "connected": return { status: "connected", category: "ok" };
    case "folder_not_found": return disconnected("not_found");
    case "storage_permission":
    case "auth": return disconnected("permission");
    case "quota": return { status: "error", category: "quota" };
  }
}

function mapLineResponse(response: Response): IntegrationProbeResult {
  if (response.ok) return { status: "connected", category: "ok" };
  if (response.status === 400 || response.status === 401 || response.status === 403) return disconnected("permission");
  if (response.status === 429) return { status: "error", category: "quota" };
  return providerError();
}

export function defaultIntegrationHealthChecks(
  env: Environment = process.env,
  dependencies: HealthDependencies = {},
): IntegrationHealthCheck[] {
  const fetcher = dependencies.fetcher ?? fetch;
  return integrationProviders.map((provider) => {
    const cacheKey = fingerprint(provider, env);

    if (provider === "database") {
      return {
        provider,
        cacheKey,
        check: async () => {
          if (!env.DATABASE_URL) return disconnected("configuration");
          const execute = dependencies.execute ?? createNeonExecutor(env.DATABASE_URL);
          const rows = await execute("SELECT 1 AS ok", []);
          return rows.length > 0 ? { status: "connected", category: "ok" } : providerError();
        },
      };
    }

    if (provider === "google-drive") {
      return {
        provider,
        cacheKey,
        check: async (signal) => {
          if (providerEnv[provider].some((name) => !env[name])) return disconnected("configuration");
          const createDriveClient = dependencies.createDriveClient ?? ((environment, driveFetcher) =>
            createGoogleDriveMediaClientFromEnvironment(environment, driveFetcher));
          const client = createDriveClient(env, fetcher);
          if (!client?.probeStorage) return disconnected("configuration");
          return mapDriveProbe(await client.probeStorage({ signal }));
        },
      };
    }

    if (provider === "blob") {
      return {
        provider,
        cacheKey,
        check: async (signal) => {
          if (!env.BLOB_STORE_ID && !env.BLOB_READ_WRITE_TOKEN) return disconnected("configuration");
          const probe = dependencies.probeBlobStorage ?? (async () => {
            await list({ limit: 1, abortSignal: signal });
            return true;
          });
          return await probe(signal) ? { status: "connected", category: "ok" } : providerError();
        },
      };
    }

    if (provider === "line") {
      return {
        provider,
        cacheKey,
        check: async (signal) => {
          if (providerEnv[provider].some((name) => !env[name])) return disconnected("configuration");
          const body = new URLSearchParams({ access_token: env.LINE_CHANNEL_ACCESS_TOKEN! });
          const response = await fetcher("https://api.line.me/v2/oauth/verify", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body,
            signal,
          });
          return mapLineResponse(response);
        },
      };
    }

    return {
      provider,
      cacheKey,
      check: async () => providerEnv[provider].every((name) => Boolean(env[name]))
        ? { status: "connected", category: "ok" }
        : disconnected("configuration"),
    };
  });
}

function normalizeResult(result: boolean | IntegrationProbeResult): IntegrationProbeResult {
  if (typeof result === "boolean") {
    return result ? { status: "connected", category: "ok" } : disconnected("configuration");
  }
  return result;
}

function messageFor(status: IntegrationStatus["status"]): string {
  if (status === "connected") return "เชื่อมต่อแล้ว";
  if (status === "disconnected") return "ยังไม่ได้เชื่อมต่อ";
  return "ตรวจการเชื่อมต่อไม่สำเร็จ";
}

export async function getIntegrationHealth(
  checks: IntegrationHealthCheck[] = defaultIntegrationHealthChecks(),
  options: IntegrationHealthOptions = {},
): Promise<IntegrationHealth[]> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const now = options.now ?? Date.now;
  const cache = options.cache ?? healthCache;

  return Promise.all(checks.map(async ({ provider, check, cacheKey }) => {
    const currentTime = now();
    const cached = cacheKey ? cache.get(cacheKey) : undefined;
    if (cached && cached.expiresAt > currentTime) {
      return { provider, ...cached.result, checkedAt: cached.checkedAt, message: messageFor(cached.result.status) };
    }
    if (cached && cacheKey) cache.delete(cacheKey);

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutResult = new Promise<IntegrationProbeResult>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve({ status: "error", category: "timeout" });
      }, timeoutMs);
    });

    let result: IntegrationProbeResult;
    try {
      result = await Promise.race([
        Promise.resolve().then(() => check(controller.signal)).then(normalizeResult, () => providerError()),
        timeoutResult,
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }

    const checkedAt = new Date(now()).toISOString();
    if (result.status === "connected" && cacheKey && cacheTtlMs > 0) {
      cache.set(cacheKey, { result, checkedAt, expiresAt: now() + cacheTtlMs });
    }
    return { provider, ...result, checkedAt, message: messageFor(result.status) };
  }));
}
