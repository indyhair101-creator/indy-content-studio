import { NextRequest, NextResponse } from "next/server";
import { getAdminActor } from "./features/auth/server/admin-session";

function isPublicRequest(pathname: string, method: string): boolean {
// These routes enforce their own OAuth/session checks; no private dashboard API is bypassed.
  if (pathname === "/mcp") return ["GET", "POST", "DELETE"].includes(method);
  if (["/.well-known/oauth-protected-resource", "/.well-known/oauth-authorization-server"].includes(pathname)) return method === "GET";
  if (pathname === "/oauth/authorize") return method === "GET" || method === "POST";
  if (["/oauth/register", "/oauth/token", "/oauth/revoke"].includes(pathname)) return method === "POST";
  if (pathname === "/login") return method === "GET" || method === "HEAD";
  if (pathname === "/api/ready") return method === "GET";
  if (pathname === "/api/auth/login" || pathname === "/api/auth/logout") return method === "POST";
  if (pathname === "/api/line/webhook") return method === "POST";
  // Machine endpoints enforce the scheduler token or a job-scoped HMAC in the route.
  if (pathname === "/api/make/publications/result" || pathname === "/api/make/publications/claim") return method === "POST";
  if (pathname === "/api/make/publications/due") return method === "GET";
  return method === "GET" && /^\/api\/media\/provider\/[^/]+$/.test(pathname);
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;
  if (isPublicRequest(pathname, request.method)) return NextResponse.next();
  if (await getAdminActor(request)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  loginUrl.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|assets/).*)"],
};
