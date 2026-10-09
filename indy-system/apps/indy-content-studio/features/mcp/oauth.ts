import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { getAdminActor } from "../auth/server/admin-session";
import { mcpOrigin, readToken, signToken } from "./oauth-crypto";

export interface OAuthGrant {
  clientId: string; resource: string; scope: string;
  redirectUri?: string; challenge?: string;
}
export type OAuthCodeBinding = Pick<OAuthGrant, "clientId" | "resource" | "redirectUri" | "challenge"> & { scope?: string };
export interface OAuthGrantStore {
  saveCode(key: string, grant: OAuthGrant, expires: number): Promise<void>;
  consumeCode(key: string, binding: OAuthCodeBinding): Promise<OAuthGrant | null>;
  saveRefresh(key: string, grant: OAuthGrant, expires: number): Promise<void>;
  rotateRefresh(key: string, clientId: string, resource: string, nextKey: string, expires: number, scope?: string): Promise<OAuthGrant | null>;
  revokeRefresh(key: string, clientId: string): Promise<void>;
}
export interface McpAccessToken { sub: string; clientId: string; scope: string; aud: string; exp: number }

const scopes = ["dashboard:read", "dashboard:write"];
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const opaque = () => randomBytes(32).toString("base64url");
const noStore = { "Cache-Control": "no-store", Pragma: "no-cache" };

class OAuthError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) { super(message); }
}

function json(data: unknown, status = 200): Response { return Response.json(data, { status, headers: noStore }); }
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
function parseScope(value = "dashboard:read"): string {
  const requested = [...new Set(value.trim().split(/\s+/))];
  if (requested.length === 0 || requested.some((s) => !scopes.includes(s))) throw new OAuthError("invalid_scope", "Unsupported dashboard scope");
  return scopes.filter((s) => requested.includes(s)).join(" ");
}
function allowedRedirect(value: string): boolean {
  const allowed = ["https://chatgpt.com/connector_platform_oauth_redirect",
    ...(process.env.MCP_ALLOWED_REDIRECT_URIS ?? "").split(",").map((v) => v.trim()).filter(Boolean)];
  return allowed.includes(value);
}
async function readBody(request: Request): Promise<string> {
  if (Number(request.headers.get("content-length")) > 16384) throw new OAuthError("invalid_request", "Request is too large", 413);
  const reader = request.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder(); let size = 0; let text = "";
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > 16384) { await reader.cancel(); throw new OAuthError("invalid_request", "Request is too large", 413); }
      text += decoder.decode(part.value, { stream: true });
    }
    return text + decoder.decode();
  } finally { reader.releaseLock(); }
}
function uniqueParams(params: URLSearchParams): Record<string, string> {
  for (const key of params.keys()) if (params.getAll(key).length !== 1) throw new OAuthError("invalid_request", "Duplicate request parameter");
  return Object.fromEntries(params);
}
const authorizeSchema = z.object({
  client_id: z.string().min(1).max(10000), redirect_uri: z.string().url().max(2000),
  response_type: z.literal("code"), code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  code_challenge_method: z.literal("S256"), resource: z.string().url(),
  state: z.string().max(2000).optional(), scope: z.string().max(100).optional(),
  decision: z.enum(["allow", "deny"]).optional(),
});

export class McpOAuth {
  constructor(private readonly store: OAuthGrantStore) {}

  metadata() {
    const issuer = mcpOrigin();
    return { issuer, authorization_endpoint: issuer + "/oauth/authorize", token_endpoint: issuer + "/oauth/token",
      registration_endpoint: issuer + "/oauth/register", revocation_endpoint: issuer + "/oauth/revoke",
      response_types_supported: ["code"], grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: ["none"], code_challenge_methods_supported: ["S256"],
      authorization_response_iss_parameter_supported: true, scopes_supported: scopes };
  }

  resourceMetadata() {
    const issuer = mcpOrigin();
    return { resource: issuer + "/mcp", authorization_servers: [issuer], scopes_supported: scopes,
      bearer_methods_supported: ["header"], resource_name: "Indy Dashboard Calendar" };
  }

  private async safe(work: () => Promise<Response>): Promise<Response> {
    try { return await work(); }
    catch (error) {
      if (error instanceof OAuthError) return json({ error: error.code, error_description: error.message }, error.status);
      if (error instanceof z.ZodError || error instanceof SyntaxError) return json({ error: "invalid_request", error_description: "Invalid OAuth request" }, 400);
      console.error("[mcp-oauth] Request failed", error instanceof Error ? error.name : "UnknownError");
      return json({ error: "server_error", error_description: "MCP authorization is not configured or temporarily unavailable" }, 503);
    }
  }

