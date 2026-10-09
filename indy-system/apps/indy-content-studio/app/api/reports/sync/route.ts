import { reportSync } from "../../../../features/reports/server/report-http";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) { return reportSync(request); }
