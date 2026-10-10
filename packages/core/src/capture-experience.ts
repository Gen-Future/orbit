import { draftSchema, type CaptureDraft } from './index';

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
  return result;
}

export type CaptureMemory = {
  input: string;
  draft: CaptureDraft | null;
  mode: string;
  savedAt: number;
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
    return {
      input: value.input,
      draft: parsed?.success ? parsed.data : null,
      mode: ['ai', 'rules', 'manual'].includes(value.mode) ? value.mode : 'manual',
      savedAt: value.savedAt,
    };
  } catch {
    return null;
  }
}
