import { z } from 'zod';
import { aiDraftSchema, draftSchema, simpleDraft, type CaptureDraft } from './index';

export const captureBatchSchema = z
  .object({
    drafts: z
      .array(
        aiDraftSchema.safeExtend({
          classificationReason: z.string().max(240).optional(),
          clarification: z.string().max(240).optional(),
        }),
      )
      .min(1)
      .max(12),
  })
  .strict();

export type CaptureInsight = {
  classificationReason: string;
  clarification: string;
  similar: { id: string; title: string; version: number }[];
};
export const capturePreferenceSchema = z
  .object({
    enabled: z.boolean(),
    instructions: z.string().trim().max(2000),
    reminderMinutes: z.number().int().min(0).max(10080),
    proactiveEnabled: z.boolean(),
  })
  .strict();
export type CapturePreference = z.infer<typeof capturePreferenceSchema>;
export const defaultCapturePreference: CapturePreference = {
  enabled: false,
  instructions: '',
  reminderMinutes: 0,
  proactiveEnabled: false,
};

export function withCapturePreference(
  draft: CaptureDraft,
  preference: CapturePreference | null,
  now = Date.now(),
): CaptureDraft {
  if (!preference?.enabled || !preference.reminderMinutes || draft.reminderAt || !draft.dueAt)
    return draft;
  const reminder = Date.parse(draft.dueAt) - preference.reminderMinutes * 60000;
  return reminder > now ? { ...draft, reminderAt: new Date(reminder).toISOString() } : draft;
}

export function nextActionSuggestion(
  items: {
    id: string;
    title: string;
    status: string;
    updatedAt: Date | string;
    dueAt: Date | string | null;
  }[],
  now = new Date(),
) {
  const staleBlocked = items
    .filter(
      (item) =>
        item.status === 'blocked' &&
        now.getTime() - new Date(item.updatedAt).getTime() >= 3 * 864e5,
    )
    .sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime())[0];
  if (staleBlocked)
    return {
      itemId: staleBlocked.id,
      title: '可以跟进一下阻塞原因',
      body: `「${staleBlocked.title}」已阻塞至少三天，确认依赖是否已解决。`,
    };
  const overdue = items
    .filter(
      (item) =>
        item.status !== 'done' &&
        item.dueAt &&
        now.getTime() - new Date(item.dueAt).getTime() >= 7 * 864e5,
    )
    .sort((a, b) => new Date(a.dueAt!).getTime() - new Date(b.dueAt!).getTime())[0];
  if (overdue)
    return {
      itemId: overdue.id,
      title: '为一件旧事项做个决定',
      body: `「${overdue.title}」已逾期七天以上，可以改期、继续推进或归档。`,
    };
  return null;
}
export function ruleCaptureBatch(text: string, zone: string, now = new Date()): CaptureDraft[] {
  // Only split explicit lines/separators. A comma may separate steps of the same task.
  const parts = text
    .split(/[\n；;]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (parts.length > 12) return [simpleDraft(text, zone, now)];
  return (parts.length ? parts : [text]).map((x) => simpleDraft(x, zone, now));
}
export function normalizeTaskTitle(text: string) {
  return text.toLocaleLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
}
export function similarTasks(
  title: string,
  items: { id: string; title: string; version: number }[],
) {
  const normalized = normalizeTaskTitle(title);
  if (normalized.length < 3) return [];
  return items
    .filter((item) => {
      const other = normalizeTaskTitle(item.title);
      return (
        other === normalized ||
        (Math.min(other.length, normalized.length) >= 6 &&
          (other.includes(normalized) || normalized.includes(other)))
      );
    })
    .slice(0, 3)
    .map(({ id, title, version }) => ({ id, title, version }));
}

/** A retry may improve untouched suggestions, but never overwrite the user's edits. */
export function mergeDraftSuggestion(
  before: CaptureDraft,
  edited: CaptureDraft,
  next: CaptureDraft,
): CaptureDraft {
  const result = { ...next };
  for (const key of Object.keys(edited) as (keyof CaptureDraft)[]) {
    if (JSON.stringify(edited[key] ?? null) !== JSON.stringify(before[key] ?? null))
      Object.assign(result, { [key]: edited[key] });
  }
  // Triage and quadrant are one destination choice, including choosing the
  // suggested quadrant explicitly when a draft previously belonged to inbox.
  if (edited.triageStatus !== before.triageStatus || edited.quadrant !== before.quadrant) {
    result.triageStatus = edited.triageStatus;
    result.quadrant = edited.quadrant;
  }
  return result;
}

export type CaptureMemory = {
  input: string;
  draft: CaptureDraft | null;
  mode: string;
  savedAt: number;
  drafts: CaptureDraft[];
  selected: boolean[];
};
export function readCaptureMemory(raw: string | null, now = Date.now()): CaptureMemory | null {
  try {
    const value = JSON.parse(raw || 'null');
    if (
      !value ||
      typeof value.input !== 'string' ||
      value.input.length > 12000 ||
      !Number.isFinite(value.savedAt) ||
      now - value.savedAt > 7 * 864e5 ||
      value.savedAt > now + 60000
    )
      return null;
    const parsed = value.draft ? draftSchema.safeParse(value.draft) : null;
    if (parsed && !parsed.success) return null;
    const batch = z
      .array(draftSchema)
      .max(12)
      .safeParse(value.drafts || []);
    if (!batch.success) return null;
    const selected = batch.data.map((_, i) =>
      typeof value.selected?.[i] === 'boolean' ? value.selected[i] : true,
    );
    return {
      input: value.input,
      draft: parsed?.success ? parsed.data : null,
      mode: ['ai', 'rules', 'manual'].includes(value.mode) ? value.mode : 'manual',
      savedAt: value.savedAt,
      drafts: batch.data,
      selected,
    };
  } catch {
    return null;
  }
}
