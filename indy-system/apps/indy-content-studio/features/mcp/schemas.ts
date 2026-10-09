import { z } from "zod";

function validDate(value: string): boolean {
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(validDate, "Invalid calendar date");
export const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  .refine((value) => validDate(value.slice(0, 10)) && Number(value.slice(11, 13)) < 24 && Number(value.slice(14)) < 60,
    "Use a real date and time as YYYY-MM-DDTHH:mm in the dashboard timezone");
const identifier = z.string().trim().min(1).max(200);
const title = z.string().trim().min(1).max(300);
export const platform = z.enum(["facebook", "instagram", "tiktok"]);
export const contentIdSchema = z.object({ content_id: identifier }).strict();
export const listContentSchema = z.object({
  query: z.string().max(200).optional(),
  limit: z.number().int().min(1).max(100).default(30),
  offset: z.number().int().min(0).max(100000).default(0),
}).strict();
export const calendarSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
}).strict();
export const createContentSchema = z.object({
  request_id: z.string().uuid().describe("Generate one UUID per creation; reuse it when retrying the same request."),
  title, category_id: identifier, format_id: identifier,
  owner: z.string().max(200).default(""),
  notes: z.string().max(10000).default(""),
  caption: z.string().max(20000).default(""),
  planned_work_at: localDateTime.optional(),
}).strict();
export const updateContentSchema = z.object({
  content_id: identifier, title: title.optional(),
  owner: z.string().max(200).optional(),
  notes: z.string().max(10000).optional(),
  caption: z.string().max(20000).optional(),
  planned_work_at: localDateTime.nullable().optional(),
}).strict().refine((v) => Object.keys(v).length > 1, "Provide at least one field to update");
export const scheduleSchema = z.object({
  content_id: identifier, platform,
  publish_at: localDateTime.describe("YYYY-MM-DDTHH:mm in the timezone returned by get_dashboard_config; scheduling only."),
}).strict();
export const unscheduleSchema = z.object({ content_id: identifier, platform }).strict();
