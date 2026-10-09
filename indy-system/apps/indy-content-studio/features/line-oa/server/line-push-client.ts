type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type LineMessage = { type: "text"; text: string } | {
  type: "image" | "video";
  originalContentUrl: string;
  previewImageUrl: string;
};

export class LinePushError extends Error {
  constructor(readonly category: "configuration" | "recipient" | "quota" | "media_fetch" | "timeout" | "provider") {
    super(category);
    this.name = "LinePushError";
  }
}

export async function pushLineMessages({
  fetcher,
  accessToken,
  recipientUserId,
  retryKey,
  messages,
  timeoutMs = 12_000,
}: {
  fetcher: Fetcher;
  accessToken: string;
  recipientUserId: string;
  retryKey: string;
  messages: LineMessage[];
  timeoutMs?: number;
}): Promise<{ status: "sent" }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetcher("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Line-Retry-Key": retryKey,
      },
      body: JSON.stringify({ to: recipientUserId, messages }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new LinePushError("timeout");
    }
    throw new LinePushError("provider");
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 401 || response.status === 403) {
    throw new LinePushError("configuration");
  }

  if (response.status === 409 && response.headers.get("x-line-accepted-request-id")) {
    return { status: "sent" };
  }

  if (response.status === 429) throw new LinePushError("quota");
  if (response.status === 400) {
    const detail = (await response.text()).toLowerCase();
    if (/user|recipient|block|friend/.test(detail)) throw new LinePushError("recipient");
    if (/fetch|download|image|video|content url/.test(detail)) throw new LinePushError("media_fetch");
  }
  if (!response.ok) throw new LinePushError("provider");

  return { status: "sent" };
}
