import { z } from 'zod';
import { db } from './db';
import { hash } from './security';
import { json } from './items';
import { shiftDate, type ReportDay } from '../../packages/core/src/reports';
const holidaysSchema = z.object({
  year: z.number().int(),
  papers: z.array(z.string().url()),
  days: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        name: z.string().max(200),
        isOffDay: z.boolean(),
      }),
    )
    .max(500),
});
const inflight = new Map<number, Promise<unknown>>();
const failedAt = new Map<number, number>();
export async function syncCalendar(year: number, force = false) {
  const cached = await db.calendarCache.findUnique({ where: { year } });
  if (!force && cached && Date.now() - cached.syncedAt.getTime() < 864e5) return cached;
  if (!force && Date.now() - (failedAt.get(year) || 0) < 3600000) return cached;
  if (inflight.has(year)) {
    await inflight.get(year);
    return db.calendarCache.findUnique({ where: { year } });
  }
  const task = (async () => {
    try {
      const response = await fetch(
        `https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/${year}.json`,
        { signal: AbortSignal.timeout(4000), cache: 'no-store' },
      );
      if (!response.ok) {
        failedAt.set(year, Date.now());
        return cached;
      }
      const data = holidaysSchema.parse(await response.json());
      if (
        data.year !== year ||
        !data.papers.length ||
        data.papers.some((p) => {
          const h = new URL(p).hostname;
          return h !== 'gov.cn' && !h.endsWith('.gov.cn');
        })
      )
        return cached;
      return await db.calendarCache.upsert({
        where: { year },
        create: {
          year,
          days: json(data.days),
          papers: data.papers,
          checksum: hash(JSON.stringify(data)),
        },
        update: {
          days: json(data.days),
          papers: data.papers,
          checksum: hash(JSON.stringify(data)),
          syncedAt: new Date(),
        },
      });
    } catch {
      failedAt.set(year, Date.now());
      return cached;
    }
  })();
  inflight.set(year, task);
  try {
    return await task;
  } finally {
    inflight.delete(year);
  }
}
export async function weekCalendar(start: string) {
  const dates = Array.from({ length: 7 }, (_, i) => shiftDate(start, i));
  const years = [
    ...new Set(dates.flatMap((d) => [Number(d.slice(0, 4)), Number(d.slice(0, 4)) + 1])),
  ];
  const caches = await Promise.all(years.map((y) => syncCalendar(y)));
  const overrides = new Map<string, { name: string; isOffDay: boolean }>();
  for (const cache of caches)
    if (cache)
      for (const day of cache.days as { date: string; name: string; isOffDay: boolean }[])
        overrides.set(day.date, day);
  const required = [...new Set(dates.map((d) => Number(d.slice(0, 4))))];
  const available = caches.filter((c) => c && required.includes(c.year));
  const status =
    available.length < required.length
      ? 'fallback'
      : available.some((c) => c && Date.now() - c.syncedAt.getTime() >= 864e5)
        ? 'cached'
        : 'fresh';
  return {
    days: dates.map((date) => {
      const override = overrides.get(date);
      const weekend = [0, 6].includes(new Date(`${date}T12:00:00Z`).getUTCDay());
      const kind: ReportDay['kind'] = override
        ? override.isOffDay
          ? 'holiday'
          : 'makeup'
        : weekend
          ? 'weekend'
          : 'workday';
      return { date, kind, name: override?.name || (weekend ? '周末' : '工作日'), count: 0 };
    }),
    calendar: {
      status,
      syncedAt: available[0]?.syncedAt.toISOString() || null,
      papers: [...new Set(caches.flatMap((c) => c?.papers || []))],
    },
  };
}
