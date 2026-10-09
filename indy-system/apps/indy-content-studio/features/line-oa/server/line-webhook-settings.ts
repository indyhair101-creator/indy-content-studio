type Environment = Readonly<Record<string, string | undefined>>;
type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export async function configureLineWebhook(options: {
  environment?: Environment;
  fetcher?: Fetcher;
} = {}): Promise<{ configured: boolean; verified: boolean; active: boolean }> {
  const environment = options.environment ?? process.env;
  const fetcher = options.fetcher ?? globalThis.fetch;
  const token = environment.LINE_CHANNEL_ACCESS_TOKEN;
  let origin: URL;
  try {
    origin = new URL(environment.APP_PUBLIC_BASE_URL ?? "");
  } catch {
    throw new Error("configuration");
  }
  if (origin.protocol !== "https:" || origin.username || origin.password || !token) {
    throw new Error("configuration");
  }

  const endpoint = new URL("/api/line/webhook", origin).toString();
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const base = "https://api.line.me/v2/bot/channel/webhook";
  const put = await fetcher(`${base}/endpoint`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ endpoint }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!put.ok) throw new Error("provider");

  const test = await fetcher(`${base}/test`, {
    method: "POST",
    headers,
    body: "{}",
    signal: AbortSignal.timeout(12_000),
  });
  if (!test.ok) throw new Error("provider");
  const testResult = await test.json() as { success?: unknown };

  const get = await fetcher(`${base}/endpoint`, {
    method: "GET",
    headers,
    signal: AbortSignal.timeout(12_000),
  });
  if (!get.ok) throw new Error("provider");
  const current = await get.json() as { endpoint?: unknown; active?: unknown };
  return {
    configured: current.endpoint === endpoint,
    verified: testResult.success === true,
    active: current.active === true,
  };
}
