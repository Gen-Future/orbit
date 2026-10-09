# Orbit API v1

Base: `/api/v1/workspaces/{workspaceId}`. JSON only. Authenticate by HttpOnly session cookie or `Authorization: Bearer orbit_…`. Cookie writes require same-origin `Origin`; tokens are workspace scoped and never grant admin operations. Reads return `Cache-Control: no-store`.

## Common behavior

- Item/project/report mutations require `Idempotency-Key` (1–160 characters). Repeat the same key and identical body to retrieve the committed result. Different body with same key returns 409. Receipt and domain write share a PostgreSQL transaction.
- Item PATCH, DELETE and restore require `version`. A stale version returns 409 without changing data. Read and reconcile before retrying.
- 400 validation; 401 authentication; 403 workspace/scope/CSRF boundary; 404 unavailable resource; 409 conflict; 429 rate limit; 503 temporary service failure.
- Dates are ISO 8601 with offset. Ranges are start-inclusive/end-exclusive. No hard-delete item endpoint exists.
- Role viewer can read. Member can edit domain data. Workspace admin/owner can manage tokens and add members. Only owner can grant admin or change roles. Owner cannot be demoted through the member API. System administration is a separate `isSystemAdmin` capability and never comes from a workspace role or API token.

## Resources

| Method           | Resource                   | Behavior                                                                                                                                                  |
| ---------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET              | `/items`                   | `{items,total,page,limit}`; filters `q`, `projectId`, `status`, `triageStatus`, `archived=true`, `all=true`, `deleted=true`, `from`, `to`; default 500, max 1000 per page |
| GET              | `/items/:id`               | Item, project, children, pending reminders, latest 100 events                                                                                             |
| GET              | `/items/sediment`          | Items overdue by at least 168 hours; filters `q`, `quadrant`, `page`, `limit`; returns global quadrant summary                                            |
| POST             | `/items`                   | Create item; fields title, notes, quadrant, triageStatus, projectId, parentId, dueAt, occurredAt, reminderAt                                              |
| POST             | `/items/bulk-reschedule`   | Atomically reschedule 1–100 sediment items with `{items:[{id,version}],dueAt}`                                                                            |
| PATCH            | `/items/:id`               | Update with version; additional status and archived fields                                                                                                |
| DELETE           | `/items/:id`               | `{version}`; reversible deletion, returns `{item, affectedIds}`                                                                                           |
| POST             | `/items/:id/restore`       | `{version}`; restore deletion, returns `{item, affectedIds}`                                                                                              |
| POST             | `/items/:id/plan`          | Confirm revised draft and add subtasks atomically; requires version                                                                                       |
| POST             | `/items/:id/snooze`        | `{minutes:5..10080}` replaces pending reminders                                                                                                           |
| POST             | `/capture`                 | Confirm natural-language draft and up to 12 child tasks atomically                                                                                        |
| GET/POST         | `/projects`                | List/create projects; `includeArchived=true` includes archived projects                                                                                   |
| GET/PATCH/DELETE | `/projects/:id`            | Read/edit/archive a project, or soft-delete it when no active items remain                                                                                |
| GET              | `/events`                  | Newest 200 events; optional itemId and before timestamp                                                                                                   |
| GET              | `/signals`                 | Overdue, seven-day inactive, top important items                                                                                                          |
| GET/POST         | `/reports`                 | List drafts / create with startAt, endAt (max 93 days)                                                                                                    |
| PATCH            | `/reports/:id`             | Save edited Markdown content                                                                                                                              |
| POST             | `/ai`                      | `{text,skillId?,itemId?}`; returns draft, mode, message and jobId; never creates an item                                                                  |
| GET              | `/skills`                  | Versioned manifests, JSON schemas, permissions, triggers                                                                                                  |
| POST             | `/skills/:id/run`          | Run capability with declared input and required scopes                                                                                                    |
| GET              | `/settings`                | Safe model config metadata, own notification settings, channel availability                                                                               |
| POST             | `/settings/ai`             | Retired: returns 403 because AI endpoints are managed globally                                                                                            |
| POST             | `/settings/notifications`  | Own reminder channels, quiet hours, daily limit, morning schedule, pausedUntil                                                                            |
| GET              | `/notifications`           | Own latest 100 inbox signals                                                                                                                              |
| POST             | `/notifications/read`      | `{id}` marks own notification read                                                                                                                        |
| POST             | `/notifications/subscribe` | Standard PushSubscription JSON; trusted browser push endpoints only                                                                                       |
| GET/POST         | `/members`                 | Read members / admin adds existing user or creates one with initial password                                                                              |
| PATCH            | `/members/:id`             | Owner changes non-owner member role                                                                                                                       |
| GET/POST/DELETE  | `/tokens[/:id]`            | Admin lists, creates or revokes workspace tokens; secret returned only at creation                                                                        |
| GET              | `/export`                  | Admin export of workspace, projects, items, all events and reports                                                                                        |

