import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from './db';
import { authorize, rateLimit, type Actor } from './security';
import { mutation, json } from './items';
import { invariant } from './errors';
import {
  reportContext,
  reportCandidates,
  personalTemplate,
  learnTemplate,
  saveTemplate,
  reportDraft,
  extractReportPlan,
  commitReportPlan,
} from './reports';
import { reportDefinitionSchema, reportPlanSchema } from '../../packages/core/src/reports';
const ok = (value: unknown, status = 200) =>
  NextResponse.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
export async function reportApi(
  req: Request,
  actor: Actor,
  resource: string,
  id: string | undefined,
  action: string | undefined,
  input: unknown,
  key: string | null,
) {
  const wid = actor.workspaceId,
    url = new URL(req.url),
    method = req.method;
  if (resource === 'report-template') {
    invariant(actor.userId, 403, '个人模板需要用户登录');
    if (method === 'GET') return ok(await personalTemplate(actor));
    if (method === 'POST' && id === 'learn') {
      await authorize(req, wid, 'ai.run');
      await rateLimit(`ai:${actor.id}`, 20);
      const value = z
        .object({ samples: z.array(z.string().trim().min(1).max(60000)).min(1).max(5) })
        .refine(
          (v) => v.samples.reduce((n, s) => n + s.length, 0) <= 60000,
          '历史样本最多 60000 字符',
        )
        .parse(input);
      // Learning returns a proposal only. No mutation receipt stores original samples.
      return ok(await learnTemplate(actor, value.samples));
    }
    if (method === 'PATCH') {
      const value = z
        .object({ definition: reportDefinitionSchema, version: z.number().int().min(0) })
        .parse(input);
      return ok(
        await mutation(actor, key, { route: 'report-template', input: value }, (tx) =>
          saveTemplate(tx, actor, value.definition, value.version),
        ),
      );
    }
    return null;
  }
  if (resource !== 'reports') return null;
  if (method === 'GET') {
    if (id === 'context' || id === 'candidates') {
      await authorize(req, wid, 'items.read');
      await authorize(req, wid, 'events.read');
      return ok(
        id === 'context'
          ? await reportContext(actor, url.searchParams.get('anchor') || undefined)
          : await reportCandidates(actor, url.searchParams),
      );
    }
    if (id) {
      const report = await db.report.findFirst({ where: { id, workspaceId: wid } });
      invariant(report, 404, '周报不存在');
      return ok(report);
    }
    return ok(
      await db.report.findMany({
        where: { workspaceId: wid },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    );
  }
  if (method === 'POST' && !id) {
    await authorize(req, wid, 'items.read');
    await authorize(req, wid, 'events.read');
    await authorize(req, wid, 'ai.run');
    await rateLimit(`ai:${actor.id}`, 20);
    // Avoid repeating an expensive AI request when a committed receipt already exists.
    if (key) {
      const receipt = await db.mutationReceipt.findUnique({
        where: { workspaceId_actorId_key: { workspaceId: wid, actorId: actor.id, key } },
      });
      if (receipt)
        return ok(
          await mutation(actor, key, { route: 'report', input }, async () => receipt.response),
          201,
        );
    }
    const draft = await reportDraft(actor, input);
    return ok(
      await mutation(actor, key, { route: 'report', input }, async (tx) => {
        const report = await tx.report.create({ data: { workspaceId: wid, ...draft } });
        await tx.itemEvent.create({
          data: {
            workspaceId: wid,
            actorId: actor.id,
            type: 'report.created',
            data: { reportId: report.id, sourceIds: report.sourceIds },
          },
        });
        return report;
      }),
      201,
    );
  }
  if (method === 'PATCH' && id) {
    const value = z
      .object({ content: z.string().max(50000), version: z.number().int().positive().optional() })
      .parse(input);
    return ok(
      await mutation(actor, key, { route: `report:${id}`, input: value }, async (tx) => {
        const report = await tx.report.findFirst({ where: { id, workspaceId: wid } });
        invariant(report, 404, '周报不存在');
        invariant(
          !value.version || report.version === value.version,
          409,
          '周报已在其他设备修改，请重新加载',
        );
        const changed = await tx.report.updateMany({
          where: { id, version: report.version },
          data: {
            content: value.content,
            version: { increment: 1 },
            suggestionStatus:
              report.authorId === actor.userId &&
              report.templateId &&
              value.content !== report.generatedContent
                ? 'pending'
                : 'none',
            styleSuggestion: Prisma.DbNull,
            planDraft: Prisma.DbNull,
            planBatchId: null,
          },
        });
        invariant(changed.count === 1, 409, '周报已修改，请重新加载');
        await tx.itemEvent.create({
          data: {
            workspaceId: wid,
            actorId: actor.id,
            type: 'report.updated',
            data: { reportId: id },
          },
        });
        return tx.report.findUniqueOrThrow({ where: { id } });
      }),
    );
  }
  if (method === 'POST' && id && action === 'style') {
    const value = z
      .object({
        decision: z.enum(['accept', 'ignore']),
        version: z.number().int().positive(),
        templateVersion: z.number().int().positive(),
      })
      .parse(input);
    return ok(
      await mutation(actor, key, { route: `report-style:${id}`, input: value }, async (tx) => {
        const report = await tx.report.findFirst({ where: { id, workspaceId: wid } });
        invariant(report && report.authorId === actor.userId, 403, '只能更新自己的周报风格');
        invariant(
          report.version === value.version &&
            report.suggestionStatus === 'ready' &&
            report.suggestionRevision === value.version,
          409,
          '建议已发生变化，请刷新',
        );
        const suggestion = report.styleSuggestion as {
          definition: unknown;
          templateVersion: number;
        };
        invariant(
          suggestion.templateVersion === value.templateVersion,
          409,
          '模板版本已变化，请刷新',
        );
        if (value.decision === 'accept')
          await saveTemplate(
            tx,
            actor,
            reportDefinitionSchema.parse(suggestion.definition),
            value.templateVersion,
          );
        await tx.report.update({
          where: { id },
          data: { suggestionStatus: value.decision === 'accept' ? 'accepted' : 'ignored' },
        });
        return { ok: true };
      }),
    );
  }
  if (method === 'POST' && id && action === 'plan') {
    await authorize(req, wid, 'ai.run');
    await authorize(req, wid, 'items.read');
    await rateLimit(`ai:${actor.id}`, 20);
    return ok(await extractReportPlan(actor, id));
  }
  if (method === 'POST' && id && action === 'plan-items') {
    await authorize(req, wid, 'items.write');
    const value = z
      .object({
        batchId: z.string().uuid(),
        version: z.number().int().positive(),
        drafts: z.array(reportPlanSchema).min(1).max(12),
      })
      .parse(input);
    return ok(
      await mutation(actor, key, { route: `report-plan:${id}`, input: value }, (tx) =>
        commitReportPlan(tx, actor, id, value),
      ),
      201,
    );
  }
  return null;
}
