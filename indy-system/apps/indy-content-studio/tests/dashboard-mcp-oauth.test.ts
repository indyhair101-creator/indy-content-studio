// @vitest-environment node
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAdminSessionToken, ADMIN_SESSION_COOKIE } from "../features/auth/server/admin-session";
import { McpOAuth, type OAuthGrantStore, type OAuthGrant } from "../features/mcp/oauth";

const origin = "https://indy.test";
const redirect = "https://chatgpt.com/connector_platform_oauth_redirect";
const verifier = "a".repeat(64);
const challenge = createHash("sha256").update(verifier).digest("base64url");

function store(): OAuthGrantStore {
  const codes = new Map<string, { grant: OAuthGrant; expires: number }>();
  const refresh = new Map<string, { grant: OAuthGrant; expires: number }>();
  return {
    saveCode: async (key, grant, expires) => { codes.set(key, { grant, expires }); },
    consumeCode: async (key, binding) => {
      const row = codes.get(key);
      if (!row || row.expires <= Date.now() || Object.entries(binding).some(([k, v]) => v !== undefined && row.grant[k as keyof OAuthGrant] !== v)) return null;
      codes.delete(key); return row.grant;
    },
    saveRefresh: async (key, grant, expires) => { refresh.set(key, { grant, expires }); },
    rotateRefresh: async (key, clientId, resource, nextKey, expires, scope) => {
      const row = refresh.get(key);
      if (!row || row.expires <= Date.now() || row.grant.clientId !== clientId || row.grant.resource !== resource
        || (scope !== undefined && row.grant.scope !== scope)) return null;
      refresh.delete(key); refresh.set(nextKey, { grant: row.grant, expires }); return row.grant;
    },
    revokeRefresh: async (key, clientId) => { if (refresh.get(key)?.grant.clientId === clientId) refresh.delete(key); },
  };
}

function form(path: string, values: Record<string, string>, extra: HeadersInit = {}) {
  return new Request(origin + path, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", ...extra },
    body: new URLSearchParams(values) });
}

