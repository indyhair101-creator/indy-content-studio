import { scryptSync } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as login } from "../app/api/auth/login/route";
import { POST as logout } from "../app/api/auth/logout/route";
import { createMediaUploadAuthorizer } from "../features/media/server/media-upload-authorization";
import { middleware } from "../middleware";

const password = "correct horse battery staple";
const secret = "a-test-only-secret-that-is-at-least-32-bytes-long";
const uploadToken = "a-test-only-upload-token";
const salt = Buffer.from("indy-test-salt-01").toString("base64url");
const passwordHash = `scrypt$${salt}$${scryptSync(password, Buffer.from(salt, "base64url"), 64).toString("base64url")}`;

function setCookieHeaders(response: Response): string[] {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  return headers.getSetCookie?.() ?? [response.headers.get("set-cookie") ?? ""].filter(Boolean);
}

function authRequest(url: string, method = "GET", cookie?: string): NextRequest {
  return new NextRequest(url, {
    method,
    headers: cookie ? { cookie } : undefined,
  });
}

async function loginSetCookie(): Promise<string> {
  const response = await login(new Request("https://indy.test/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  }));
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) throw new Error("Login did not set a session cookie");
  return setCookie;
}

async function loggedInCookie(): Promise<string> {
  return (await loginSetCookie()).split(";")[0];
}

describe("single-admin authentication boundary", () => {
  beforeEach(() => {
    vi.stubEnv("AUTH_SECRET", secret);
    vi.stubEnv("INDY_ADMIN_PASSWORD_HASH", passwordHash);
    vi.stubEnv("INDY_MEDIA_UPLOAD_TOKEN", uploadToken);
    vi.setSystemTime(new Date("2026-09-22T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("authenticates the configured password and gates private dashboard reads", async () => {
    const setCookie = await loginSetCookie();
    const cookie = setCookie.split(";")[0];
    expect(cookie).toContain("indy_admin_session=");
    expect(setCookie).toMatch(/; HttpOnly/i);
    expect(setCookie).toMatch(/; Secure/i);
    expect(setCookie).toMatch(/; SameSite=Lax/i);
    expect((await middleware(authRequest("https://indy.test/api/dashboard-state", "GET", cookie))).status).toBe(200);
  });

  it("provisions the authenticated browser with the secure cookie required for media uploads", async () => {
    const response = await login(new Request("https://indy.test/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    }));
    const uploadCookie = setCookieHeaders(response).find((cookie) => cookie.startsWith("indy_media_upload_token="));

    expect(uploadCookie).toContain(`indy_media_upload_token=${uploadToken}; Path=/api/media/upload`);
    expect(uploadCookie).toMatch(/; HttpOnly/i);
    expect(uploadCookie).toMatch(/; Secure/i);
    expect(uploadCookie).toMatch(/; SameSite=Strict/i);

    const cookiePair = uploadCookie!.split(";")[0];
    const authorizeUpload = createMediaUploadAuthorizer({ INDY_MEDIA_UPLOAD_TOKEN: uploadToken });
    expect(await authorizeUpload(new Request("https://indy.test/api/media/upload", {
      method: "POST",
      headers: { cookie: cookiePair },
    }))).toEqual({ authorized: true });
  });

  it("rejects an incorrect password without issuing a session", async () => {
    const response = await login(new Request("https://indy.test/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "not-the-password" }),
    }));
    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("creates a usable scrypt hash from stdin without echoing the password", async () => {
    const script = resolve(process.cwd(), "scripts/hash-admin-password.mjs");
    const result = spawnSync(process.execPath, [script], { input: password, encoding: "utf8" });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout.trim()).toMatch(/^scrypt\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
    expect(result.stdout).not.toContain(password);
  });

  it("rejects tampered and expired session cookies", async () => {
    const cookie = await loggedInCookie();
    const [name, value] = cookie.split("=");
    const [payload, signature] = value.split(".");
    const changedSignature = `${signature[0] === "a" ? "b" : "a"}${signature.slice(1)}`;
    const tampered = `${name}=${payload}.${changedSignature}`;
    expect((await middleware(authRequest("https://indy.test/api/dashboard-state", "GET", tampered))).status).toBe(401);

    vi.setSystemTime(new Date("2026-09-23T04:01:00.000Z"));
    expect((await middleware(authRequest("https://indy.test/api/dashboard-state", "GET", cookie))).status).toBe(401);
  });

  it("clears the session cookie on logout", async () => {
    const response = await logout();
    expect(response.status).toBe(200);
    const cookies = setCookieHeaders(response);
    expect(cookies.some((cookie) => cookie.startsWith("indy_admin_session=") && /Max-Age=0/.test(cookie) && /HttpOnly/i.test(cookie))).toBe(true);
    expect(cookies.some((cookie) => cookie.startsWith("indy_media_upload_token=") && /Path=\/api\/media\/upload/i.test(cookie) && /Max-Age=0/.test(cookie) && /HttpOnly/i.test(cookie))).toBe(true);
  });

  it("blocks unauthenticated state mutations and media uploads", async () => {
    const state = await middleware(authRequest("https://indy.test/api/dashboard-state", "PUT"));
    const upload = await middleware(authRequest("https://indy.test/api/media/upload", "POST"));
    expect(state.status).toBe(401);
    expect(upload.status).toBe(401);
    await expect(state.json()).resolves.toEqual({ error: "unauthorized" });
  });

  it("keeps only the signed webhook and signed media GET public", async () => {
    expect((await middleware(authRequest("https://indy.test/api/make/publications/result", "POST"))).status).toBe(200);
    expect((await middleware(authRequest("https://indy.test/api/make/publications", "POST"))).status).toBe(401);
    expect((await middleware(authRequest("https://indy.test/api/make/publications/result", "GET"))).status).toBe(401);
    expect((await middleware(authRequest("https://indy.test/api/line/webhook", "POST"))).status).toBe(200);
    expect((await middleware(authRequest("https://indy.test/api/media/provider/file-1?expires=1&signature=x"))).status).toBe(200);
    expect((await middleware(authRequest("https://indy.test/api/media/provider/file-1", "POST"))).status).toBe(401);
  });
});
