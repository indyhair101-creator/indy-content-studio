import { createHmac, timingSafeEqual } from "node:crypto";

function secret(): string {
  const value = process.env.MCP_OAUTH_SECRET ?? "";
  if (Buffer.byteLength(value) < 32) throw new Error("MCP_OAUTH_SECRET must contain at least 32 bytes");
  return value;
}

export function signToken(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret()).update(header + "." + body).digest("base64url");
  return header + "." + body + "." + signature;
}

export function readToken(token: string, kind: string): Record<string, unknown> | null {
  try {
    if (token.length > 10000) return null;
    const parts = token.split(".");
    if (parts.length !== 3 || parts.some((p) => !/^[A-Za-z0-9_-]+$/.test(p))) return null;
    const expected = createHmac("sha256", secret()).update(parts[0] + "." + parts[1]).digest();
    const received = Buffer.from(parts[2], "base64url");
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString());
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    if (header.alg !== "HS256" || header.typ !== "JWT" || payload.kind !== kind) return null;
    if (payload.exp !== undefined && (!Number.isSafeInteger(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000))) return null;
    return payload;
  } catch { return null; }
}

export function mcpOrigin(): string {
  const value = process.env.MCP_PUBLIC_URL;
  if (!value) throw new Error("MCP_PUBLIC_URL is required");
  const url = new URL(value);
  const local = process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) || url.username || url.password
    || url.search || url.hash || url.pathname !== "/") throw new Error("MCP_PUBLIC_URL must be a canonical HTTPS origin");
  return url.origin;
}