Workspace creation: `POST /api/v1/workspaces` with name and IANA timezone (user session required).
Authentication: `/api/v1/auth/status`, `/auth/register`, `/auth/login`, `/auth/logout`, `/auth/me`.
Health: `/api/v1/health` verifies database connectivity. Worker heartbeat: Redis key `orbit:worker:heartbeat` with a 180-second TTL.

System administrators additionally use `/api/v1/admin/overview` and `/api/v1/admin/ai-endpoints`. Endpoint creation takes `name`, `provider`, `baseUrl`, `model`, optional `apiKey`, and `active`; update and delete use `/ai-endpoints/:id`, while `POST /ai-endpoints/:id/test` performs a small connectivity request. Responses expose `hasKey` only. These routes require a system-admin user session and reject workspace tokens.

## Example: create and complete

```http
POST /api/v1/workspaces/WORKSPACE_ID/items
Authorization: Bearer YOUR_TOKEN
Idempotency-Key: 3b3f628e-fc08-481d-80b6-7e8cb1779b46
Content-Type: application/json

{"title":"完成产品方案","quadrant":2,"triageStatus":"triaged","dueAt":"2026-10-01T18:00:00+08:00"}
```

Then `PATCH /items/RETURNED_ITEM_ID` with a new idempotency key and `{"version":1,"status":"done"}`. Inspect the returned version instead of assuming future values.

AI payloads are untrusted data: output is schema checked, project IDs are revalidated against the current workspace, and all item writes go through the same domain service as manual actions. Saved API keys are AES-256-GCM encrypted; audit records never contain raw model keys or access tokens.

## 星图坐标

`PATCH /api/v1/workspaces/:workspaceId/items/:id` 可提交：

```json
{ "version": 2, "position": { "x": -0.4, "y": 0.6 } }
```

横轴向右为重要，纵轴向上为紧急。输入坐标范围为 -1 至 1，服务端将落点约束到各半轴绝对值 0.1–0.88 的安全区域。服务端根据坐标计算 quadrant，并在同一事务保存 `orbitX`、`orbitY`、`orbitPlacedAt`、版本和 before/after 历史。若同时传 quadrant，必须与坐标一致。坐标写入沿用 `items.write`、工作空间权限、Idempotency-Key 和 version 冲突检查。

返回事项包含三个可空的坐标字段。空值表示尚未手动放置。修改象限或截止时间会清除旧落点，使星图重新安排轨道；修改标题、笔记、状态不会重置坐标。PATCH 未提交的字段保持不变。

自动漂移仅为前端展示：截止前 14 天开始，向上移动但始终留在当前象限，不产生后台写入或审计噪声。手动拖动保存新锚点，后续按该锚点继续漂移；已逾期事项的手动落点保持稳定。无截止时间和已完成事项不自动漂移。

未完成且截止时间已过去满 168 小时的 Q1–Q4 事项会进入“时间沉积带”。这是派生视图，不修改象限、坐标或历史。`GET /items/sediment` 使用服务端时间计算阈值，并返回 `{items,total,page,limit,summary}`；`summary` 始终表示整个空间的沉积总量和四象限聚合，不受当前搜索与象限分页筛选影响。

批量改期要求新的截止时间晚于服务端当前时间，全部事项必须仍处于沉积状态且版本匹配。任一事项无效时事务整体回滚。成功改期沿用普通事项更新规则，清除旧坐标锚点、递增版本并追加 `updated` 事件。

## 完成、删除与恢复

太阳完成继续使用 `PATCH /items/:id` 的 `status: "done"`；黑洞删除使用 `DELETE /items/:id`，请求体为当前 `{version}`。删除及恢复都需要 `items.write`、同一工作空间权限和独立的 `Idempotency-Key`，Cookie 写入仍需同源 Origin。

