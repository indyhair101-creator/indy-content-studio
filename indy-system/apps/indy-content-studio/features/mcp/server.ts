import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { DashboardMcpService, DashboardToolError } from "./dashboard-service";
import type { McpAccessToken } from "./oauth";
import { mcpOrigin } from "./oauth-crypto";
import { calendarSchema, contentIdSchema, createContentSchema, listContentSchema, scheduleSchema, unscheduleSchema, updateContentSchema } from "./schemas";

export function authChallenge(scope = "dashboard:read", error = "invalid_token"): string {
  return 'Bearer resource_metadata="' + mcpOrigin() + '/.well-known/oauth-protected-resource", scope="'
    + scope + '", error="' + error + '", error_description="Connect your dashboard account to continue"';
}

export function createDashboardMcpServer(service: DashboardMcpService, access: McpAccessToken) {
  const server = new McpServer({ name: "indy-dashboard-calendar", version: "1.0.0" }, {
    instructions: "Manage the existing Indy dashboard calendar. Call get_dashboard_config for timezone and category/format IDs. "
      + "Times use local YYYY-MM-DDTHH:mm in that timezone. Read existing contents before changing them. "
      + "Generate a UUID request_id once per new content and reuse it on retries. Scheduling records a plan; it does not publish. "
      + "Ask for a specific date/time when the user's intent is ambiguous. Never claim publication, approval or external delivery from a schedule change.",
  });

  const entries = [
    { name: "get_dashboard_config", title: "ข้อมูลแดชบอร์ด", description: "Get timezone, categories and formats before creating content or scheduling.",
      schema: z.object({}).strict(), read: true, run: () => service.getConfig() },
    { name: "list_content", title: "ค้นหาคอนเทนต์", description: "Search active contents by title, owner or notes. Results are paginated; excludes trash.",
      schema: listContentSchema, read: true, run: (args: unknown) => service.listContent(args) },
    { name: "get_content", title: "ดูคอนเทนต์", description: "Read one active content item and its schedules using its content_id.",
      schema: contentIdSchema, read: true, run: (args: unknown) => service.getContent(args) },
    { name: "get_calendar", title: "ดูปฏิทิน", description: "Read the dashboard's posting calendar for YYYY-MM and its unscheduled content.",
      schema: calendarSchema, read: true, run: (args: unknown) => service.getCalendar(args) },
    { name: "create_content", title: "สร้างคอนเทนต์", description: "Create a content draft in the existing dashboard. Use category/format IDs from get_dashboard_config and a stable UUID request_id.",
      schema: createContentSchema, read: false, run: (args: unknown) => service.createContent(args) },
    { name: "update_content", title: "แก้ไขคอนเทนต์", description: "Update title, owner, notes, caption or planned work time. Caption edits reset review approval. Use explicit content_id.",
      schema: updateContentSchema, read: false, run: (args: unknown) => service.updateContent(args) },
    { name: "schedule_content", title: "กำหนดหรือเลื่อนตาราง", description: "Set or move a platform's publish plan in the dashboard, in its configured timezone. Saves a calendar plan; does not queue or publish a post.",
      schema: scheduleSchema, read: false, run: (args: unknown) => service.scheduleContent(args) },
    { name: "unschedule_content", title: "ยกเลิกตาราง", description: "Remove a platform's posting plan. Does not delete the content or cancel external publication jobs.",
      schema: unscheduleSchema, read: false, run: (args: unknown) => service.unscheduleContent(args) },
    { name: "delete_content", title: "ย้ายไปถังขยะ", description: "Move an explicitly selected content item to the dashboard trash. Can be restored from the dashboard. Refuses active publication jobs.",
      schema: contentIdSchema, read: false, run: (args: unknown) => service.deleteContent(args) },
  ];

  for (const tool of entries) {
    const requiredScope = tool.read ? "dashboard:read" : "dashboard:write";
    server.registerTool(tool.name, {
      title: tool.title, description: tool.description, inputSchema: tool.schema,
      annotations: { readOnlyHint: tool.read, destructiveHint: !tool.read && tool.name !== "create_content",
        idempotentHint: tool.read || ["create_content", "schedule_content", "unschedule_content"].includes(tool.name), openWorldHint: false },
      _meta: { securitySchemes: [{ type: "oauth2", scopes: [requiredScope] }] },
    }, async (args: unknown): Promise<CallToolResult> => {
      if (!access.scope.split(" ").includes(requiredScope)) {
        return { isError: true, content: [{ type: "text", text: "ต้องอนุญาตสิทธิ์ " + requiredScope + " ก่อนเรียกเครื่องมือนี้" }],
          _meta: { "mcp/www_authenticate": [authChallenge(requiredScope, "insufficient_scope")] } };
      }
      try {
        const result = await tool.run(args);
        return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
      } catch (error) {
        const message = error instanceof DashboardToolError ? error.message
          : error instanceof z.ZodError ? "ข้อมูลไม่ถูกต้อง: " + error.issues.map((issue) => issue.message).join("; ")
          : "โหลดหรือบันทึกข้อมูลไม่สำเร็จ กรุณาลองใหม่";
        return { isError: true, content: [{ type: "text", text: message }] };
      }
    });
  }
  return server;
}
