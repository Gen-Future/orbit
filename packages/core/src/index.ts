import { z } from 'zod';
export const roles = ['owner', 'admin', 'member', 'viewer'] as const;
export const scopes = [
  'items.read',
  'items.write',
  'projects.read',
  'projects.write',
  'events.read',
  'reports.read',
  'reports.write',
  'ai.run',
] as const;
export type Role = (typeof roles)[number];
export type Scope = (typeof scopes)[number];
export const quadrantNames = ['', '重要且紧急', '重要不紧急', '紧急不重要', '不紧急不重要'];
export const triageStatuses = ['pending', 'triaged'] as const;
export type InboxCandidate = {
  triageStatus?: string;
  status: string;
  archivedAt?: string | Date | null;
  deletedAt?: string | Date | null;
};
export function isInboxItem(item: InboxCandidate) {
  return (
    item.triageStatus === 'pending' && item.status !== 'done' && !item.archivedAt && !item.deletedAt
  );
}
export const sedimentAfterMs = 7 * 24 * 60 * 60 * 1000;
export type SedimentCandidate = {
  dueAt: string | Date | null;
  status: string;
  quadrant: number;
  triageStatus?: string;
  archivedAt?: string | Date | null;
  deletedAt?: string | Date | null;
};
export function isSedimentItem(item: SedimentCandidate, now: number | Date) {
  if (
    !item.dueAt ||
    !['open', 'doing', 'blocked'].includes(item.status) ||
    item.quadrant < 1 ||
    item.quadrant > 4 ||
    item.triageStatus === 'pending' ||
    item.archivedAt ||
    item.deletedAt
  )
    return false;
  const nowMs = now instanceof Date ? now.getTime() : now;
  return new Date(item.dueAt).getTime() <= nowMs - sedimentAfterMs;
}
const positionEventFields = new Set([
  'quadrant',
  'orbitX',
  'orbitY',
  'orbitPlacedAt',
  'updatedAt',
  'version',
]);
export function isPositionOnlyEvent(event: { type: string; data?: unknown }) {
  if (event.type === 'positioned') return true;
  if (event.type !== 'updated' || !event.data || typeof event.data !== 'object') return false;
  const data = event.data as { before?: unknown; after?: unknown };
  if (
    !data.before ||
    !data.after ||
    typeof data.before !== 'object' ||
    typeof data.after !== 'object'
  )
    return false;
  const before = data.before as Record<string, unknown>;
  const after = data.after as Record<string, unknown>;
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  let moved = false;
  for (const key of keys) {
    if (JSON.stringify(before[key]) === JSON.stringify(after[key])) continue;
    if (!positionEventFields.has(key)) return false;
    if (['quadrant', 'orbitX', 'orbitY', 'orbitPlacedAt'].includes(key)) moved = true;
  }
  return moved;
}
export function can(role: string, scope: string) {
  return roles.includes(role as Role) && (role !== 'viewer' || scope.endsWith('.read'));
}
const instant = z.string().datetime({ offset: true });
export const itemInput = z
  .object({
    title: z.string().trim().min(1).max(240),
    notes: z.string().max(12000).default(''),
    quadrant: z.number().int().min(1).max(4).default(2),
    triageStatus: z.enum(triageStatuses).default('pending'),
    projectId: z.string().nullable().optional(),
    parentId: z.string().nullable().optional(),
    dueAt: instant.nullable().optional(),
    occurredAt: instant.optional(),
    reminderAt: instant.nullable().optional(),
  })
  .strict();
export const itemPatch = itemInput
  .partial()
  .extend({
    // Zod 4 applies nested defaults inside optional fields. PATCH must leave
    // omitted values untouched, including a star move that only sends position.
    notes: z.string().max(12000).optional(),
    quadrant: z.number().int().min(1).max(4).optional(),
    triageStatus: z.enum(triageStatuses).optional(),
    version: z.number().int().positive(),
    status: z.enum(['open', 'doing', 'blocked', 'done']).optional(),
    archived: z.boolean().optional(),
    position: z
      .object({
        x: z.number().finite().min(-1).max(1),
        y: z.number().finite().min(-1).max(1),
      })
      .strict()
      .optional(),
  })
  .strict();
