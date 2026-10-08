import test from 'node:test';
import assert from 'node:assert/strict';
import {
  can,
  inQuietHours,
  zonedInstant,
  simpleDraft,
  itemInput,
  itemPatch,
  draftSchema,
  isPositionOnlyEvent,
} from '../packages/core/src';
import { passwordHash, verifyPassword, encrypt, decrypt } from '../src/lib/security';
test('角色矩阵：viewer 只读，未知角色拒绝', () => {
  assert.equal(can('viewer', 'items.read'), true);
  assert.equal(can('viewer', 'items.write'), false);
  assert.equal(can('member', 'items.write'), true);
  assert.equal(can('intruder', 'items.read'), false);
});
test('免打扰跨午夜与同点关闭', () => {
  assert.equal(inQuietHours(23, 22, 8), true);
  assert.equal(inQuietHours(7, 22, 8), true);
  assert.equal(inQuietHours(8, 22, 8), false);
  assert.equal(inQuietHours(12, 12, 12), false);
  assert.equal(inQuietHours(14, 9, 17), true);
});
test('时区转换跨日与夏令时', () => {
  assert.equal(zonedInstant('2026-09-29', '09:00', 'Asia/Shanghai'), '2026-09-29T01:00:00.000Z');
  assert.equal(zonedInstant('2026-01-01', '00:30', 'Asia/Shanghai'), '2025-12-31T16:30:00.000Z');
  assert.equal(zonedInstant('2026-07-01', '09:00', 'America/New_York'), '2026-07-01T13:00:00.000Z');
  assert.throws(() => zonedInstant('2026-03-08', '02:30', 'America/New_York'));
});
test('规则捕捉不捏造日期，识别用户时区的明天下午', () => {
  const plain = simpleDraft('准备产品方案', 'Asia/Shanghai', new Date('2026-09-29T20:00:00Z'));
  assert.equal(plain.dueAt, null);
  const draft = simpleDraft(
    '明天下午3点提醒我确认方案',
    'Asia/Shanghai',
    new Date('2026-09-29T20:00:00Z'),
  );
  assert.equal(draft.dueAt, '2026-10-01T07:00:00.000Z');
  assert.equal(draft.reminderAt, draft.dueAt);
});
test('输入拒绝无时区日期、未知字段和过多子事项', () => {
  assert.equal(itemInput.safeParse({ title: 'a', dueAt: '2026-09-29T12:00:00' }).success, false);
  assert.equal(itemInput.safeParse({ title: 'a', workspaceId: 'foreign' }).success, false);
  assert.equal(itemPatch.safeParse({ title: 'a' }).success, false);
  assert.equal(
    draftSchema.safeParse({ title: 'a', subtasks: Array(13).fill('step') }).success,
    false,
  );
});
test('密码采用盐值哈希，错误密码不通过', () => {
  const a = passwordHash('Strong-demo-password');
  assert.equal(verifyPassword('Strong-demo-password', a), true);
  assert.equal(verifyPassword('bad', a), false);
  assert.notEqual(a, passwordHash('Strong-demo-password'));
});
test('AI 密钥加密、篡改检测', () => {
  process.env.ENCRYPTION_KEY = 'a'.repeat(64);
  const value = encrypt('test-only-secret');
  assert.equal(value.includes('test-only-secret'), false);
  assert.equal(decrypt(value), 'test-only-secret');
  assert.throws(() => decrypt(value.slice(0, -1) + (value.endsWith('0') ? '1' : '0')));
});

test('时光回放识别新旧纯星体位置事件', () => {
  assert.equal(isPositionOnlyEvent({ type: 'positioned' }), true);
  assert.equal(
    isPositionOnlyEvent({
      type: 'updated',
      data: {
        before: { title: '推进方案', quadrant: 2, orbitX: 0.4, version: 1 },
        after: { title: '推进方案', quadrant: 3, orbitX: -0.4, version: 2 },
      },
    }),
    true,
  );
  assert.equal(
    isPositionOnlyEvent({
      type: 'updated',
      data: {
        before: { title: '推进方案', orbitX: 0.4, version: 1 },
        after: { title: '确认方案', orbitX: -0.4, version: 2 },
      },
    }),
    false,
  );
});

test('中文时间与四象限否定含义', () => {
  const result = simpleDraft(
    '明天下午三点提醒我，重要不紧急',
    'Asia/Shanghai',
    new Date('2026-09-29T01:00:00Z'),
  );
  assert.equal(result.dueAt, '2026-09-30T07:00:00.000Z');
  assert.equal(result.quadrant, 2);
  assert.equal(simpleDraft('紧急但不重要', 'Asia/Shanghai').quadrant, 3);
  assert.equal(simpleDraft('不重要也不紧急', 'Asia/Shanghai').quadrant, 4);
});
