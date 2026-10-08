import { Prisma } from '@prisma/client';
import { db } from './db';
import { hash, type Actor } from './security';
import { invariant } from './errors';
import { isSedimentItem, itemInput, itemPatch, sedimentAfterMs } from '../../packages/core/src';
import { boundPosition, quadrantAt } from '../../packages/core/src/orbit-position';
export const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));
export async function mutation<T>(
  actor: Actor,
  key: string | null,
  payload: unknown,
  run: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  invariant(key && key.length <= 160, 400, '写入需要 Idempotency-Key（最多 160 字符）');
  const fingerprint = hash(JSON.stringify(payload));
  const where = {
    workspaceId_actorId_key: { workspaceId: actor.workspaceId, actorId: actor.id, key },
  };
  const existing = await db.mutationReceipt.findUnique({ where });
  if (existing) {
    invariant(existing.fingerprint === fingerprint, 409, '幂等键已用于不同请求');
    return existing.response as T;
  }
  try {
    return await db.$transaction(
      async (tx) => {
        const result = await run(tx);
        await tx.mutationReceipt.create({
          data: {
            workspaceId: actor.workspaceId,
            actorId: actor.id,
            key,
            fingerprint,
            response: json(result),
          },
        });
        return result;
      },
      { timeout: 15000 },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const receipt = await db.mutationReceipt.findUnique({ where });
      if (receipt) {
        invariant(receipt.fingerprint === fingerprint, 409, '幂等键已用于不同请求');
        return receipt.response as T;
      }
    }
    throw error;
  }
}
export async function itemInSpace(tx: Prisma.TransactionClient, id: string, workspaceId: string) {
  const item = await tx.item.findFirst({ where: { id, workspaceId } });
  invariant(item, 404, '事项不存在');
  return item;
}
async function validateLinks(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  projectId?: string | null,
  parentId?: string | null,
) {
  if (projectId)
    invariant(
      await tx.project.findFirst({ where: { id: projectId, workspaceId } }),
      404,
      '项目不存在',
    );
  if (parentId) {
    const parent = await itemInSpace(tx, parentId, workspaceId);
    invariant(
      !parent.parentId && !parent.archivedAt && !parent.deletedAt,
      400,
      '子事项只支持一级，且主事项不能已归档或删除',
    );
  }
}
export async function createItem(
  tx: Prisma.TransactionClient,
  actor: Actor,
  input: unknown,
  source = 'manual',
) {
  const data = itemInput.parse(input);
  await validateLinks(tx, actor.workspaceId, data.projectId, data.parentId);
  const { reminderAt, ...fields } = data;
  const item = await tx.item.create({
    data: { ...fields, workspaceId: actor.workspaceId, source },
  });
  await tx.itemEvent.create({
    data: {
      workspaceId: actor.workspaceId,
      itemId: item.id,
      actorId: actor.id,
      type: 'created',
      data: json(item),
    },
  });
  if (reminderAt)
    await tx.reminder.create({
      data: { workspaceId: actor.workspaceId, itemId: item.id, scheduledAt: new Date(reminderAt) },
    });
  return item;
}
export async function updateItem(
  tx: Prisma.TransactionClient,
  actor: Actor,
  id: string,
  input: unknown,
) {
  const patch = itemPatch.parse(input);
  const before = await itemInSpace(tx, id, actor.workspaceId);
  invariant(!before.deletedAt, 409, '事项已删除，请先恢复');
  invariant(before.version === patch.version, 409, '事项已被更新，请刷新后再修改');
  if (patch.parentId) invariant(patch.parentId !== id, 400, '事项不能作为自己的子事项');
  await validateLinks(tx, actor.workspaceId, patch.projectId, patch.parentId);
  if (patch.parentId)
    invariant(
      (await tx.item.count({ where: { parentId: id } })) === 0,
      400,
      '包含子事项的事项不能移动到另一事项下',
    );
  const { version, archived, reminderAt, position, ...fields } = patch;
  const positionOnly =
    position !== undefined &&
    archived === undefined &&
    reminderAt === undefined &&
    Object.keys(fields).length === 0;
  const point = position ? boundPosition(position) : null;
  if (point && fields.quadrant !== undefined)
    invariant(fields.quadrant === quadrantAt(point), 400, '坐标与象限不一致');
  const resetsPosition =
    (fields.quadrant !== undefined && fields.quadrant !== before.quadrant) ||
    (fields.dueAt !== undefined && fields.dueAt !== before.dueAt?.toISOString());
  const data = {
    ...fields,
    ...(point
      ? { quadrant: quadrantAt(point), orbitX: point.x, orbitY: point.y, orbitPlacedAt: new Date() }
      : resetsPosition
        ? { orbitX: null, orbitY: null, orbitPlacedAt: null }
        : {}),
    version: { increment: 1 },
    ...(archived !== undefined ? { archivedAt: archived ? new Date() : null } : {}),
    ...(fields.status
      ? { completedAt: fields.status === 'done' ? before.completedAt || new Date() : null }
      : {}),
  };
  const updated = await tx.item.updateMany({
    where: { id, workspaceId: actor.workspaceId, version },
    data,
  });
  invariant(updated.count === 1, 409, '事项已被更新，请刷新后再修改');
  const item = await tx.item.findUniqueOrThrow({ where: { id } });
  await tx.itemEvent.create({
    data: {
      workspaceId: actor.workspaceId,
      itemId: id,
      actorId: actor.id,
      type: archived
        ? 'archived'
        : archived === false
          ? 'restored'
          : fields.status === 'done'
            ? 'completed'
            : before.status === 'done' && fields.status
              ? 'reopened'
              : positionOnly
                ? 'positioned'
                : 'updated',
      data: json({ before, after: item }),
    },
  });
  if (reminderAt !== undefined || fields.status === 'done' || archived) {
    await tx.reminder.updateMany({
      where: { itemId: id, workspaceId: actor.workspaceId, status: 'pending' },
      data: { status: 'cancelled' },
    });
    if (reminderAt && item.status !== 'done' && !item.archivedAt)
      await tx.reminder.create({
        data: { workspaceId: actor.workspaceId, itemId: id, scheduledAt: new Date(reminderAt) },
      });
  }
  return item;
}
export async function signals(workspaceId: string) {
  const items = await db.item.findMany({
    where: { workspaceId, status: { not: 'done' }, archivedAt: null, deletedAt: null },
    include: { project: true },
    orderBy: { dueAt: 'asc' },
    take: 500,
  });
  const now = Date.now();
  return {
    overdue: items.filter((x) => x.dueAt && x.dueAt.getTime() < now),
    forgotten: items.filter((x) => now - x.updatedAt.getTime() > 7 * 864e5),
    next: items
      .filter((x) => [1, 2].includes(x.quadrant))
      .sort((a, b) => a.quadrant - b.quadrant)
      .slice(0, 3),
  };
}

