import { handleMcpRequest } from "../../features/mcp/http-handler";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export function POST(request: Request) { return handleMcpRequest(request); }
export function GET(request: Request) { return handleMcpRequest(request); }
export function DELETE(request: Request) { return handleMcpRequest(request); }
