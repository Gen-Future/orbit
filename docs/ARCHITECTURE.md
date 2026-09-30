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

Only the active task/project context is sent, never another workspace. Model key encryption depends on ENCRYPTION_KEY; back up this key with separate access control. Input audit is hashed, while structured output and source IDs remain in the workspace. Model processing cannot autonomously call tools or send messages. A valid proposal is still only a draft. Deterministic report content remains available when AI is unavailable; AI highlights are labeled for review and require source IDs from the factual input.

## Limits

This is a production-oriented MVP, not a full enterprise identity system: SSO, password recovery mail, fine-grained per-project permissions and attachments are future work. Workspace-level roles are the present isolation unit. Browser offline mode intentionally does not edit data. Database admins remain capable of altering append-only logs directly; application history is not a cryptographic tamper-proof ledger.
