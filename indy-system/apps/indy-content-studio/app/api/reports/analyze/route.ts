import { createReportAnalysisHandler } from "../../../../features/reports/server/report-analysis-handler";
export const runtime = "nodejs";
export const maxDuration = 60;
export const POST = createReportAnalysisHandler();