export async function bulkRescheduleItems(
  tx: Prisma.TransactionClient,
  actor: Actor,
  entries: { id: string; version: number }[],
  dueAt: string,
  now = new Date(),
) {
  const ids = entries.map((entry) => entry.id);
  invariant(new Set(ids).size === ids.length, 400, '批量事项不能重复');
  invariant(new Date(dueAt).getTime() > now.getTime(), 400, '新的截止时间必须晚于当前时间');
  const items = await tx.item.findMany({
    where: { id: { in: ids }, workspaceId: actor.workspaceId },
  });
  invariant(items.length === entries.length, 404, '部分事项不存在');
  const versions = new Map(entries.map((entry) => [entry.id, entry.version]));
  invariant(
    items.every((item) => item.version === versions.get(item.id) && isSedimentItem(item, now)),
    409,
    '沉积事项已发生变化，请刷新后重试',
  );
  const updated = [];
  for (const item of items)
    updated.push(
      await updateItem(tx, actor, item.id, {
        version: item.version,
        dueAt,
      }),
    );
  return { items: updated, thresholdAt: new Date(now.getTime() - sedimentAfterMs).toISOString() };
}

// Deletion is a separate lifecycle state. Events and report references remain intact.
export async function setItemDeleted(
  tx: Prisma.TransactionClient,
  actor: Actor,
  id: string,
  version: number,
  deleted: boolean,
) {
  const before = await itemInSpace(tx, id, actor.workspaceId);
  invariant(before.version === version, 409, '事项已被更新，请刷新后再修改');
  invariant(Boolean(before.deletedAt) !== deleted, 409, deleted ? '事项已删除' : '事项未被删除');
  if (!deleted && before.parentId) {
    const parent = await itemInSpace(tx, before.parentId, actor.workspaceId);
    invariant(!parent.deletedAt, 409, '请先恢复主事项');
  }
  const changed = await tx.item.updateMany({
    where: { id, workspaceId: actor.workspaceId, version },
    data: { deletedAt: deleted ? new Date() : null, version: { increment: 1 } },
  });
  invariant(changed.count === 1, 409, '事项已被更新，请刷新后再修改');
  const item = await tx.item.findUniqueOrThrow({ where: { id } });
  const children = await tx.item.findMany({
    where: {
      workspaceId: actor.workspaceId,
      parentId: id,
      deletedAt: deleted ? null : before.deletedAt,
    },
  });
  for (const child of children) {
    const updated = await tx.item.updateMany({
      where: { id: child.id, workspaceId: actor.workspaceId, version: child.version },
      data: { deletedAt: item.deletedAt, version: { increment: 1 } },
    });
    invariant(updated.count === 1, 409, '子事项已被更新，请重试');
    await tx.itemEvent.create({
      data: {
        workspaceId: actor.workspaceId,
        itemId: child.id,
        actorId: actor.id,
        type: deleted ? 'deleted' : 'undeleted',
        data: json({ before: child, parentId: id, deletedAt: item.deletedAt }),
      },
    });
  }
  await tx.itemEvent.create({
    data: {
      workspaceId: actor.workspaceId,
      itemId: id,
      actorId: actor.id,
      type: deleted ? 'deleted' : 'undeleted',
      data: json({ before, after: item }),
    },
  });
  const affectedIds = [id, ...children.map((child) => child.id)];
  if (deleted) {
    await tx.reminder.updateMany({
      where: { workspaceId: actor.workspaceId, itemId: { in: affectedIds }, status: 'pending' },
      data: { status: 'cancelled' },
    });
    await tx.notification.updateMany({
      where: { workspaceId: actor.workspaceId, itemId: { in: affectedIds }, readAt: null },
      data: { readAt: new Date() },
    });
  }
  return { item, affectedIds };
}
