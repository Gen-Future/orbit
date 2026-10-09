import { z } from 'zod';
import { localParts, zonedInstant, isPositionOnlyEvent, triageStatuses } from './index';
export function dateInZone(date: Date, zone: string) {
  const p = localParts(date, zone);
  return `${p.year}-${p.month}-${p.day}`;
}
export function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function reportWeek(zone: string, anchor = dateInZone(new Date(), zone)) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(anchor) ||
    isNaN(Date.parse(`${anchor}T12:00:00Z`)) ||
    new Date(`${anchor}T12:00:00Z`).toISOString().slice(0, 10) !== anchor
  )
    throw new Error('日期无效');
  const weekday = new Date(`${anchor}T12:00:00Z`).getUTCDay();
  const startDate = shiftDate(anchor, -(weekday + 6) % 7);
  const endDate = shiftDate(startDate, 7);
  return {
    startDate,
    endDate,
    startAt: zonedInstant(startDate, '00:00', zone),
    endAt: zonedInstant(endDate, '00:00', zone),
  };
}
export function isReportProgress(event: { type: string; data?: unknown }) {
  if (['created', 'completed', 'reopened'].includes(event.type)) return true;
  if (event.type !== 'updated') return false;
  const data = event.data as
    | { before?: Record<string, unknown>; after?: Record<string, unknown> }
    | undefined;
  if (
    isPositionOnlyEvent(event) &&
    data?.before &&
    data.after &&
    ['orbitX', 'orbitY', 'orbitPlacedAt'].some((key) => data.before![key] !== data.after![key])
  )
    return false;
  return Boolean(
    data?.before &&
    data.after &&
    ['title', 'notes', 'projectId', 'quadrant', 'status'].some(
      (key) => data.before![key] !== data.after![key],
    ),
  );
}
export const reportDefinitionSchema = z.object({
  name: z.string().min(1).max(80),
  skeleton: z.string().min(1).max(8000),
  tone: z.string().max(1500),
  length: z.string().max(500),
  formatting: z.string().max(1500),
  avoid: z.string().max(1500),
});
export type ReportDefinition = z.infer<typeof reportDefinitionSchema>;
export const standardReportDefinition: ReportDefinition = {
  name: 'Orbit 行动周报',
  skeleton:
    '# 本周工作\n\n## 本周成果\n{{completed}}\n\n## 推进与阻塞\n{{progress}}\n\n## 下周计划\n{{next}}',
  tone: '简洁、具体、第一人称。按项目分组，只写有事实支持的行动。',
  length: '每条 1–2 句，避免冗长背景。',
  formatting: 'Markdown 标题和项目符号，保留成果来源。',
  avoid: '不编造业绩数字、耗时、客户、结果和主观评价。',
};
export type ReportSource = {
  id: string;
  title: string;
  notes: string;
  status: string;
  quadrant: number;
  version: number;
  projectId: string | null;
  project: { name: string; color: string } | null;
  occurredAt: string;
  completedAt: string | null;
  archivedAt: string | null;
  dueAt: string | null;
  progressAt: string | null;
  progressTypes: string[];
  supplemental: boolean;
};
export type FoundryReport = {
  id: string;
  content: string;
  startAt: string;
  endAt: string;
  sourceIds: string[];
  authorId?: string | null;
  version: number;
  generatedContent?: string | null;
  generationMode: string;
  templateId?: string | null;
  templateVersion?: number | null;
  sourceSnapshot?: ReportSource[] | null;
  styleSuggestion?: {
    definition: ReportDefinition;
    reason: string;
    templateVersion: number;
  } | null;
  suggestionStatus: string;
  planBatchId?: string | null;
  createdAt: string;
};
export type PersonalReportTemplate = { id: string; version: number; definition: ReportDefinition };
export type ReportDay = {
  date: string;
  kind: 'workday' | 'weekend' | 'holiday' | 'makeup';
  name: string;
  count: number;
};
export type ReportContext = ReturnType<typeof reportWeek> & {
  days: ReportDay[];
  calendar: { status: 'fresh' | 'cached' | 'fallback'; syncedAt: string | null; papers: string[] };
  template: PersonalReportTemplate | null;
  candidates: ReportSource[];
  total: number;
};
export const reportPlanSchema = z.object({
  title: z.string().min(1).max(300),
  notes: z.string().max(10000).default(''),
  quadrant: z.number().int().min(1).max(4).default(2),
  triageStatus: z.enum(triageStatuses).default('triaged'),
  dueAt: z.string().datetime({ offset: true }).nullable().default(null),
});
export type ReportPlan = z.infer<typeof reportPlanSchema>;
export const reportSectionsSchema = z.object({
  sections: z
    .array(
      z.object({
        heading: z.string().min(1).max(100),
        level: z.number().int().min(1).max(6).default(2),
        listStyle: z.enum(['bullet', 'numbered', 'paragraph']).default('bullet'),
        entries: z
          .array(
            z.object({
              text: z.string().min(1).max(2000),
              itemIds: z.array(z.string()).min(1).max(200),
              evidence: z
                .array(z.object({ itemId: z.string(), quote: z.string().min(1).max(2000) }))
                .min(1),
            }),
          )
          .max(200),
      }),
    )
    .min(1)
    .max(12),
});
export function validReportSections(value: unknown, facts: ReportSource[]) {
  const result = reportSectionsSchema.safeParse(value);
  if (!result.success) return null;
  const map = new Map(facts.map((f) => [f.id, `${f.title}\n${f.notes}`]));
  for (const section of result.data.sections)
    for (const entry of section.entries) {
      if (
        !entry.itemIds.every((id) => map.has(id)) ||
        !entry.itemIds.every((id) => entry.evidence.some((e) => e.itemId === id)) ||
        !entry.evidence.every(
          (e) => entry.itemIds.includes(e.itemId) && map.get(e.itemId)?.includes(e.quote),
        )
      )
        return null;
      const evidence = entry.itemIds.map((id) => map.get(id)).join('\n');
      if (
        (entry.text.match(/\d+(?:[.,]\d+)*%?/g) || []).some((number) => !evidence.includes(number))
      )
        return null;
    }
  return result.data;
}

export function reportPlanText(content: string) {
  let active = false,
    level = 0;
  const output: string[] = [];
  for (const line of content.split('\n')) {
    const heading = line.match(/^(#{1,6})\s+(.+)/);
    if (heading) {
      if (/下周|下一周|下一步|后续|next week/i.test(heading[2])) {
        active = true;
        level = heading[1].length;
      } else if (heading[1].length <= level) active = false;
    }
    if (active) output.push(line);
  }
  return output.join('\n');
}
