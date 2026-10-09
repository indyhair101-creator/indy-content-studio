# Report AI configuration and verification

Report analysis runs only when a signed-in administrator clicks **วิเคราะห์ด้วย AI**. Nothing generates on page load. It uses server-loaded dashboard evidence, never client-supplied metrics, and does not modify work assignments or publish content.

Server configuration:

- `OPENAI_API_KEY`: existing server-only credential. Never place it in dashboard backups or browser variables.
- `REPORT_AI_MODEL`: required model ID selected by the operator, supporting the Responses API and strict Structured Outputs. There is deliberately no hidden default model.
- `AUTH_SECRET`: existing application session configuration.

`POST /api/reports/analyze` accepts `kind`, validated report `filters`, and optional `sourceContentId`. It requires the administrator session and same-origin `Origin`. Evidence is bounded to 60 selected records and 160,000 serialized characters; output is bounded and the provider request times out after 45 seconds. The OpenAI response is requested with `store: false`. No credentials or provider error bodies are returned to the browser.

The response distinguishes facts, unverified hypotheses, experiments (metric, target, evaluation days), assignment proposals and content drafts. Every generated item cites selected evidence; unknown references and mismatched draft sources are rejected. The explicit save button copies a source into a new unassigned, unapproved draft, clears planned dates, step dates, publication schedules and publication evidence, and preserves no completion status. It never sends a publication request.

Content analysis uses matched posts only. Published-cohort analysis uses lifetime snapshots and labels their basis; activity analysis uses fully contained activity periods. Refreshed observations of the same period/traffic/post replace earlier samples for analysis. Warnings cover small samples, unknown traffic, missing retention and uncertain source timezone. Media analysis is limited to supplied captions/scripts and file metadata: the model does **not** see image/audio/video pixels in this implementation.

The request follows the official [Responses create reference](https://developers.openai.com/api/reference/resources/responses/methods/create) and [Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses), using `text.format` with `type: json_schema`, a name, strict schema, and local validation of output and evidence references.

Local tests use injected provider responses; they make no live model calls. A real configured model call and human review of Thai analytical quality remain required after explicit user action. Schema/citation validation cannot by itself prove every natural-language interpretation correct; the UI retains source evidence and uncertainty labels for review.
