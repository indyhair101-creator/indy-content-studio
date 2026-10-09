import { z } from "zod";
import type { DashboardState } from "../domain/types";
import { copyContentAsNew } from "../content/content-commands";
import { reportFiltersSchema } from "./report-schema";

const text = z.string().min(1).max(4000);
const evidenceIds = z.array(z.string().min(1).max(500)).min(1).max(12);
const finding = z.object({ text, evidenceIds }).strict();
export const analysisRequestSchema = z.object({ kind: z.enum(["team", "content"]), filters: reportFiltersSchema, sourceContentId: z.string().min(1).max(300).optional() }).strict();
export type AnalysisRequest = z.infer<typeof analysisRequestSchema>;
export const reportSuggestionSchema = z.object({ id: z.string().min(1).max(200), sourceContentId: z.string().min(1).max(300), title: z.string().min(1).max(300), hook: text, script: text, caption: text, notes: text, evidenceIds }).strict();
export const reportAnalysisSchema = z.object({
  facts: z.array(finding).max(8), hypotheses: z.array(finding).max(8),
  experiments: z.array(z.object({ title: text, hypothesis: text, metric: text, target: text, durationDays: z.number().int().min(1).max(90), evidenceIds }).strict()).max(6),
  assignments: z.array(z.object({ taskId: z.string().min(1).max(300), owner: z.string().max(300), reason: text, evidenceIds }).strict()).max(10),
  suggestions: z.array(reportSuggestionSchema).max(6),
  limitations: z.array(text).max(10),
}).strict();
export type ReportAnalysis = z.infer<typeof reportAnalysisSchema>;
export type ReportSuggestion = z.infer<typeof reportSuggestionSchema>;
export interface AnalysisEvidence { id: string; contentId: string | null; entityId: string; label: string; data: Record<string, unknown> }
export interface ReportAnalysisResponse { analysis: ReportAnalysis; evidence: AnalysisEvidence[]; warnings: string[]; model: string; generatedAt: string }

export function validateAnalysisEvidence(value: unknown, evidence: AnalysisEvidence[]): ReportAnalysis {
  const analysis = reportAnalysisSchema.parse(value);
  const ids = new Set(evidence.map((item) => item.id));
  const allItems = [...analysis.facts, ...analysis.hypotheses, ...analysis.experiments, ...analysis.assignments, ...analysis.suggestions];
  if (allItems.some((item) => item.evidenceIds.some((id) => !ids.has(id)))) throw new Error("Analysis cited unselected evidence");
  for (const suggestion of analysis.suggestions) {
    if (!suggestion.evidenceIds.some((id) => evidence.some((item) => item.id === id && item.contentId === suggestion.sourceContentId))) throw new Error("Suggestion source is not cited");
  }
  if (new Set(analysis.suggestions.map((item) => item.id)).size !== analysis.suggestions.length) throw new Error("Duplicate suggestion IDs");
  for (const assignment of analysis.assignments) {
    if (!evidence.some((item) => item.entityId === assignment.taskId && assignment.evidenceIds.includes(item.id))) throw new Error("Assignment source is not cited");
    if (assignment.owner && !evidence.some((item) => item.data.owner === assignment.owner)) throw new Error("Assignment owner is not in selected evidence");
  }
  return analysis;
}

/** Called only by the explicit save-draft action. No schedules or review decisions survive. */
export function createReportSuggestionDraft(state: DashboardState, input: ReportSuggestion, id: string, now: string): DashboardState {
  const suggestion = reportSuggestionSchema.parse(input);
  if (!id || state.contents.some((item) => item.id === id)) throw new Error("รหัสงานร่างซ้ำ กรุณาลองใหม่");
  const source = state.contents.find((item) => item.id === suggestion.sourceContentId && !item.deletedAt);
  if (!source) throw new Error("ไม่พบคอนเทนต์ต้นทาง กรุณาวิเคราะห์ใหม่");
  const draft = copyContentAsNew(source, id, now);
  return { ...state, contents: [...state.contents, { ...draft, title: suggestion.title, caption: suggestion.caption,
    captionSource: null, plannedWorkAt: null, priority: "normal", owner: "",
    processSteps: draft.processSteps.map((step) => ({ ...step, scheduledDate: null })),
    notes: `ข้อเสนอ AI — ร่างสำหรับตรวจทาน\nประโยคเปิด: ${suggestion.hook}\nสคริปต์: ${suggestion.script}\n${suggestion.notes}\nอ้างอิง: ${suggestion.evidenceIds.join(", ")}`,
  }] };
}