  private client(clientId: string) {
    const token = readToken(clientId, "client");
    if (!token || token.iss !== mcpOrigin() || !Array.isArray(token.redirect_uris)
      || !token.redirect_uris.every((uri) => typeof uri === "string" && allowedRedirect(uri))) {
      throw new OAuthError("invalid_client", "Unknown OAuth client");
    }
    return token as { client_name: string; redirect_uris: string[] };
  }

  register(request: Request): Promise<Response> {
    return this.safe(async () => {
      const input = z.object({ redirect_uris: z.array(z.string().url().max(2000)).min(1).max(4),
        client_name: z.string().max(120).default("ChatGPT"),
        token_endpoint_auth_method: z.literal("none").optional(),
        grant_types: z.array(z.enum(["authorization_code", "refresh_token"])).optional(),
        response_types: z.array(z.literal("code")).optional(),
      }).parse(JSON.parse(await readBody(request)));
      if (!input.redirect_uris.every(allowedRedirect)) throw new OAuthError("invalid_redirect_uri", "Redirect URI is not allowlisted");
      const clientId = signToken({ kind: "client", iss: mcpOrigin(), jti: randomUUID(),
        client_name: input.client_name, redirect_uris: input.redirect_uris });
      return json({ client_id: clientId, client_id_issued_at: Math.floor(Date.now() / 1000),
        client_name: input.client_name, redirect_uris: input.redirect_uris, token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] }, 201);
    });
  }

  private authorization(params: URLSearchParams) {
    const args = authorizeSchema.parse(uniqueParams(params));
    const client = this.client(args.client_id);
    if (!client.redirect_uris.includes(args.redirect_uri)) throw new OAuthError("invalid_request", "Redirect URI does not match client");
    if (args.resource !== mcpOrigin() + "/mcp") throw new OAuthError("invalid_target", "Wrong protected resource");
    const scope = parseScope(args.scope);
    return { args, client, scope };
  }

  authorize(request: Request): Promise<Response> {
    return this.safe(async () => {
      const params = new URL(request.url).searchParams;
      const { args, client, scope } = this.authorization(params);
      if (!await getAdminActor(request)) {
        const next = "/oauth/authorize?" + params.toString();
        return new Response(null, { status: 303, headers: { ...noStore, Location: mcpOrigin() + "/login?next=" + encodeURIComponent(next) } });
      }
      const hidden = Object.entries({ ...args, scope }).filter(([key, value]) => key !== "decision" && value !== undefined)
        .map(([key, value]) => '<input type="hidden" name="' + escapeHtml(key) + '" value="' + escapeHtml(value!) + '">').join("");
      const permission = scope.includes("dashboard:write") ? "ดูข้อมูล สร้างคอนเทนต์ แก้ไข และจัดตารางในแดชบอร์ด" : "ดูข้อมูลและปฏิทินในแดชบอร์ด";
      const html = '<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        + '<title>เชื่อมต่อ Indy Dashboard</title><body><main><h1>เชื่อมต่อแดชบอร์ดกับ ' + escapeHtml(client.client_name) + '</h1>'
        + '<p>ปลั๊กอินนี้ขอสิทธิ์ ' + permission + '</p><p>ใช้ข้อมูลในพื้นที่หลักของผู้ดูแล</p>'
        + '<form method="post" action="/oauth/authorize">' + hidden
        + '<button type="submit" name="decision" value="allow">อนุญาตการเชื่อมต่อ</button> '
        + '<button type="submit" name="decision" value="deny">ยกเลิก</button></form></main></body></html>';
      return new Response(html, { headers: { ...noStore, "Content-Type": "text/html; charset=utf-8",
        // Chromium also applies form-action to the POST's 303 callback redirect.
        // authorization() has already checked this redirect against the registered allowlist.
        "Content-Security-Policy": "default-src 'none'; form-action 'self' " + new URL(args.redirect_uri).origin + "; frame-ancestors 'none'; base-uri 'none'",
        // no-referrer makes Chromium send Origin: null for this form POST.
        // Keep the same-origin consent check while withholding cross-origin referrers.
        "X-Frame-Options": "DENY", "Referrer-Policy": "same-origin" } });
    });
  }

  approve(request: Request): Promise<Response> {
    return this.safe(async () => {
      if (!await getAdminActor(request)) throw new OAuthError("access_denied", "Administrator login required", 401);
      if (request.headers.get("origin") !== mcpOrigin()) throw new OAuthError("access_denied", "Invalid consent origin", 403);
      const { args, scope } = this.authorization(new URLSearchParams(await readBody(request)));
      const location = new URL(args.redirect_uri);
      location.searchParams.set("iss", mcpOrigin());
      if (args.state !== undefined) location.searchParams.set("state", args.state);
      if (args.decision === "deny") location.searchParams.set("error", "access_denied");
      else {
        const code = opaque();
        await this.store.saveCode(hash(code), { clientId: args.client_id, redirectUri: args.redirect_uri,
          challenge: args.code_challenge, scope, resource: args.resource }, Date.now() + 5 * 60 * 1000);
        location.searchParams.set("code", code);
      }
      return new Response(null, { status: 303, headers: { ...noStore, Location: location.toString() } });
    });
  }

  token(request: Request): Promise<Response> {
    return this.safe(async () => {
      const params = uniqueParams(new URLSearchParams(await readBody(request)));
      this.client(params.client_id ?? "");
      if (params.resource !== mcpOrigin() + "/mcp") throw new OAuthError("invalid_target", "Wrong protected resource");
      const requestedScope = params.scope === undefined ? undefined : parseScope(params.scope);
      let grant: OAuthGrant | null;
      let refreshToken: string;
      if (params.grant_type === "authorization_code") {
        if (!/^[A-Za-z0-9._~-]{43,128}$/.test(params.code_verifier ?? "") || !/^[A-Za-z0-9_-]{43}$/.test(params.code ?? "")) {
          throw new OAuthError("invalid_grant", "Invalid authorization code or PKCE verifier");
        }
        grant = await this.store.consumeCode(hash(params.code), { clientId: params.client_id, resource: params.resource,
          redirectUri: params.redirect_uri, challenge: createHash("sha256").update(params.code_verifier).digest("base64url"),
          ...(requestedScope ? { scope: requestedScope } : {}) });
        if (!grant) throw new OAuthError("invalid_grant", "Code expired, used, or does not match this request");
        refreshToken = opaque();
        await this.store.saveRefresh(hash(refreshToken), { clientId: grant.clientId, resource: grant.resource, scope: grant.scope }, Date.now() + 30 * 86400000);
      } else if (params.grant_type === "refresh_token") {
        if (!/^[A-Za-z0-9_-]{43}$/.test(params.refresh_token ?? "")) throw new OAuthError("invalid_grant", "Invalid refresh token");
        refreshToken = opaque();
        grant = await this.store.rotateRefresh(hash(params.refresh_token), params.client_id, params.resource, hash(refreshToken), Date.now() + 30 * 86400000, requestedScope);
        if (!grant) throw new OAuthError("invalid_grant", "Refresh token expired, used, or belongs to a different client");
      } else throw new OAuthError("unsupported_grant_type", "Unsupported OAuth grant type");
      const now = Math.floor(Date.now() / 1000);
      const accessToken = signToken({ kind: "access", iss: mcpOrigin(), aud: grant.resource, sub: "primary-admin",
        clientId: grant.clientId, scope: grant.scope, iat: now, exp: now + 3600, jti: randomUUID() });
      return json({ access_token: accessToken, token_type: "Bearer", expires_in: 3600, refresh_token: refreshToken, scope: grant.scope });
    });
  }

  verifyAccessToken(token: string): McpAccessToken | null {
    const payload = readToken(token, "access");
    if (!payload || payload.iss !== mcpOrigin() || payload.aud !== mcpOrigin() + "/mcp"
      || payload.sub !== "primary-admin" || typeof payload.clientId !== "string" || typeof payload.scope !== "string"
      || !Number.isSafeInteger(payload.exp)) return null;
    try { parseScope(payload.scope); } catch { return null; }
    return payload as unknown as McpAccessToken;
  }

  revoke(request: Request): Promise<Response> {
    return this.safe(async () => {
      const params = uniqueParams(new URLSearchParams(await readBody(request)));
      this.client(params.client_id ?? "");
      if (params.token) await this.store.revokeRefresh(hash(params.token), params.client_id);
      return json({});
    });
  }
}