describe("MCP OAuth authorization", () => {
  let oauth: McpOAuth;
  beforeEach(() => {
    vi.stubEnv("MCP_PUBLIC_URL", origin);
    vi.stubEnv("MCP_OAUTH_SECRET", "test-mcp-signing-secret-at-least-32-characters");
    vi.stubEnv("AUTH_SECRET", "test-admin-secret-at-least-32-characters");
    oauth = new McpOAuth(store());
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

  async function client() {
    const response = await oauth.register(new Request(origin + "/oauth/register", { method: "POST",
      headers: { "content-type": "application/json" }, body: JSON.stringify({ redirect_uris: [redirect], client_name: "ChatGPT" }) }));
    expect(response.status).toBe(201);
    return (await response.json()).client_id as string;
  }

  async function code(scope = "dashboard:read dashboard:write") {
    const clientId = await client();
    const params = { client_id: clientId, redirect_uri: redirect, response_type: "code", state: "opaque-state",
      code_challenge: challenge, code_challenge_method: "S256", scope, resource: origin + "/mcp" };
    const cookie = ADMIN_SESSION_COOKIE + "=" + await createAdminSessionToken(process.env.AUTH_SECRET!);
    const page = await oauth.authorize(new Request(origin + "/oauth/authorize?" + new URLSearchParams(params), { headers: { cookie } }));
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("อนุญาต");
    const granted = await oauth.approve(form("/oauth/authorize", params, { cookie, origin }));
    expect(granted.status).toBe(303);
    const location = new URL(granted.headers.get("location")!);
    expect(location.searchParams.get("state")).toBe("opaque-state");
    expect(location.searchParams.get("iss")).toBe(origin);
    return { clientId, code: location.searchParams.get("code")!, params, cookie };
  }

  it("advertises PKCE, DCR and the exact protected resource", () => {
    expect(oauth.metadata()).toMatchObject({ issuer: origin, code_challenge_methods_supported: ["S256"],
      registration_endpoint: origin + "/oauth/register" });
    expect(oauth.resourceMetadata()).toMatchObject({ resource: origin + "/mcp", authorization_servers: [origin] });
  });

  it.skipIf(!process.env.MCP_BROWSER_MODULE)("submits the real consent form in Chromium and exchanges its authorization code", async () => {
    // This catches policies that turn a browser form POST's Origin into null.
    // Unit requests with a manually supplied Origin cannot detect that failure.
    const { chromium } = createRequire(import.meta.url)(process.env.MCP_BROWSER_MODULE!);
    const browser = await chromium.launch({ headless: true,
      ...(process.env.MCP_BROWSER_EXECUTABLE ? { executablePath: process.env.MCP_BROWSER_EXECUTABLE } : {}) });
    try {
      const context = await browser.newContext();
      await context.addCookies([{ name: ADMIN_SESSION_COOKIE, value: await createAdminSessionToken(process.env.AUTH_SECRET!),
        domain: "indy.test", path: "/", secure: true, httpOnly: true, sameSite: "Lax" }]);
      const clientId = await client();
      const params = { client_id: clientId, redirect_uri: redirect, response_type: "code", state: "browser-state",
        code_challenge: challenge, code_challenge_method: "S256", scope: "dashboard:read", resource: origin + "/mcp" };
      const page = await context.newPage();
      page.on("console", (message: any) => {
        if (message.text().includes("form-action")) console.log("Browser blocked OAuth redirect: form-action CSP");
      });
      let submittedOrigin: string | undefined;
      let approvalStatus: number | undefined;
      let callbackUrl: string | undefined;
      await page.route(origin + "/oauth/authorize**", async (route: any) => {
        const browserRequest = route.request();
        const headers = await browserRequest.allHeaders();
        const post = browserRequest.method() === "POST";
        const request = new Request(browserRequest.url(), { method: browserRequest.method(), headers,
          ...(post ? { body: browserRequest.postData() } : {}) });
        const response = await (post ? oauth.approve(request) : oauth.authorize(request));
        if (post) { submittedOrigin = headers.origin; approvalStatus = response.status; callbackUrl = response.headers.get("location") ?? undefined; }
        await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
      });
      // Consume the callback locally; never send test grants to ChatGPT.
      await page.route(redirect + "**", (route: any) => route.fulfill({ status: 200, body: "OAuth callback received" }));
      await page.goto(origin + "/oauth/authorize?" + new URLSearchParams(params));
      await page.getByRole("button", { name: "อนุญาตการเชื่อมต่อ" }).click({ noWaitAfter: true });
      await expect.poll(() => approvalStatus).toBe(303);
      expect({ submittedOrigin, approvalStatus }).toEqual({ submittedOrigin: origin, approvalStatus: 303 });
      await page.waitForURL(redirect + "**", { timeout: 5000 });
      const callback = new URL(callbackUrl!);
      expect(callback.searchParams.get("state")).toBe("browser-state");
      const token = await oauth.token(form("/oauth/token", { grant_type: "authorization_code", client_id: clientId,
        code: callback.searchParams.get("code")!, code_verifier: verifier, redirect_uri: redirect, resource: origin + "/mcp" }));
      expect(token.status).toBe(200);
      expect(oauth.verifyAccessToken((await token.json()).access_token)?.scope).toBe("dashboard:read");
    } finally { await browser.close(); }
  }, 30000);

  it.each(["null", "", "https://evil.test"])("rejects consent from an untrusted Origin: %s", async (untrustedOrigin) => {
    const grant = await code();
    const response = await oauth.approve(form("/oauth/authorize", { ...grant.params, decision: "allow" },
      { cookie: grant.cookie, ...(untrustedOrigin ? { origin: untrustedOrigin } : {}) }));
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("access_denied");
  });

  it("requires login and consent, rejecting redirect abuse and cross-origin approval", async () => {
    const clientId = await client();
    const response = await oauth.authorize(new Request(origin + "/oauth/authorize?" + new URLSearchParams({
      client_id: clientId, redirect_uri: redirect, response_type: "code", resource: origin + "/mcp",
      code_challenge: challenge, code_challenge_method: "S256" })));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("/login?next=");
    const bad = await oauth.register(new Request(origin + "/oauth/register", { method: "POST",
      headers: { "content-type": "application/json" }, body: JSON.stringify({ redirect_uris: ["https://evil.test/steal"] }) }));
    expect(bad.status).toBe(400);
    const good = await code();
    expect((await oauth.approve(form("/oauth/authorize", good.params, { cookie: good.cookie, origin: "https://evil.test" }))).status).toBe(403);
    expect((await oauth.approve(form("/oauth/authorize", good.params, { origin }))).status).toBe(401);
  });

  it("binds one-use codes to PKCE, client, resource and redirect; rotates refresh tokens", async () => {
    const grant = await code();
    const args = { grant_type: "authorization_code", client_id: grant.clientId, code: grant.code,
      code_verifier: verifier, redirect_uri: redirect, resource: origin + "/mcp" };
    expect((await oauth.token(form("/oauth/token", { ...args, code_verifier: "b".repeat(64) }))).status).toBe(400);
    expect((await oauth.token(form("/oauth/token", { ...args, resource: "https://evil.test/mcp" }))).status).toBe(400);
    const response = await oauth.token(form("/oauth/token", args));
    expect(response.status).toBe(200);
    const tokens = await response.json();
    expect(oauth.verifyAccessToken(tokens.access_token)?.scope).toBe("dashboard:read dashboard:write");
    expect((await oauth.token(form("/oauth/token", args))).status).toBe(400);
    const refreshArgs = { grant_type: "refresh_token", client_id: grant.clientId, refresh_token: tokens.refresh_token, resource: origin + "/mcp" };
    const refreshed = await oauth.token(form("/oauth/token", refreshArgs));
    expect(refreshed.status).toBe(200);
    expect((await refreshed.json()).refresh_token).not.toBe(tokens.refresh_token);
    expect((await oauth.token(form("/oauth/token", refreshArgs))).status).toBe(400);
  });

  it("rejects tampered and expired access tokens and preserves read-only scope", async () => {
    const grant = await code("dashboard:read");
    const tokens = await (await oauth.token(form("/oauth/token", { grant_type: "authorization_code",
      client_id: grant.clientId, code: grant.code, code_verifier: verifier, redirect_uri: redirect, resource: origin + "/mcp" }))).json();
    expect(oauth.verifyAccessToken(tokens.access_token)?.scope).toBe("dashboard:read");
    expect(oauth.verifyAccessToken(tokens.access_token + "tampered")).toBeNull();
    vi.setSystemTime(Date.now() + 3601000);
    expect(oauth.verifyAccessToken(tokens.access_token)).toBeNull();
  });

  it("does not consume a valid code or rotate a refresh token when the requested scope is wrong", async () => {
    const grant = await code();
    const args = { grant_type: "authorization_code", client_id: grant.clientId, code: grant.code,
      code_verifier: verifier, redirect_uri: redirect, resource: origin + "/mcp" };
    expect((await oauth.token(form("/oauth/token", { ...args, scope: "dashboard:read" }))).status).toBe(400);
    const valid = await oauth.token(form("/oauth/token", args));
    expect(valid.status).toBe(200);
    const tokens = await valid.json();
    const refreshArgs = { grant_type: "refresh_token", client_id: grant.clientId, refresh_token: tokens.refresh_token, resource: origin + "/mcp" };
    expect((await oauth.token(form("/oauth/token", { ...refreshArgs, scope: "dashboard:read" }))).status).toBe(400);
    expect((await oauth.token(form("/oauth/token", refreshArgs))).status).toBe(200);
  });
});
