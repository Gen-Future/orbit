# Architecture and operational choices

Browser → Next.js API → authorization → domain service → PostgreSQL transaction.
Worker → BullMQ minute scheduler → due/forgotten/morning scanner → persistent Notification → channel delivery.
AI proposal → provider adapter → strict result validation → user review → same domain transaction as manual entry.

The root npm package is the Web/API application; `packages/core` and `apps/worker` are npm workspaces. The Worker imports the same domain/database modules, so all components use one Prisma schema and one validation model.

## Tenant boundaries

Each data route resolves an authenticated actor and workspace before querying. Supplied project/parent/item IDs are looked up inside that workspace. Cookie-based users derive permissions from current membership; API tokens carry an immutable workspace ID, explicit scopes and expiry. Administrative routes reject API tokens. A changed item version prevents blind overwrite.

Item state and append-only events are committed together. Mutation receipts are scoped by workspace + actor + key; conflicting concurrent writes roll back and retrieve the winner's stored response. Completion and archival cancel pending reminders. Archival never destroys items or logs.

Deletion is a separate lifecycle transition using `deletedAt`, not completion or archival. A versioned transaction cascades to active children, cancels pending reminders, marks related notifications read and appends `deleted` events. Restoration uses the shared deletion timestamp to restore only children removed with the parent and appends `undeleted` events; it never revives cancelled reminders. Normal item queries, reminder delivery and new report inputs exclude deleted items. History and workspace exports retain them. Member/owner/admin and `items.write` tokens share the same authorization and idempotency path.

## Universe home

Sign-in and reload open the full-screen four-quadrant map. The 工作舱 drawer deliberately opens management surfaces. The map supports direct capture, coordinate movement and two distinct drag targets: a permanent central sun completes a task; a temporary black hole deletes it. Animation starts only after a successful server response. Failed writes leave the original item visible. Pointer cancellation and Escape never commit, and reduced-motion preferences suppress spatial flight while preserving status feedback. The detail panel provides equivalent completion/deletion actions without dragging.

## Reminders

PostgreSQL retains schedules and delivery state independently of Redis. A minute scheduler reconstructs actionable work after downtime. Notifications have a unique recipient/event key. External delivery observes workspace timezone, per-user quiet hours and pause/limit settings. Channel outcomes are stored separately. Failed delivery retries at exponential intervals up to five attempts; the inbox record remains.

The Worker supports one active scanner concurrency per queue. Jobs use retries and bounded completion/failure history. Heartbeat expiry powers the Compose health check. Review failed jobs and Notification.lastError when configuring a new provider.

## AI

`AIEndpoint` is a system-level registry. Exactly one endpoint is selected for normal calls by the `active` flag; activating an endpoint deactivates the others in the same transaction. Only users with `isSystemAdmin` can list, test, create, update or delete endpoints. Workspace-level configuration is retained only for migration compatibility and is not used for model calls.

Only the active task/project context is sent, never another workspace. Model key encryption depends on ENCRYPTION_KEY; back up this key with separate access control. Input audit is hashed, while structured output and source IDs remain in the workspace. Model processing cannot autonomously call tools or send messages. A valid proposal is still only a draft. Deterministic report content remains available when AI is unavailable; AI highlights are labeled for review and require source IDs from the factual input.

## Limits

This is a production-oriented MVP, not a full enterprise identity system: SSO, password recovery mail, fine-grained per-project permissions and attachments are future work. Workspace-level roles are the present isolation unit. Browser offline mode intentionally does not edit data. Database admins remain capable of altering append-only logs directly; application history is not a cryptographic tamper-proof ledger.

## Report foundry

The report surface loads its own context and candidate API rather than relying on the star map's capped data. A source is a unique item with substantive activity during the requested interval. Position movement and reminder/lifecycle-only updates do not contribute. Workspace-wide candidates are default-selected; archived sources can be added through expanded search. Generation revalidates all IDs inside the workspace, excludes deleted items and stores factual and template snapshots alongside the editable Markdown.

ReportTemplate is unique by user and workspace. Template updates use optimistic versions and preserve definition history; imported sample bodies are transient and never enter receipts or audit logs. Report edits retain the original generated content. The minute Worker compares original and final content asynchronously and saves a proposed style definition only if the report version is still current. Accepting a suggestion checks both report and template versions. The Worker verifies the author's membership before processing. The independent `orbit-report-enrichment` BullMQ queue runs its own minute scheduler and Worker for style suggestions and calendar refreshes. The `orbit-reminders` queue scans and delivers notifications, so model waits do not block active reminders. Style failures are isolated as AIJob failures and do not block saving; enrichment job failures have their own `report_enrichment_failed` event. The browser polls pending suggestions only while visible, accepts same-report-version updates and preserves the local editor with an explicit conflict message when another device advances the version.

CalendarCache stores validated annual holiday-cn JSON plus checksum, sync time and government notice URLs. The report-enrichment Worker checks a Redis day marker on each minute pass and refreshes the current/next year at most once per day after a successful pass. Adjacent annual announcements are merged for December boundary dates. Requests use fresh data or retained cache; missing data shows an explicit ordinary-week fallback. Failed remote fetches are bounded by a four-second timeout and an hour retry cooldown. Natural weeks remain Monday-to-Monday in the workspace timezone, independent of holiday labels.

Next-week extraction reads plan sections, validates quoted evidence and returns editable drafts. Explicit confirmation atomically claims a report/version batch and creates items using the shared createItem service. Each item stores sourceReportId. Same-batch retry returns its receipt; another key cannot import the same report version again. Existing reports have nullable author/template/snapshot fields and remain readable. Deployment applies the additive Prisma migration before Web and Worker start; SQL backups include new templates and calendar caches.
