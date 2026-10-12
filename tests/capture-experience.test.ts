import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeDraftSuggestion, readCaptureMemory } from '../packages/core/src/capture-experience';
import { simpleDraft } from '../packages/core/src';
import {
  captureBatchSchema,
  ruleCaptureBatch,
  similarTasks,
  defaultCapturePreference,
  capturePreferenceSchema,
  withCapturePreference,
  nextActionSuggestion,
} from '../packages/core/src/capture-experience';

test('个人提醒偏好只补充未来建议，不覆盖明确提醒或修改原草稿', () => {
  const now = Date.parse('2026-10-12T00:00:00Z');
  const draft = { ...simpleDraft('交付方案', 'Asia/Shanghai'), dueAt: '2026-10-12T02:00:00Z' };
  const pref = { ...defaultCapturePreference, enabled: true, reminderMinutes: 60 };
  assert.equal(withCapturePreference(draft, pref, now).reminderAt, '2026-10-12T01:00:00.000Z');
  assert.equal(draft.reminderAt, null);
  assert.equal(withCapturePreference(draft, { ...pref, enabled: false }, now), draft);
  assert.equal(withCapturePreference(draft, null, now), draft);
  assert.equal(withCapturePreference({ ...draft, dueAt: null }, pref, now).reminderAt, null);
  assert.equal(withCapturePreference(draft, pref, now + 864e5).reminderAt, null);
  const explicit = { ...draft, reminderAt: '2026-10-12T01:30:00Z' };
  assert.equal(withCapturePreference(explicit, pref, now), explicit);
  assert.equal(capturePreferenceSchema.safeParse({ ...pref, reminderMinutes: -1 }).success, false);
  assert.equal(capturePreferenceSchema.safeParse({ ...pref, userId: 'another' }).success, false);
});

test('推进建议选择最久阻塞或沉积事项，边界准确且不改变事项', () => {
  const now = new Date('2026-10-12T00:00:00Z');
  const item = {
    id: 'old',
    title: '旧事项',
    status: 'open',
    updatedAt: now,
    dueAt: new Date(now.getTime() - 7 * 864e5),
  };
  assert.equal(nextActionSuggestion([item], now)?.itemId, 'old');
  assert.equal(
    nextActionSuggestion([{ ...item, dueAt: new Date(item.dueAt.getTime() + 1000) }], now),
    null,
  );
  assert.equal(nextActionSuggestion([{ ...item, status: 'done' }], now), null);
  const blocked = {
    ...item,
    id: 'blocked',
    status: 'blocked',
    dueAt: null,
    updatedAt: new Date(now.getTime() - 3 * 864e5),
  };
  assert.equal(nextActionSuggestion([item, blocked], now)?.itemId, 'blocked');
  assert.equal(
    nextActionSuggestion(
      [{ ...blocked, updatedAt: new Date(now.getTime() - 3 * 864e5 + 1000) }],
      now,
    ),
    null,
  );
  assert.equal(
    nextActionSuggestion(
      [blocked, { ...blocked, id: 'oldest', updatedAt: new Date(now.getTime() - 5 * 864e5) }],
      now,
    )?.itemId,
    'oldest',
  );
  assert.equal(item.status, 'open');
  assert.equal(blocked.status, 'blocked');
});

test('批量解析保留校验，规则只按明确分隔拆分，相似事项匹配', () => {
  const rows = ruleCaptureBatch('明天提交报价；周五跟进客户', 'Asia/Shanghai');
  assert.equal(rows.length, 2);
  assert.equal(ruleCaptureBatch('准备材料，检查内容', 'Asia/Shanghai').length, 1);
  const draft = {
    title: '检查合同',
    notes: '',
    quadrant: 2,
    triageStatus: 'pending',
    projectId: null,
    dueAt: null,
    plannedAt: null,
    reminderAt: null,
    subtasks: [],
  };
  assert.equal(captureBatchSchema.safeParse({ drafts: [draft] }).success, true);
  assert.equal(
    captureBatchSchema.safeParse({ drafts: [{ ...draft, subtasks: ['a', 'a'] }] }).success,
    false,
  );
  assert.deepEqual(
    similarTasks('检查合同', [{ id: '1', title: '检查 合同。', version: 2 }]).map(
      (item) => item.id,
    ),
    ['1'],
  );
  const memory = readCaptureMemory(
    JSON.stringify({
      input: '两件事项',
      draft,
      drafts: [draft, { ...draft, title: '另一件事项' }],
      selected: [false, true],
      mode: 'ai',
      savedAt: Date.now(),
    }),
  );
  assert.equal(memory?.drafts.length, 2);
  assert.deepEqual(memory?.selected, [false, true]);
});

test('重试更新未触碰的建议，保留用户修改与主动清空的字段', () => {
  const before = simpleDraft('准备方案', 'Asia/Shanghai');
  before.dueAt = '2026-10-12T07:00:00.000Z';
  const edited = { ...before, title: '我修改的标题', dueAt: null, subtasks: ['我的步骤'] };
  const next = {
    ...before,
    title: 'AI 新标题',
    notes: '新背景',
    quadrant: 1,
    subtasks: ['AI 步骤'],
  };
  const merged = mergeDraftSuggestion(before, edited, next);
  assert.equal(merged.title, edited.title);
  assert.equal(merged.dueAt, null);
  assert.equal(merged.notes, next.notes);
  assert.equal(merged.quadrant, 1);
  assert.deepEqual(merged.subtasks, edited.subtasks);
});

test('重试保留完整放入位置，不能把已确认的默认象限重新分配', () => {
  const before = {
    ...simpleDraft('整理反馈', 'Asia/Shanghai'),
    quadrant: 2,
    triageStatus: 'pending' as const,
  };
  const edited = { ...before, triageStatus: 'triaged' as const };
  const merged = mergeDraftSuggestion(before, edited, {
    ...before,
    quadrant: 1,
    triageStatus: 'triaged',
    notes: '新补充',
  });
  assert.equal(merged.quadrant, 2);
  assert.equal(merged.triageStatus, 'triaged');
  assert.equal(merged.notes, '新补充');
});

test('草稿恢复拒绝过期、损坏与结构不完整的数据', () => {
  const now = Date.now();
  const memory = {
    input: '明天处理',
    draft: simpleDraft('明天处理', 'Asia/Shanghai'),
    mode: 'rules',
    savedAt: now,
  };
  assert.equal(readCaptureMemory(JSON.stringify(memory), now)?.draft?.title, memory.draft.title);
  assert.equal(
    readCaptureMemory(JSON.stringify({ ...memory, savedAt: now - 8 * 864e5 }), now),
    null,
  );
  assert.equal(readCaptureMemory('{broken', now), null);
  assert.equal(readCaptureMemory(JSON.stringify({ ...memory, draft: { title: '' } }), now), null);
});
