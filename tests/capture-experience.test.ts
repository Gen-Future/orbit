import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeDraftSuggestion, readCaptureMemory } from '../packages/core/src/capture-experience';
import { simpleDraft } from '../packages/core/src';
import {
  captureBatchSchema,
  ruleCaptureBatch,
  similarTasks,
} from '../packages/core/src/capture-experience';

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
