import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from '@/lib/db';
import { HttpError, invariant } from '@/lib/errors';
import {
  authorize,
  admin,
  csrf,
  getUser,
  passwordHash,
  verifyPassword,
  createSession,
  sessionCookie,
  cookieToken,
  hash,
  rateLimit,
  encrypt,
} from '@/lib/security';
import {
  mutation,
  createItem,
  updateItem,
  setItemDeleted,
  itemInSpace,
  json,
  signals,
  bulkRescheduleItems,
} from '@/lib/items';
import { reportApi } from '@/lib/report-api';
import { reportDraft } from '@/lib/reports';
import { activeModelEndpoint, capture, probeModelEndpoint } from '@/lib/ai';
import {
  skills,
  scopes,
  roles,
  captureTimingIssues,
  draftSchema,
  sedimentAfterMs,
} from '../../../../../packages/core/src';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ path?: string[] }> };
const ok = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
async function body(req: Request, maxLength = 65536) {
  const text = await req.text();
  invariant(text.length <= maxLength, 413, '请求内容过大');
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, '请求必须为 JSON');
  }
}
async function handler(req: Request, context: Context) {
  try {
    csrf(req);
    const path = (await context.params).path || [];
    const method = req.method;
    const url = new URL(req.url);
    const key = req.headers.get('idempotency-key');
    if (path[0] === 'health') {
      await db.$queryRaw`SELECT 1`;
      return ok({ status: 'ok', database: 'connected' });
    }
    if (path[0] === 'auth') {
      if (path[1] === 'status')
        return ok({
          bootstrap: (await db.user.count()) === 0,
          registrationAllowed: process.env.ALLOW_REGISTRATION === 'true',
        });
      if (path[1] === 'me') {
        const user = await getUser(req);
        invariant(user, 401, '请先登录');
        const memberships = await db.membership.findMany({
          where: { userId: user.id },
          include: { workspace: true },
        });
        return ok({
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            isSystemAdmin: user.isSystemAdmin,
          },
          memberships,
        });
      }
      if (method === 'POST' && path[1] === 'logout') {
        const token = cookieToken(req);
        if (token) await db.session.deleteMany({ where: { tokenHash: hash(token) } });
        return NextResponse.json({ ok: true }, { headers: { 'Set-Cookie': sessionCookie('', 0) } });
      }
      invariant(method === 'POST' && ['login', 'register'].includes(path[1]), 404, '接口不存在');
      const input = z
        .object({
          email: z
            .string()
            .email()
            .max(254)
            .transform((x) => x.toLowerCase()),
          password: z.string().min(10).max(128),
          name: z.string().trim().min(1).max(60).optional(),
        })
        .parse(await body(req));
      await rateLimit(`auth:${hash(input.email)}`, 10, 900000);
      await rateLimit('auth-global', 200, 900000);
      let user;
      if (path[1] === 'register') {
        user = await db.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(482091)`;
          const count = await tx.user.count();
          invariant(
            count === 0 || process.env.ALLOW_REGISTRATION === 'true',
            403,
            '注册已关闭，请联系管理员创建账号',
          );
          invariant(
            !(await tx.user.findUnique({ where: { email: input.email } })),
            409,
            '该邮箱已注册',
          );
          const created = await tx.user.create({
            data: {
              email: input.email,
              name: input.name || input.email.split('@')[0],
              passwordHash: passwordHash(input.password),
            },
          });
          await tx.workspace.create({
            data: {
              name: '我的工作轨道',
              memberships: { create: { userId: created.id, role: 'owner' } },
              preferences: { create: { userId: created.id } },
            },
          });
          return created;
        });
      } else {
        user = await db.user.findUnique({ where: { email: input.email } });
        const valid = verifyPassword(
          input.password,
          user?.passwordHash || passwordHash('constant-timing-placeholder'),
        );
        invariant(user && valid, 401, '邮箱或密码不正确');
      }
      const token = await createSession(user.id);
      return NextResponse.json(
        { user: { id: user.id, name: user.name, email: user.email } },
        { headers: { 'Set-Cookie': sessionCookie(token) } },
      );
    }
    if (path[0] === 'admin') {
      const user = await getUser(req);
      invariant(user, 401, '请先登录');
      invariant(user.isSystemAdmin, 403, '需要系统管理员权限');
      if (method !== 'GET') await rateLimit(`system-admin:${user.id}`, 60);

      if (path[1] === 'overview' && method === 'GET') {
        const now = new Date();
        const since = new Date(now.getTime() - 7 * 864e5);
        const [
          users,
          workspaces,
          openItems,
          completedItems,
          overdueItems,
          reports,
          aiSucceeded,
          failedAIJobs,
          activeSessions,
          recentUsers,
          activityItems,
          activeEndpoint,
        ] = await Promise.all([
          db.user.count(),
          db.workspace.count(),
          db.item.count({ where: { status: { not: 'done' }, deletedAt: null, archivedAt: null } }),
          db.item.count({ where: { completedAt: { gte: since }, deletedAt: null } }),
          db.item.count({
            where: {
              status: { not: 'done' },
              dueAt: { lt: now },
              deletedAt: null,
              archivedAt: null,
            },
          }),
          db.report.count({ where: { createdAt: { gte: since } } }),
          db.aIJob.count({ where: { createdAt: { gte: since }, status: 'succeeded' } }),
          db.aIJob.findMany({
            where: { createdAt: { gte: since }, status: 'failed' },
            select: { error: true },
          }),
          db.session.findMany({
            where: { expiresAt: { gt: now } },
            distinct: ['userId'],
            select: { userId: true },
          }),
          db.user.findMany({
            orderBy: { createdAt: 'desc' },
            take: 5,
            select: { id: true, name: true, email: true, createdAt: true, isSystemAdmin: true },
          }),
          db.item.findMany({
            where: { OR: [{ createdAt: { gte: since } }, { completedAt: { gte: since } }] },
            select: { createdAt: true, completedAt: true },
          }),
          db.aIEndpoint.findFirst({
            where: { active: true },
            select: { id: true, name: true, provider: true, model: true },
          }),
        ]);
        const activity = Array.from({ length: 7 }, (_, index) => {
          const date = new Date(now.getTime() - (6 - index) * 864e5).toISOString().slice(0, 10);
          return {
            date,
            created: activityItems.filter(
              (item) => item.createdAt.toISOString().slice(0, 10) === date,
            ).length,
            completed: activityItems.filter(
              (item) => item.completedAt?.toISOString().slice(0, 10) === date,
            ).length,
          };
        });
        const failureCounts = new Map<string, number>();
        for (const job of failedAIJobs) {
          const reason = job.error?.split(':', 1)[0] || 'unknown';
          failureCounts.set(reason, (failureCounts.get(reason) || 0) + 1);
        }
        return ok({
          totals: {
            users,
            workspaces,
            openItems,
            completedItems,
            overdueItems,
            reports,
            aiSucceeded,
            aiFailed: failedAIJobs.length,
            activeUsers: activeSessions.length,
          },
          activity,
          aiFailures: [...failureCounts]
            .map(([reason, count]) => ({ reason, count }))
            .sort((a, b) => b.count - a.count),
          recentUsers,
          activeEndpoint,
        });
      }

      if (path[1] === 'ai-endpoints') {
        const endpointId = path[2];
        if (method === 'GET')
          return ok(
            await db.aIEndpoint
              .findMany({
                orderBy: [{ active: 'desc' }, { updatedAt: 'desc' }],
                select: {
                  id: true,
                  name: true,
                  provider: true,
                  baseUrl: true,
                  model: true,
                  active: true,
                  createdAt: true,
                  updatedAt: true,
                  encryptedKey: true,
                },
              })
              .then((rows) =>
                rows.map(({ encryptedKey, ...row }) => ({ ...row, hasKey: Boolean(encryptedKey) })),
              ),
          );
        if (method === 'POST' && endpointId && path[3] === 'test') {
          const endpoint = await db.aIEndpoint.findUnique({ where: { id: endpointId } });
          invariant(endpoint, 404, 'AI 端点不存在');
          return ok(await probeModelEndpoint(endpoint));
        }
        if (method === 'DELETE' && endpointId) {
          invariant(
            await db.aIEndpoint.findUnique({ where: { id: endpointId } }),
            404,
            'AI 端点不存在',
          );
          await db.aIEndpoint.delete({ where: { id: endpointId } });
          return ok({ ok: true });
        }
        const createSchema = z.object({
          name: z.string().trim().min(1).max(80),
          provider: z.enum(['openai', 'ollama']),
          baseUrl: z
            .string()
            .url()
            .refine(
              (value) => ['http:', 'https:'].includes(new URL(value).protocol),
              '必须使用 HTTP(S)',
            ),
          model: z.string().trim().min(1).max(160),
          apiKey: z.string().max(1000).optional(),
          active: z.boolean().default(true),
        });
        const updateSchema = createSchema.partial().extend({ active: z.boolean().optional() });
        if (method === 'POST' && !endpointId) {
          const value = createSchema.parse(await body(req));
          const { apiKey, ...data } = value;
          const endpoint = await db.$transaction(async (tx) => {
            if (data.active) await tx.aIEndpoint.updateMany({ data: { active: false } });
            return tx.aIEndpoint.create({
              data: { ...data, ...(apiKey ? { encryptedKey: encrypt(apiKey) } : {}) },
            });
          });
          return ok({ id: endpoint.id }, 201);
        }
        if (method === 'PATCH' && endpointId) {
          const value = updateSchema.parse(await body(req));
          const { apiKey, ...data } = value;
          const endpoint = await db.$transaction(async (tx) => {
            invariant(
              await tx.aIEndpoint.findUnique({ where: { id: endpointId } }),
              404,
              'AI 端点不存在',
            );
            if (data.active) await tx.aIEndpoint.updateMany({ data: { active: false } });
            return tx.aIEndpoint.update({
              where: { id: endpointId },
              data: { ...data, ...(apiKey ? { encryptedKey: encrypt(apiKey) } : {}) },
            });
          });
          return ok({ id: endpoint.id });
        }
      }
      throw new HttpError(404, '系统管理接口不存在');
    }
    if (path[0] === 'workspaces' && path.length === 1 && method === 'POST') {
      const user = await getUser(req);
      invariant(user, 401, '请先登录');
      const input = z
        .object({
          name: z.string().trim().min(1).max(80),
          timezone: z.string().default('Asia/Shanghai'),
        })
        .parse(await body(req));
      try {
        new Intl.DateTimeFormat('en', { timeZone: input.timezone });
      } catch {
        throw new HttpError(400, '时区无效');
      }
      await rateLimit(`workspace:${user.id}`, 5, 3600000);
      return ok(
        await db.workspace.create({
          data: {
            ...input,
            memberships: { create: { userId: user.id, role: 'owner' } },
            preferences: { create: { userId: user.id } },
          },
        }),
        201,
      );
    }
    invariant(path[0] === 'workspaces' && path[1], 404, '接口不存在');
    const wid = path[1],
      resource = path[2],
      id = path[3];
    const scope =
      resource === 'projects'
        ? method === 'GET'
          ? 'projects.read'
          : 'projects.write'
        : resource === 'events'
          ? 'events.read'
          : resource === 'reports' || resource === 'report-template'
            ? method === 'GET'
              ? 'reports.read'
              : 'reports.write'
            : resource === 'ai' ||
                (resource === 'skills' &&
                  method === 'POST' &&
                  !['detect-forgotten-items', 'suggest-next-action'].includes(id))
              ? 'ai.run'
              : method === 'GET' ||
                  resource === 'notifications' ||
                  (resource === 'settings' && id === 'notifications') ||
                  (resource === 'skills' && method === 'POST')
                ? 'items.read'
                : 'items.write';
    const actor = await authorize(req, wid, scope);
    if (method !== 'GET') await rateLimit(`writes:${actor.id}`, 100);
    if (resource === 'items') {
      if (method === 'GET') {
        if (id === 'sediment') {
          const serverNow = new Date();
          const thresholdAt = new Date(serverNow.getTime() - sedimentAfterMs);
          const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
          const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 50));
          const q = url.searchParams.get('q')?.trim();
          const quadrantValue = Number(url.searchParams.get('quadrant'));
          const quadrant = [1, 2, 3, 4].includes(quadrantValue) ? quadrantValue : null;
          const baseWhere: Prisma.ItemWhereInput = {
            workspaceId: wid,
            dueAt: { lte: thresholdAt },
            status: { in: ['open', 'doing', 'blocked'] },
            triageStatus: 'triaged',
            quadrant: { in: [1, 2, 3, 4] },
            archivedAt: null,
            deletedAt: null,
          };
          const filteredWhere: Prisma.ItemWhereInput = {
            ...baseWhere,
            ...(quadrant ? { quadrant } : {}),
            ...(q
              ? {
                  OR: [
                    { title: { contains: q, mode: 'insensitive' } },
                    { notes: { contains: q, mode: 'insensitive' } },
                    { project: { name: { contains: q, mode: 'insensitive' } } },
                  ],
                }
              : {}),
          };
          const [items, total, groups, earliest] = await Promise.all([
            db.item.findMany({
              where: filteredWhere,
              include: { project: true },
              orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
              take: limit,
              skip: (page - 1) * limit,
            }),
            db.item.count({ where: filteredWhere }),
            db.item.groupBy({
              by: ['quadrant'],
              where: baseWhere,
              _count: { _all: true },
              _min: { dueAt: true },
            }),
            db.item.aggregate({ where: baseWhere, _min: { dueAt: true } }),
          ]);
          const byQuadrant = Object.fromEntries(
            [1, 2, 3, 4].map((value) => {
              const group = groups.find((entry) => entry.quadrant === value);
              return [
                value,
                {
                  count: group?._count._all || 0,
                  earliestDueAt: group?._min.dueAt?.toISOString() || null,
                },
              ];
            }),
          );
          return ok({
            items,
            total,
            page,
            limit,
            summary: {
              total: groups.reduce((sum, group) => sum + group._count._all, 0),
              byQuadrant,
              earliestDueAt: earliest._min.dueAt?.toISOString() || null,
              thresholdAt: thresholdAt.toISOString(),
              serverNow: serverNow.toISOString(),
            },
          });
        }
        if (id) {
          const item = await db.item.findFirst({
            where: { id, workspaceId: wid },
            include: {
              project: true,
              children: { where: { deletedAt: null } },
              reminders: { where: { status: 'pending' } },
              events: { orderBy: { createdAt: 'desc' }, take: 100 },
            },
          });
          invariant(item, 404, '事项不存在');
          return ok(item);
        }
        const page = Math.max(1, Number(url.searchParams.get('page')) || 1),
          limit = Math.min(1000, Math.max(1, Number(url.searchParams.get('limit')) || 500));
        const q = url.searchParams.get('q');
        const dateFrom = url.searchParams.get('from'),
          dateTo = url.searchParams.get('to');
        if (dateFrom) invariant(!isNaN(Date.parse(dateFrom)), 400, '开始日期无效');
        if (dateTo) invariant(!isNaN(Date.parse(dateTo)), 400, '结束日期无效');
        const where: Prisma.ItemWhereInput = {
          workspaceId: wid,
          deletedAt: url.searchParams.get('deleted') === 'true' ? { not: null } : null,
          ...(url.searchParams.get('deleted') === 'true'
            ? {}
            : url.searchParams.get('archived') === 'true'
              ? { archivedAt: { not: null } }
              : url.searchParams.get('all') === 'true'
                ? {}
                : { archivedAt: null }),
          ...(q
            ? {
                OR: [
                  { title: { contains: q, mode: 'insensitive' } },
                  { notes: { contains: q, mode: 'insensitive' } },
                ],
              }
            : {}),
          ...(url.searchParams.get('projectId')
            ? { projectId: url.searchParams.get('projectId') }
            : {}),
          ...(url.searchParams.get('status') ? { status: url.searchParams.get('status')! } : {}),
          ...(url.searchParams.get('triageStatus')
            ? { triageStatus: url.searchParams.get('triageStatus')! }
            : {}),
          ...(dateFrom || dateTo
            ? {
                occurredAt: {
                  ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
                  ...(dateTo ? { lt: new Date(dateTo) } : {}),
                },
              }
            : {}),
        };
        const [items, total] = await Promise.all([
          db.item.findMany({
            where,
            include: { project: true, reminders: { where: { status: 'pending' } } },
            orderBy: [{ createdAt: 'desc' }],
            take: limit,
            skip: (page - 1) * limit,
          }),
          db.item.count({ where }),
        ]);
        return ok({ items, total, page, limit });
      }
      const input = await body(req);
      if (method === 'POST' && id === 'bulk-reschedule') {
        const value = z
          .object({
            items: z
              .array(
                z.object({ id: z.string().min(1), version: z.number().int().positive() }).strict(),
              )
              .min(1)
              .max(100),
            dueAt: z.string().datetime({ offset: true }),
          })
          .strict()
          .parse(input);
        return ok(
          await mutation(actor, key, { route: 'bulk-reschedule', value }, (tx) =>
            bulkRescheduleItems(tx, actor, value.items, value.dueAt),
          ),
        );
      }
      if (id && (method === 'DELETE' || (method === 'POST' && path[4] === 'restore'))) {
        const value = z.object({ version: z.number().int().positive() }).strict().parse(input);
        const deleted = method === 'DELETE';
        return ok(
          await mutation(
            actor,
            key,
            { route: `${deleted ? 'delete' : 'restore'}:${id}`, value },
            (tx) => setItemDeleted(tx, actor, id, value.version, deleted),
          ),
        );
      }
      if (method === 'POST' && !id)
        return ok(
          await mutation(actor, key, { route: 'create', input }, (tx) =>
            createItem(tx, actor, input),
          ),
          201,
        );
      if (method === 'POST' && id && path[4] === 'plan') {
        const value = draftSchema.extend({ version: z.number().int().positive() }).parse(input);
        const timingIssues = captureTimingIssues(value);
        invariant(!timingIssues.length, 400, timingIssues.join('；'));
        return ok(
          await mutation(actor, key, { route: `plan:${id}`, value }, async (tx) => {
            const { subtasks, ...patch } = value;
            const item = await updateItem(tx, actor, id, patch);
            const existing = await tx.item.findMany({
              where: { parentId: id, workspaceId: wid, deletedAt: null },
              select: { title: true },
            });
            const known = new Set(existing.map(({ title }) => title.trim().toLocaleLowerCase()));
            for (const title of subtasks) {
              const normalized = title.trim().toLocaleLowerCase();
              if (known.has(normalized)) continue;
              known.add(normalized);
              await createItem(
                tx,
                actor,
                {
                  title,
                  parentId: id,
                  projectId: item.projectId,
                  quadrant: item.quadrant,
                  triageStatus: item.triageStatus,
                },
                'ai',
              );
            }
            return item;
          }),
        );
      }
      if (method === 'PATCH' && id)
        return ok(
          await mutation(actor, key, { route: `update:${id}`, input }, (tx) =>
            updateItem(tx, actor, id, input),
          ),
        );
      if (method === 'POST' && id && path[4] === 'snooze') {
        const value = z.object({ minutes: z.number().int().min(5).max(10080) }).parse(input);
        return ok(
          await mutation(actor, key, { route: `snooze:${id}`, value }, async (tx) => {
            const item = await itemInSpace(tx, id, wid);
            invariant(
              item.status !== 'done' && !item.archivedAt && !item.deletedAt,
              409,
              '已完成或归档的事项不能提醒',
            );
            await tx.reminder.updateMany({
              where: { itemId: id, workspaceId: wid, status: 'pending' },
              data: { status: 'cancelled' },
            });
            const reminder = await tx.reminder.create({
              data: {
                workspaceId: wid,
                itemId: id,
                scheduledAt: new Date(Date.now() + value.minutes * 60000),
              },
            });
            await tx.itemEvent.create({
              data: {
                workspaceId: wid,
                itemId: id,
                actorId: actor.id,
                type: 'snoozed',
                data: json(reminder),
              },
            });
            return reminder;
          }),
        );
      }
    }
    if (resource === 'capture' && method === 'POST') {
      const raw = await body(req);
      const input = draftSchema
        .extend({ source: z.enum(['ai', 'rules', 'manual']).default('manual') })
        .parse(raw);
      const timingIssues = captureTimingIssues(input);
      invariant(!timingIssues.length, 400, timingIssues.join('；'));
      if (raw && typeof raw === 'object' && !('triageStatus' in raw) && 'quadrant' in raw)
        input.triageStatus = 'triaged';
      return ok(
        await mutation(actor, key, { route: 'capture', input }, async (tx) => {
          const { subtasks, source, ...main } = input;
          const item = await createItem(tx, actor, main, source);
          const known = new Set<string>();
          for (const title of subtasks) {
            const normalized = title.trim().toLocaleLowerCase();
            if (known.has(normalized)) continue;
            known.add(normalized);
            await createItem(
              tx,
              actor,
              {
                title,
                projectId: item.projectId,
                parentId: item.id,
                quadrant: item.quadrant,
                triageStatus: item.triageStatus,
              },
              source,
            );
          }
          return item;
        }),
        201,
      );
    }
    if (resource === 'projects') {
      if (method === 'GET' && id) {
        const project = await db.project.findFirst({
          where: { id, workspaceId: wid, deletedAt: null },
          include: {
            _count: { select: { items: { where: { deletedAt: null } } } },
          },
        });
        invariant(project, 404, '项目不存在');
        return ok(project);
      }
      if (method === 'GET')
        return ok(
          await db.project.findMany({
            where: {
              workspaceId: wid,
              deletedAt: null,
              ...(url.searchParams.get('includeArchived') === 'true' ? {} : { archivedAt: null }),
            },
            orderBy: [{ archivedAt: 'asc' }, { updatedAt: 'desc' }],
          }),
        );
      if (method === 'POST') {
        const input = z
          .object({
            name: z.string().trim().min(1).max(100),
            description: z.string().max(2000).default(''),
            color: z
              .string()
              .regex(/^#[0-9a-f]{6}$/i)
              .default('#d7ff4f'),
          })
          .parse(await body(req));
        return ok(
          await mutation(actor, key, { route: 'projects', input }, async (tx) => {
            const project = await tx.project.create({ data: { ...input, workspaceId: wid } });
            await tx.itemEvent.create({
              data: {
                workspaceId: wid,
                actorId: actor.id,
                type: 'project.created',
                data: json(project),
              },
            });
            return project;
          }),
          201,
        );
      }
      if (method === 'PATCH' && id) {
        const input = z
          .object({
            version: z.number().int().positive(),
            name: z.string().trim().min(1).max(100).optional(),
            description: z.string().max(2000).optional(),
            color: z
              .string()
              .regex(/^#[0-9a-f]{6}$/i)
              .optional(),
            archived: z.boolean().optional(),
          })
          .strict()
          .parse(await body(req));
        return ok(
          await mutation(actor, key, { route: `projects:${id}`, input }, async (tx) => {
            const before = await tx.project.findFirst({
              where: { id, workspaceId: wid, deletedAt: null },
            });
            invariant(before, 404, '项目不存在');
            invariant(before.version === input.version, 409, '项目已被更新，请刷新后再修改');
            const { version, archived, ...fields } = input;
            const changed = await tx.project.updateMany({
              where: { id, workspaceId: wid, version, deletedAt: null },
              data: {
                ...fields,
                version: { increment: 1 },
                ...(archived !== undefined ? { archivedAt: archived ? new Date() : null } : {}),
              },
            });
            invariant(changed.count === 1, 409, '项目已被更新，请刷新后再修改');
            const project = await tx.project.findUniqueOrThrow({ where: { id } });
            await tx.itemEvent.create({
              data: {
                workspaceId: wid,
                actorId: actor.id,
                type: archived
                  ? 'project.archived'
                  : archived === false
                    ? 'project.restored'
                    : 'project.updated',
                data: json({ before, after: project }),
              },
            });
            return project;
          }),
        );
      }
      if (method === 'DELETE' && id) {
        const input = z
          .object({ version: z.number().int().positive() })
          .strict()
          .parse(await body(req));
        return ok(
          await mutation(actor, key, { route: `projects:${id}:delete`, input }, async (tx) => {
            const before = await tx.project.findFirst({
              where: { id, workspaceId: wid, deletedAt: null },
            });
            invariant(before, 404, '项目不存在');
            invariant(before.version === input.version, 409, '项目已被更新，请刷新后再修改');
            invariant(
              (await tx.item.count({
                where: { projectId: id, workspaceId: wid, deletedAt: null },
              })) === 0,
              409,
              '项目仍有关联事项，请先移动或删除这些事项',
            );
            const changed = await tx.project.updateMany({
              where: { id, workspaceId: wid, version: input.version, deletedAt: null },
              data: { deletedAt: new Date(), version: { increment: 1 } },
            });
            invariant(changed.count === 1, 409, '项目已被更新，请刷新后再修改');
            const project = await tx.project.findUniqueOrThrow({ where: { id } });
            await tx.itemEvent.create({
              data: {
                workspaceId: wid,
                actorId: actor.id,
                type: 'project.deleted',
                data: json({ before, after: project }),
              },
            });
            return project;
          }),
        );
      }
    }
    if (resource === 'events' && method === 'GET') {
      const itemId = url.searchParams.get('itemId');
      const before = url.searchParams.get('before');
      if (before) invariant(!isNaN(Date.parse(before)), 400, '游标日期无效');
      return ok(
        await db.itemEvent.findMany({
          where: {
            workspaceId: wid,
            ...(itemId ? { itemId } : {}),
            ...(before ? { createdAt: { lt: new Date(before) } } : {}),
          },
          include: { item: { select: { id: true, title: true, projectId: true } } },
          orderBy: { createdAt: 'desc' },
          take: 200,
        }),
      );
    }
    if (resource === 'signals' && method === 'GET') return ok(await signals(wid));
    if (resource === 'reports' || resource === 'report-template') {
      const response = await reportApi(
        req,
        actor,
        resource,
        id,
        path[4],
        method === 'GET' ? null : await body(req, 262144),
        key,
      );
      if (response) return response;
    }
    if ((resource === 'ai' && method === 'POST') || (resource === 'skills' && method === 'POST')) {
      const input = z
        .object({
          text: z.string().max(12000).default(''),
          skillId: z.string().optional(),
          itemId: z.string().optional(),
          projectId: z.string().optional(),
          startAt: z.string().optional(),
          endAt: z.string().optional(),
          sourceIds: z.array(z.string()).max(200).optional(),
          templateId: z.string().optional(),
          templateVersion: z.number().int().positive().optional(),
        })
        .parse(await body(req));
      const skillId = resource === 'skills' ? id : input.skillId || 'capture-item';
      const skill = skills.find((s) => s.id === skillId);
      invariant(skill, 404, 'Skill 不存在');
      for (const permission of skill.permissions)
        await authorize(req, wid, permission as (typeof scopes)[number]);
      await rateLimit(`ai:${actor.id}`, 20);
      if (skillId === 'detect-forgotten-items' || skillId === 'suggest-next-action')
        return ok(await signals(wid));
      if (skillId === 'weekly-report') {
        const draft = await reportDraft(actor, input);
        return ok(
          await mutation(actor, key, { route: 'skill-report', input }, (tx) =>
            tx.report.create({ data: { ...draft, workspaceId: wid } }),
          ),
        );
      }
      if (skillId === 'project-recap') {
        invariant(input.projectId, 400, '需要项目 ID');
        const project = await db.project.findFirst({
          where: { workspaceId: wid, id: input.projectId },
          include: { items: { where: { deletedAt: null } } },
        });
        invariant(project, 404, '项目不存在');
        return ok({
          project: { id: project.id, name: project.name },
          completed: project.items
            .filter((x) => x.status === 'done')
            .map((x) => ({ id: x.id, title: x.title })),
          pending: project.items
            .filter((x) => x.status !== 'done')
            .map((x) => ({ id: x.id, title: x.title })),
          sourceIds: project.items.map((x) => x.id),
        });
      }
      invariant(input.text.trim() || input.itemId, 400, '请输入需要整理的内容');
      return ok(await capture(actor, input.text, skillId, input.itemId, req.signal));
    }
    if (resource === 'skills' && method === 'GET') return ok(skills);
    if (resource === 'settings') {
      if (method === 'GET') {
        const [ai, pref] = await Promise.all([
          activeModelEndpoint(),
          actor.userId
            ? db.notificationPreference.findUnique({
                where: { workspaceId_userId: { workspaceId: wid, userId: actor.userId } },
              })
            : null,
        ]);
        return ok({
          ai: ai
            ? {
                provider: ai.provider,
                baseUrl: ai.baseUrl,
                model: ai.model,
                hasKey: Boolean(ai.encryptedKey),
              }
            : null,
          preferences: pref,
          vapidPublicKey: process.env.VAPID_PUBLIC_KEY || null,
          smtpConfigured: Boolean(process.env.SMTP_HOST),
          aiConfigured: Boolean(ai),
        });
      }
      if (method === 'POST' && id === 'ai') {
        throw new HttpError(403, 'AI 端点由系统管理员统一管理');
      }
      if (method === 'POST' && id === 'notifications') {
        invariant(actor.userId, 403, '需要用户登录');
        const value = z
          .object({
            pushEnabled: z.boolean(),
            emailEnabled: z.boolean(),
            quietStart: z.number().int().min(0).max(23),
            quietEnd: z.number().int().min(0).max(23),
            morningHour: z.number().int().min(0).max(23),
            morningEnabled: z.boolean(),
            dailyLimit: z.number().int().min(1).max(20),
            pausedUntil: z.string().datetime().nullable().optional(),
          })
          .parse(await body(req));
        return ok(
          await db.notificationPreference.upsert({
            where: { workspaceId_userId: { workspaceId: wid, userId: actor.userId } },
            create: { ...value, workspaceId: wid, userId: actor.userId },
            update: value,
          }),
        );
      }
    }
    if (resource === 'notifications') {
      invariant(actor.userId, 403, '需要用户登录');
      if (method === 'GET')
        return ok(
          await db.notification.findMany({
            where: { workspaceId: wid, userId: actor.userId },
            orderBy: { createdAt: 'desc' },
            take: 100,
          }),
        );
      if (method === 'POST' && id === 'read') {
        const input = z.object({ id: z.string() }).parse(await body(req));
        await db.notification.updateMany({
          where: { id: input.id, userId: actor.userId, workspaceId: wid },
          data: { readAt: new Date() },
        });
        return ok({ ok: true });
      }
      if (method === 'POST' && id === 'subscribe') {
        const input = z
          .object({
            endpoint: z
              .string()
              .url()
              .refine((x) => new URL(x).protocol === 'https:'),
            keys: z.object({ auth: z.string().max(500), p256dh: z.string().max(500) }),
          })
          .parse(await body(req));
        const endpoint = new URL(input.endpoint);
        const allowed = [
          'fcm.googleapis.com',
          'updates.push.services.mozilla.com',
          'push.services.mozilla.com',
          'web.push.apple.com',
          'notify.windows.com',
        ];
        invariant(
          allowed.some(
            (host) => endpoint.hostname === host || endpoint.hostname.endsWith(`.${host}`),
          ),
          400,
          '不支持此推送服务',
        );
        return ok(
          await db.pushSubscription.upsert({
            where: { endpoint: input.endpoint },
            create: { ...input, userId: actor.userId },
            update: { keys: input.keys, userId: actor.userId },
          }),
        );
      }
    }
    if (resource === 'members') {
      if (method === 'GET')
        return ok(
          await db.membership.findMany({
            where: { workspaceId: wid },
            include: { user: { select: { id: true, name: true, email: true } } },
          }),
        );
      admin(actor);
      if (method === 'POST') {
        const input = z
          .object({
            email: z
              .string()
              .email()
              .transform((x) => x.toLowerCase()),
            name: z.string().max(60).optional(),
            password: z.string().min(10).max(128).optional(),
            role: z.enum(['admin', 'member', 'viewer']).default('member'),
          })
          .parse(await body(req));
        if (input.role === 'admin')
          invariant(actor.role === 'owner', 403, '只有所有者可以创建管理员');
        return ok(
          await mutation(
            actor,
            key,
            {
              route: 'members',
              input: { ...input, password: input.password ? hash(input.password) : undefined },
            },
            async (tx) => {
              let user = await tx.user.findUnique({ where: { email: input.email } });
              if (!user) {
                invariant(input.password, 400, '新用户需要设置初始密码（至少 10 位）');
                user = await tx.user.create({
                  data: {
                    email: input.email,
                    name: input.name || input.email.split('@')[0],
                    passwordHash: passwordHash(input.password),
                  },
                });
              }
              invariant(
                !(await tx.membership.findUnique({
                  where: { workspaceId_userId: { workspaceId: wid, userId: user.id } },
                })),
                409,
                '该用户已加入工作空间',
              );
              const member = await tx.membership.create({
                data: { workspaceId: wid, userId: user.id, role: input.role },
              });
              await tx.notificationPreference.create({
                data: { workspaceId: wid, userId: user.id },
              });
              await tx.itemEvent.create({
                data: {
                  workspaceId: wid,
                  actorId: actor.id,
                  type: 'member.added',
                  data: { userId: user.id, role: input.role },
                },
              });
              return member;
            },
          ),
          201,
        );
      }
      if (method === 'PATCH' && id) {
        const input = z
          .object({ role: z.enum(['admin', 'member', 'viewer']) })
          .parse(await body(req));
        invariant(actor.role === 'owner', 403, '只有所有者可以更改角色');
        const member = await db.membership.findFirst({ where: { id, workspaceId: wid } });
        invariant(member && member.role !== 'owner', 400, '不能修改空间所有者');
        return ok(await db.membership.update({ where: { id }, data: { role: input.role } }));
      }
    }
    if (resource === 'tokens') {
      admin(actor);
      if (method === 'GET')
        return ok(
          await db.accessToken.findMany({
            where: { workspaceId: wid },
            select: {
              id: true,
              name: true,
              scopes: true,
              createdAt: true,
              expiresAt: true,
              revokedAt: true,
            },
          }),
        );
      if (method === 'POST') {
        const input = z
          .object({
            name: z.string().min(1).max(80),
            scopes: z.array(z.enum(scopes)).min(1),
            expiresDays: z.number().int().min(1).max(365).default(90),
          })
          .parse(await body(req));
        const token = `orbit_${randomBytes(32).toString('base64url')}`;
        const record = await db.accessToken.create({
          data: {
            workspaceId: wid,
            name: input.name,
            scopes: input.scopes,
            expiresAt: new Date(Date.now() + input.expiresDays * 864e5),
            tokenHash: hash(token),
          },
        });
        await db.itemEvent.create({
          data: {
            workspaceId: wid,
            actorId: actor.id,
            type: 'token.created',
            data: { tokenId: record.id, scopes: input.scopes },
          },
        });
        return ok({ id: record.id, token, expiresAt: record.expiresAt }, 201);
      }
      if (method === 'DELETE' && id) {
        await db.accessToken.updateMany({
          where: { workspaceId: wid, id },
          data: { revokedAt: new Date() },
        });
        await db.itemEvent.create({
          data: {
            workspaceId: wid,
            actorId: actor.id,
            type: 'token.revoked',
            data: { tokenId: id },
          },
        });
        return ok({ ok: true });
      }
    }
    if (resource === 'export' && method === 'GET') {
      admin(actor);
      const [workspace, projects, items, events, reports] = await Promise.all([
        db.workspace.findUnique({ where: { id: wid } }),
        db.project.findMany({ where: { workspaceId: wid } }),
        db.item.findMany({ where: { workspaceId: wid } }),
        db.itemEvent.findMany({ where: { workspaceId: wid }, orderBy: { createdAt: 'asc' } }),
        db.report.findMany({ where: { workspaceId: wid } }),
      ]);
      return ok({
        format: 'orbit-export-v1',
        exportedAt: new Date().toISOString(),
        workspace,
        projects,
        items,
        events,
        reports,
      });
    }
    throw new HttpError(404, '接口不存在');
  } catch (error) {
    if (error instanceof z.ZodError)
      return ok(
        {
          error: '输入格式不正确',
          details: error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
        },
        400,
      );
    if (error instanceof HttpError) return ok({ error: error.message }, error.status);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      return ok({ error: '记录已存在' }, 409);
    console.error(
      JSON.stringify({
        event: 'api_error',
        message: error instanceof Error ? error.message : 'unknown',
      }),
    );
    return ok({ error: '服务暂时不可用，请稍后重试' }, 503);
  }
}
export { handler as GET, handler as POST, handler as PATCH, handler as DELETE };
