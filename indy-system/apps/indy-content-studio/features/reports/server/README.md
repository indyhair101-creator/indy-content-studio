# Report providers

Credentials are read only on the server from explicit `REPORT_*` environment variables. Existing publication credentials are not silently reused. The browser receives normalized public metadata, counts, status, and configuration **names** only. No refresh tokens, access tokens, raw upstream errors, or token-bearing pagination URLs are returned or logged.

## Configuration

| Provider | Server environment | Granted access |
| --- | --- | --- |
| Facebook | `REPORT_META_GRAPH_VERSION`, `REPORT_FACEBOOK_PAGE_ID`, `REPORT_FACEBOOK_PAGE_TOKEN` | Page token with `pages_read_engagement` |
| Instagram via Facebook Login | `REPORT_META_GRAPH_VERSION`, `REPORT_INSTAGRAM_ACCOUNT_ID`, `REPORT_INSTAGRAM_ACCESS_TOKEN` | `instagram_basic`, `pages_read_engagement`, `instagram_manage_insights` and access to the professional account |
| YouTube | `REPORT_YOUTUBE_CHANNEL_ID`, `REPORT_YOUTUBE_ACCESS_TOKEN` | OAuth `youtube.readonly`, `yt-analytics.readonly` for the channel owner |
| TikTok | `REPORT_TIKTOK_OPEN_ID`, `REPORT_TIKTOK_ACCESS_TOKEN` | `user.info.basic`, `video.list` |

Choose a supported Graph version enabled for your Meta app, formatted `vNN.N`. There is no guessed default. This iteration does not implement account OAuth enrollment or automatic token renewal. An administrator must obtain/renew the token through the provider's approved OAuth flow and update server configuration, then use **ตรวจการเชื่อมต่อ / ตรวจใหม่**. Never enter credentials into dashboard state, import files, or chat.

## Semantics and bounds

- Both endpoints require the existing administrator session. Sync also rejects a foreign Origin. Responses are `private, no-store`.
- Each account is isolated: missing credentials, expired access, missing permissions, throttling, malformed responses, and timeouts produce sanitized statuses. Valid pages and basic counts survive later failures. No provider writes are made; TikTok's POST is its documented read-only video-list operation.
- Each sync reads at most 3 pages of 20 latest publications per account; 45-second provider budget and 12-second per-request timeout. `truncated` and warnings disclose an incomplete historical scan. Pagination follows cursors on fixed hosts only. Redirects are rejected. This is **not full historical backfill** and does not fetch every old video active in the range.
- FB returns comment/share counters only; no deprecated or unverified FB reach fields. IG requests basic like/comment counters, then lifetime reach/saved/shares/views where the media type and token support those fields. Failed media insights keep the basic counters.
- TikTok Display counters and YouTube Data counters are lifetime snapshots. YouTube Analytics requests the specified activity range for the bounded set of discovered videos, records `America/Los_Angeles`, and discloses Pacific calendar dates. They must not be treated as exact Bangkok-day totals.
- Traffic remains `unknown` for all adapters. No organic inference. Unique/reach values must not be summed across posts. Average watch duration is seconds; estimated YouTube minutes are converted to seconds; average percentage is not completion rate. No average weight or retention is invented.
- `availableMetrics` reflects values actually returned, including a legitimate zero; omitted fields remain missing. Empty account results cannot prove metric availability.
- Snapshots are captured on manual sync only. There is no scheduled collection yet. The panel preserves existing manual content mappings and all previous observations.

## Evidence checked 2026-10-09

- TikTok [v2 video list](https://developers.tiktok.com/doc/tiktok-api-v2-video-list/) and [video object](https://developers.tiktok.com/doc/tiktok-api-v2-video-object/) document pagination, scopes, counters, duration, and public video access.
- YouTube [channel reports](https://developers.google.com/youtube/analytics/channel_reports) and [metrics](https://developers.google.com/youtube/analytics/metrics) document the selected report and measurement units. A playback denominator matching averages is not assumed from views.
- Meta's official documentation returned HTTP 429 during verification. Meta's first-party SDK confirms [IG media fields/insights edge](https://github.com/facebook/facebook-nodejs-business-sdk/blob/main/src/objects/ig-media.js), [insights metrics](https://github.com/facebook/facebook-nodejs-business-sdk/blob/main/src/objects/instagram-insights-result.js), and [post fields](https://github.com/facebook/facebook-nodejs-business-sdk/blob/main/src/objects/post.js). The exact app/API-version/media-type combination remains subject to live verification; unsupported results are surfaced without replacing them with zero.

Live availability: inspection of variable **names only** in the original project's root/app `.env.local` found `VERCEL_OIDC_TOKEN`, no social report credentials. No live account calls were made. All four integrations remain pending live configuration and capability verification; fixtures do not establish account connectivity.

User-selected first Facebook target: **สอนทำผม INDY HAIR DESIGN ACADEMY**. This is a target label only. The Page ID and authorized Page token have not been verified, so no connection or identity is inferred from the name.
