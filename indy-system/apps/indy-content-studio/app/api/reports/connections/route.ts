import { reportConnections } from "../../../../features/reports/server/report-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) { return reportConnections(request); }
