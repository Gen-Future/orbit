import { db } from './db';
import { inQuietHours, localParts } from '../../packages/core/src';
import nodemailer from 'nodemailer';
import webpush from 'web-push';
export async function scanNotifications(now = new Date()) {
  const workspaces = await db.workspace.findMany({
    include: { memberships: { include: { user: true } }, preferences: true },
  });
  for (const space of workspaces) {
    const due = await db.reminder.findMany({
      where: { workspaceId: space.id, status: 'pending', scheduledAt: { lte: now } },
      include: { item: true },
      take: 200,
    });
    const forgotten = await db.item.findMany({
      where: {
        workspaceId: space.id,
        status: { not: 'done' },
        archivedAt: null,
        deletedAt: null,
        updatedAt: { lt: new Date(now.getTime() - 7 * 864e5) },
      },
      take: 10,
      orderBy: { updatedAt: 'asc' },
    });
    const overdue = await db.item.findMany({
      where: {
        workspaceId: space.id,
        status: { not: 'done' },
        archivedAt: null,
        deletedAt: null,
        dueAt: { lt: now },
      },
      take: 10,
      orderBy: { dueAt: 'asc' },
    });
    const p = localParts(now, space.timezone);
    const day = `${p.year}-${p.month}-${p.day}`;
    for (const membership of space.memberships) {
      const preference = space.preferences.find((x) => x.userId === membership.userId);
      const add = async (key: string, title: string, body: string, itemId?: string) =>
        db.notification.upsert({
          where: {
            userId_dedupeKey: { userId: membership.userId, dedupeKey: `${space.id}:${key}` },
          },
          create: {
            workspaceId: space.id,
            userId: membership.userId,
            dedupeKey: `${space.id}:${key}`,
            title,
            body,
            itemId,
          },
          update: {},
        });
      for (const reminder of due)
        if (
          reminder.item.status !== 'done' &&
          !reminder.item.archivedAt &&
          !reminder.item.deletedAt
        )
          await add(
            `reminder:${reminder.id}`,
            '到了约定的时间',
            reminder.item.title,
            reminder.itemId,
          );
      if (
        Number(p.hour) >= (preference?.morningHour ?? 9) &&
        (preference?.morningEnabled ?? true)
      ) {
        const next = await db.item.findMany({
          where: {
            workspaceId: space.id,
            archivedAt: null,
            deletedAt: null,
            status: { not: 'done' },
            quadrant: { in: [1, 2] },
          },
          orderBy: [{ quadrant: 'asc' }, { dueAt: 'asc' }],
          take: 3,
        });
        if (next.length)
          await add(`morning:${day}`, '今天，从重要的事开始', next.map((x) => x.title).join(' · '));
      }
      for (const item of [
        ...new Map([...overdue, ...forgotten].map((x) => [x.id, x])).values(),
      ].slice(0, 5))
        await add(
          `signal:${day}:${item.id}`,
          item.dueAt && item.dueAt < now ? '一件事需要重新安排' : '它还在等你的下一步',
          item.title,
          item.id,
        );
    }
    await db.reminder.updateMany({
      where: { id: { in: due.map((r) => r.id) } },
      data: { status: 'sent', sentAt: now },
    });
  }
  await db.rateBucket.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - 864e5) } } });
  await db.session.deleteMany({ where: { expiresAt: { lt: now } } });
}
export async function deliverNotifications(now = new Date()) {
  const rows = await db.notification.findMany({
    where: {
      attempts: { lt: 5 },
      readAt: null,
      nextAttemptAt: { lte: now },
      createdAt: { gte: new Date(now.getTime() - 2 * 864e5) },
    },
    include: { user: { include: { subscriptions: true } }, workspace: true },
    take: 100,
  });
  for (const notification of rows) {
    if (notification.itemId) {
      const actionable = await db.item.findFirst({
        where: {
          id: notification.itemId,
          workspaceId: notification.workspaceId,
          status: { not: 'done' },
          archivedAt: null,
          deletedAt: null,
        },
      });
      if (!actionable) {
        await db.notification.update({
          where: { id: notification.id },
          data: { nextAttemptAt: new Date(now.getTime() + 3 * 864e5), lastError: null },
        });
        continue;
      }
    }
    const pref = await db.notificationPreference.findUnique({
      where: {
        workspaceId_userId: { workspaceId: notification.workspaceId, userId: notification.userId },
      },
    });
    if (!pref) continue;
    const local = localParts(now, notification.workspace.timezone);
    if (
      (pref.pausedUntil && pref.pausedUntil > now) ||
      inQuietHours(Number(local.hour), pref.quietStart, pref.quietEnd)
    ) {
      await db.notification.update({
        where: { id: notification.id },
        data: { nextAttemptAt: new Date(now.getTime() + 15 * 60000) },
      });
      continue;
    }
    const sent = await db.notification.findMany({
      where: {
        userId: notification.userId,
        workspaceId: notification.workspaceId,
        id: { not: notification.id },
        OR: [
          { emailSentAt: { gte: new Date(now.getTime() - 48 * 36e5) } },
          { pushSentAt: { gte: new Date(now.getTime() - 48 * 36e5) } },
        ],
      },
      select: { emailSentAt: true, pushSentAt: true },
    });
    const day = (d: Date) => {
      const p = localParts(d, notification.workspace.timezone);
      return `${p.year}-${p.month}-${p.day}`;
    };
    if (
      sent.filter((x) => [x.emailSentAt, x.pushSentAt].some((d) => d && day(d) === day(now)))
        .length >= pref.dailyLimit
    ) {
      await db.notification.update({
        where: { id: notification.id },
        data: { nextAttemptAt: new Date(now.getTime() + 3600000) },
      });
      continue;
    }
    const url = `${process.env.APP_URL || 'http://localhost:3000'}/?workspace=${notification.workspaceId}${notification.itemId ? `&item=${notification.itemId}` : ''}`;
    try {
      if (pref.emailEnabled && !notification.emailSentAt) {
        if (!process.env.SMTP_HOST) throw new Error('SMTP 未配置');
        const transport = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT || 587),
          secure: process.env.SMTP_SECURE === 'true',
          ...(process.env.SMTP_USER
            ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } }
            : {}),
        });
        await transport.sendMail({
          from: process.env.SMTP_FROM,
          to: notification.user.email,
          subject: `Orbit · ${notification.title}`,
          text: `${notification.body}\n\n${url}`,
          messageId: `<${notification.id}@orbit.local>`,
        });
        await db.notification.update({
          where: { id: notification.id },
          data: { emailSentAt: now },
        });
      }
      if (pref.pushEnabled && !notification.pushSentAt) {
        if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY)
          throw new Error('Web Push 未配置');
        webpush.setVapidDetails(
          process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
          process.env.VAPID_PUBLIC_KEY,
          process.env.VAPID_PRIVATE_KEY,
        );
        for (const sub of notification.user.subscriptions) {
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: sub.keys as { auth: string; p256dh: string } },
              JSON.stringify({
                title: notification.title,
                body: notification.body,
                url,
                tag: notification.id,
              }),
              { TTL: 3600, timeout: 10000 },
            );
          } catch (error) {
            const status = (error as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410)
              await db.pushSubscription.delete({ where: { id: sub.id } });
            else throw error;
          }
        }
        await db.notification.update({ where: { id: notification.id }, data: { pushSentAt: now } });
      }
      await db.notification.update({
        where: { id: notification.id },
        data: { nextAttemptAt: new Date(now.getTime() + 864e5), lastError: null },
      });
    } catch {
      await db.notification.update({
        where: { id: notification.id },
        data: {
          attempts: { increment: 1 },
          lastError: '外部通知投递失败；应用内消息仍可查看',
          nextAttemptAt: new Date(now.getTime() + Math.pow(2, notification.attempts) * 60000),
        },
      });
    }
  }
}