export type CaptureDraft = {
  title: string;
  notes: string;
  quadrant: number;
  triageStatus: (typeof triageStatuses)[number];
  projectId?: string | null;
  dueAt?: string | null;
  reminderAt?: string | null;
  subtasks: string[];
};
export const draftSchema = itemInput
  .omit({ parentId: true, occurredAt: true })
  .extend({ subtasks: z.array(z.string().min(1).max(240)).max(12).default([]) });
export const aiDraftSchema = z
  .object({
    title: z.string().trim().min(1).max(240),
    notes: z.string().max(12000),
    quadrant: z.number().int().min(1).max(4),
    triageStatus: z.literal('triaged'),
    projectId: z.string().nullable(),
    dueAt: instant.nullable(),
    reminderAt: instant.nullable(),
    subtasks: z.array(z.string().trim().min(1).max(240)).max(12),
  })
  .strict()
  .superRefine((value, context) => {
    const unique = new Set(value.subtasks.map((title) => title.toLocaleLowerCase()));
    if (unique.size !== value.subtasks.length)
      context.addIssue({
        code: 'custom',
        path: ['subtasks'],
        message: '子事项不能重复',
      });
  });

export function captureTimingIssues(
  value: Pick<CaptureDraft, 'dueAt' | 'reminderAt'>,
  now = new Date(),
) {
  const issues: string[] = [];
  const due = value.dueAt ? Date.parse(value.dueAt) : null;
  const reminder = value.reminderAt ? Date.parse(value.reminderAt) : null;
  if (reminder !== null && reminder <= now.getTime()) issues.push('提醒时间必须晚于当前时间');
  if (reminder !== null && due !== null && reminder > due) issues.push('提醒时间不能晚于截止时间');
  return issues;
}
export const skills = [
  {
    id: 'capture-item',
    name: '意图捕捉',
    description: '把自然语言转为待确认事项',
    permissions: ['items.read', 'ai.run'],
    writes: false,
  },
  {
    id: 'classify-quadrant',
    name: '四象限整理',
    description: '根据重要性与紧急度建议象限',
    permissions: ['items.read', 'ai.run'],
    writes: false,
  },
  {
    id: 'break-down-task',
    name: '拆解下一步',
    description: '生成可编辑的子事项草稿',
    permissions: ['items.read', 'ai.run'],
    writes: false,
  },
  {
    id: 'weekly-report',
    name: '周报草稿',
    description: '用实际工作事件生成有来源的周报',
    permissions: ['items.read', 'events.read', 'reports.write', 'ai.run'],
    writes: true,
  },
  {
    id: 'detect-forgotten-items',
    name: '遗忘探测',
    description: '查找逾期与七天未处理事项',
    permissions: ['items.read'],
    writes: false,
  },
  {
    id: 'suggest-next-action',
    name: '下一步建议',
    description: '优先呈现重要与即将到期事项',
    permissions: ['items.read'],
    writes: false,
  },
  {
    id: 'project-recap',
    name: '项目回顾',
    description: '汇总项目事项与完成结果',
    permissions: ['items.read', 'ai.run'],
    writes: false,
  },
].map((s) => ({
  ...s,
  version: '1.0.0',
  triggers: ['manual'],
  streaming: false,
  inputSchema:
    s.id === 'weekly-report'
      ? {
          type: 'object',
          required: ['startAt', 'endAt'],
          properties: {
            startAt: { type: 'string', format: 'date-time' },
            endAt: { type: 'string', format: 'date-time' },
            sourceIds: { type: 'array', maxItems: 200, items: { type: 'string' } },
            templateId: { type: 'string' },
            templateVersion: { type: 'integer', minimum: 1 },
          },
        }
      : s.id === 'project-recap'
        ? {
            type: 'object',
            required: ['projectId'],
            properties: { projectId: { type: 'string' } },
          }
        : {
            type: 'object',
            properties: {
              text: { type: 'string' },
              itemId: { type: 'string' },
              projectId: { type: 'string' },
            },
          },
  outputSchema: ['capture-item', 'classify-quadrant', 'break-down-task'].includes(s.id)
    ? {
        type: 'object',
        required: ['draft', 'mode', 'jobId', 'message'],
        properties: {
          draft: z.toJSONSchema(draftSchema),
          mode: { enum: ['ai', 'rules'] },
          jobId: { type: 'string' },
          message: { type: 'string' },
        },
      }
    : s.id === 'weekly-report'
      ? {
          type: 'object',
          required: ['id', 'content', 'startAt', 'endAt', 'sourceIds'],
          properties: {
            id: { type: 'string' },
            content: { type: 'string' },
            startAt: { type: 'string', format: 'date-time' },
            endAt: { type: 'string', format: 'date-time' },
            sourceIds: { type: 'array', items: { type: 'string' } },
          },
        }
      : s.id === 'project-recap'
        ? {
            type: 'object',
            required: ['project', 'completed', 'pending', 'sourceIds'],
            properties: {
              project: { type: 'object' },
              completed: { type: 'array', items: { type: 'object' } },
              pending: { type: 'array', items: { type: 'object' } },
              sourceIds: { type: 'array', items: { type: 'string' } },
            },
          }
        : {
            type: 'object',
            required: ['overdue', 'forgotten', 'next'],
            properties: {
              overdue: { type: 'array', items: { type: 'object' } },
              forgotten: { type: 'array', items: { type: 'object' } },
              next: { type: 'array', items: { type: 'object' } },
            },
          },
  confirmation: s.writes ? 'Creates report draft only; never sends messages' : 'Preview only',
}));
export function inQuietHours(hour: number, start: number, end: number) {
  return start === end
    ? false
    : start < end
      ? hour >= start && hour < end
      : hour >= start || hour < end;
}
export function localParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.map((p) => [p.type, p.value]));
}
export function zonedInstant(day: string, time: string, zone: string) {
  const target = Date.parse(`${day}T${time}:00Z`);
  let guess = target;
  for (let i = 0; i < 3; i++) {
    const p = localParts(new Date(guess), zone);
    const local = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`);
    guess += target - local;
  }
  const p = localParts(new Date(guess), zone);
  if (`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}` !== `${day}T${time}`)
    throw new Error('该本地时间不存在，请选择其他时间');
  return new Date(guess).toISOString();
}
export type QuickDeadline = 'today' | 'three-days' | 'this-week' | 'this-month';
export function quickDeadline(kind: QuickDeadline, zone: string, now = new Date()) {
  const local = localParts(now, zone);
  const year = Number(local.year);
  const month = Number(local.month);
  const date = Number(local.day);
  const hour = Number(local.hour);
  let target = new Date(Date.UTC(year, month - 1, date));
  let targetHour = 18;
  if (kind === 'today') {
    targetHour = hour >= 18 ? Math.min(23, hour + 1) : 18;
  } else if (kind === 'three-days') {
    target.setUTCDate(target.getUTCDate() + 3);
  } else if (kind === 'this-week') {
    const weekday = target.getUTCDay();
    let daysUntilFriday = (5 - weekday + 7) % 7;
    if (daysUntilFriday === 0 && hour >= 18) daysUntilFriday = 7;
    target.setUTCDate(target.getUTCDate() + daysUntilFriday);
  } else {
    target = new Date(Date.UTC(year, month, 0));
    if (target.getUTCDate() === date && hour >= 18) targetHour = Math.min(23, hour + 1);
  }
  const day = [
    target.getUTCFullYear(),
    String(target.getUTCMonth() + 1).padStart(2, '0'),
    String(target.getUTCDate()).padStart(2, '0'),
  ].join('-');
  return zonedInstant(day, `${String(targetHour).padStart(2, '0')}:00`, zone);
}
export function simpleDraft(text: string, zone: string, now = new Date()): CaptureDraft {
  const originalTitle = text
    .trim()
    .split(/[。\n]/)[0]
    .slice(0, 240);
  const title =
    originalTitle
      .replace(
        /^(?:请|麻烦)?\s*(?:帮我)?\s*(?:记下|记录(?:一下)?|添加(?:一个)?事项)\s*[，,:：]?\s*/u,
        '',
      )
      .replace(
        /^(?:今天|明天|后天|下周[一二三四五六日天]?|周[一二三四五六日天])(?:上午|中午|下午|晚上)?\s*(?:[一二三四五六七八九十两\d]{1,3}(?:点|[:：]\d{2}))?\s*(?:前|之前)?\s*[，,:：]?\s*/u,
        '',
      )
      .replace(/^(?:请)?\s*提醒我\s*[，,:：]?\s*/u, '')
      .trim()
      .slice(0, 240) || originalTitle;
  const p = localParts(now, zone);
  let date = new Date(`${p.year}-${p.month}-${p.day}T00:00:00Z`);
  let hasDate = false;
  if (/明天|后天|今天/.test(text)) {
    date.setUTCDate(date.getUTCDate() + (/后天/.test(text) ? 2 : /明天/.test(text) ? 1 : 0));
    hasDate = true;
  }
  const weekday = text.match(/(下周|周)([一二三四五六日天])/);
  if (weekday) {
    const day = '一二三四五六日'.indexOf(weekday[2].replace('天', '日'));
    const current = (date.getUTCDay() + 6) % 7;
    date.setUTCDate(
      date.getUTCDate() + day - current + (weekday[1] === '下周' ? 7 : day < current ? 7 : 0),
    );
    hasDate = true;
  }
  const normalized = text.replace(/[一二三四五六七八九十两]{1,3}(?=点)/g, (value) => {
    const digits: Record<string, number> = {
      一: 1,
      二: 2,
      两: 2,
      三: 3,
      四: 4,
      五: 5,
      六: 6,
      七: 7,
      八: 8,
      九: 9,
    };
    if (value.includes('十')) {
      const [a, b] = value.split('十');
      return String((a ? digits[a] : 1) * 10 + (b ? digits[b] : 0));
    }
    return String(digits[value] || value);
  });
  const time = normalized.match(/(上午|下午|晚上)?\s*(\d{1,2})(?:[:：](\d{2})|点)/);
  let hour = time ? Number(time[2]) : 18;
  if (time && /下午|晚上/.test(time[1] || '') && hour < 12) hour += 12;
  const dueAt =
    hasDate && hour < 24
      ? zonedInstant(
          date.toISOString().slice(0, 10),
          `${String(hour).padStart(2, '0')}:${time?.[3] || '00'}`,
          zone,
        )
      : null;
  const important = !/不重要/.test(text) && /重要|核心|关键|发布|上线|方案/.test(text),
    urgent = !/不紧急/.test(text) && /紧急|马上|今天|立即/.test(text);
  return {
    title,
    notes: text.trim() === title ? '' : text,
    quadrant: important
      ? urgent
        ? 1
        : 2
      : urgent
        ? 3
        : /不重要/.test(text) && /不紧急/.test(text)
          ? 4
          : 2,
    triageStatus:
      important || urgent || (/不重要/.test(text) && /不紧急/.test(text)) ? 'triaged' : 'pending',
    dueAt,
    reminderAt: /提醒/.test(text) ? dueAt : null,
    subtasks: [],
  };
}
