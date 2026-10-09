# Report design — approved scope

User authorized continuous step-by-step implementation on 2026-10-09, including worktree parallel development and maintaining the 68-item checklist. This instruction supersedes intermediate skill approval gates. No production publication is requested in this reporting turn.

## Scope and success
Two separate navigation pages: team work reports and content insights; dedicated video tab within insights. Preserve current Thai cream/sage UI. All 68 requirements are authoritative in ../../REPORT-CHECKLIST.md. Never claim an item complete on placeholders or mocked integration data.

## Architecture
Keep reporting domain separate under features/reports. Add backward-compatible optional report state to DashboardState with schema validation and backup handling. Report platforms include YouTube without changing publication Platform or publishing support. Providers are server-only, credentials never stored in dashboard snapshots. Typed observations carry metric, unit, source, period/lifetime scope, paid/organic/unknown traffic, fetchedAt, and compatible denominator. Missing is null, not zero. Date windows use Asia/Bangkok calendar dates, inclusive end date, previous equal-length period.

Team work derives content counts once per content, independent of social schedules; standalone ActionTasks are separate. Status history records actual observed transition time, source, owner, due date, and marks steps automatically closed through publication. Old completed work has unknown completion time, never inferred from updatedAt. Preserve history on imports and prevent duplicate capture. Persistence must cover UI, MCP, and server publication sync paths.

Insights group by content with separate platform results, filter by published cohort versus activity interval, require matched post identity, never deduplicate reach by adding unique audiences. Aggregated averages require compatible actual weights; otherwise unavailable. Fair rankings require matching channel, format, age and traffic class. Retention remains unavailable without supplied retention points.

AI separates evidence, hypotheses and experiments; cites selected records, no causation claims or invented retention. Actions save drafts only after click. Import supports validated portable normalized data with preview and source metadata. Reports save frozen inputs/filters for reproducibility; CSV safe for spreadsheets and printable PDF via browser initially.

## Delivery
First establish source baseline and reporting contracts; then parallel team, insight UI, provider worktrees. Integrate and verify; checkpoint checklist. API account permissions may require user login. Continue independent tasks, record live-dependent items pending. Test date boundaries, unknown data, weighted averages, uniqueness, history preservation, auth and source matching.

