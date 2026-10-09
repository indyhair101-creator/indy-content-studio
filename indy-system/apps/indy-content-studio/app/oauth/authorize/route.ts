import { mcpOAuth } from "../../../features/mcp/oauth-instance";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: Request) { return mcpOAuth.authorize(request); }
export function POST(request: Request) { return mcpOAuth.approve(request); }
