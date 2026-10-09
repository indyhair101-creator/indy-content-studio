import { mcpOAuth } from "../../../features/mcp/oauth-instance";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function POST(request: Request) { return mcpOAuth.token(request); }