删除是可恢复的逻辑删除：写入 `deletedAt`，保持原有状态、完成时间与历史。删除主事项会在同一事务删除尚未删除的子事项，取消相关待执行提醒，并将已有未读提醒标记为已读。所有受影响事项分别追加 `deleted` 事件。不会生成完成事件或计入完成成就。

普通列表始终排除已删除事项，`all=true` 只扩展归档范围；`deleted=true` 专门查询已删除事项，并忽略归档条件。单事项详情、事件和工作空间导出仍可追溯删除记录。已删除事项不能编辑或稍后提醒，新周报与主动提示不再选取它们。

恢复通过 `POST /items/:id/restore` 执行，追加 `undeleted` 事件。恢复主事项仅恢复同次级联删除的子事项，之前单独删除的子事项保持删除；单独恢复子事项前须恢复主事项。恢复不改变原来的完成/归档状态，也不重建已取消的提醒，需要另行设置提醒时间。

## 周报铸造舱

所有路径均在 `/api/v1/workspaces/:wid` 下。读取需要 `reports.read`；生成同时需要 `items.read`、`events.read`、`reports.write`、`ai.run`。写入继续使用 `Idempotency-Key`。个人模板只支持登录用户，访问令牌使用标准模板。

| 方法  | 路径                                 | 行为                                                                                                                                             |
| ----- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET   | `/reports/context?anchor=YYYY-MM-DD` | 返回工作空间时区中的自然周、七日日历、缓存状态、个人模板及全部当周实质进展候选；不受星图 1000 条上限影响                                         |
| GET   | `/reports/candidates`                | `startAt,endAt,q,projectId,status,page,limit`；每页最多 50 条。`mode=activity` 查询实质进展，`mode=all` 按 occurredAt 查询（包含归档，排除删除） |
| GET   | `/reports/:id`                       | 单份周报，包含版本、生成模式、来源快照与风格建议状态                                                                                             |
| GET   | `/report-template`                   | 当前用户在该空间的个人模板，未建立返回 null                                                                                                      |
| POST  | `/report-template/learn`             | `{samples:[string]}`，1–5 篇、合计最多 60000 字符；返回 `{definition,mode}` 提案，不保存原始样本                                                 |
| PATCH | `/report-template`                   | `{version,definition}`；首次 version=0，后续匹配当前版本。definition 包含 name、skeleton、tone、length、formatting、avoid                        |
| POST  | `/reports`                           | `{startAt,endAt,sourceIds?,templateId?,templateVersion?}`；精确使用最多 200 项选择。省略 sourceIds 时使用当期实质进展；省略模板时使用标准风格    |
| PATCH | `/reports/:id`                       | `{content,version?}`；推荐传版本，冲突返回 409。兼容旧 content-only 客户端                                                                       |
| POST  | `/reports/:id/style`                 | `{decision:"accept"\|"ignore",version,templateVersion}`；仅作者可处理建议，接受才更新个人模板                                                    |
| POST  | `/reports/:id/plan`                  | 提取已保存稿的下周计划，返回 `{drafts,batchId,version,mode}`；不会创建事项                                                                       |
| POST  | `/reports/:id/plan-items`            | `{batchId,version,drafts}`，1–12 项，需 items.write；原子创建事项并设置 sourceReportId                                                           |

日期范围起点包含、终点不含，最长 93 天。实质进展包括创建、内容/状态/项目/手动分类变更、完成与重开；星体移动、提醒和归档生命周期不作为工作进展。补选其他时期事项标为补充材料。AI 输出必须引用所选事项并提供原文证据；未知来源、证据不匹配或无依据数字降级为确定性草稿。每份周报保存当前来源快照与模板快照，后续修改事项不改变旧快照。Markdown 正文使用短来源引用，完整事项 URL 以文末引用定义保留，保存、复制与下载均保留可追溯链接。

计划草稿必须对应当前周报版本。同一版计划只允许导入一次，即使更换幂等键也不能重复；更新并保存周报后可以重新提取。所有事项创建与批次占用在一个事务中完成，任一项失败整体回滚。原始历史样本不进入业务数据库、审计事件或幂等回执；AIJob 只保留输入哈希和提炼结果。
