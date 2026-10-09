import test from 'node:test';
import assert from 'node:assert/strict';
import {
  reportPlanText,
  reportWeek,
  shiftDate,
  isReportProgress,
  validReportSections,
  type ReportSource,
} from '../packages/core/src/reports';
test('周报自然周按工作空间时区计算，覆盖周日、跨年和夏令时', () => {
  const week = reportWeek('Asia/Shanghai', '2026-10-09');
  assert.equal(week.startDate, '2026-10-05');
  assert.equal(week.endDate, '2026-10-12');
  assert.equal(week.startAt, '2026-10-04T16:00:00.000Z');
  assert.deepEqual(reportWeek('Asia/Shanghai', '2026-10-11'), week);
  const cross = reportWeek('Asia/Shanghai', '2027-01-01');
  assert.equal(cross.startDate, '2026-12-28');
  assert.equal(cross.endDate, '2027-01-04');
  const dst = reportWeek('America/New_York', '2026-03-08');
  assert.equal(Date.parse(dst.endAt) - Date.parse(dst.startAt), 167 * 3600000);
  assert.equal(shiftDate('2026-12-31', 1), '2027-01-01');
  assert.throws(() => reportWeek('Asia/Shanghai', '2026-02-30'));
});
test('周报实质进展忽略拖动、截止和提醒调整，保留状态与内容推进', () => {
  for (const type of ['created', 'completed', 'reopened'])
    assert.equal(isReportProgress({ type }), true);
  for (const type of ['positioned', 'snoozed', 'archived', 'restored', 'deleted', 'undeleted'])
    assert.equal(isReportProgress({ type }), false);
  const before = {
    title: 'A',
    notes: '',
    status: 'open',
    dueAt: null,
    quadrant: 2,
    orbitX: null,
    version: 1,
  };
  assert.equal(
    isReportProgress({
      type: 'updated',
      data: { before, after: { ...before, dueAt: '2026-10-10', version: 2 } },
    }),
    false,
  );
  assert.equal(
    isReportProgress({
      type: 'updated',
      data: { before, after: { ...before, orbitX: 0.2, quadrant: 1, version: 2 } },
    }),
    false,
  );
  assert.equal(
    isReportProgress({
      type: 'updated',
      data: { before, after: { ...before, notes: '发布验收完成', version: 2 } },
    }),
    true,
  );
  assert.equal(
    isReportProgress({
      type: 'updated',
      data: { before, after: { ...before, status: 'blocked', version: 2 } },
    }),
    true,
  );
});
test('周报 AI 输出拒绝未知来源、伪造证据和无依据业绩数字', () => {
  const facts = [
    { id: 'one', title: '完成 Orbit 发布验收', notes: '验证 9 项场景通过' },
  ] as ReportSource[];
  const entry = {
    text: '完成 Orbit 发布验收',
    itemIds: ['one'],
    evidence: [{ itemId: 'one', quote: '完成 Orbit 发布验收' }],
  };
  const wrap = (e: unknown) => ({ sections: [{ heading: '成果', entries: [e] }] });
  assert.ok(validReportSections(wrap(entry), facts));
  assert.equal(validReportSections(wrap({ ...entry, itemIds: ['other'] }), facts), null);
  assert.equal(
    validReportSections(
      wrap({ ...entry, evidence: [{ itemId: 'one', quote: '收入增长' }] }),
      facts,
    ),
    null,
  );
  assert.equal(
    validReportSections(wrap({ ...entry, text: '完成发布，收入增长 30%' }), facts),
    null,
  );
  assert.equal(
    validReportSections(wrap({ ...entry, text: '验证 9 项场景通过' }), facts)?.sections.length,
    1,
  );
  assert.equal(validReportSections(wrap({ ...entry, itemIds: [] }), facts), null);
});

test('只从下周章节读取计划，保留子标题并排除成果与风险章节', () => {
  const text = reportPlanText(
    '# 本周成果\n- 完成发布\n## 下周计划\n### 发布\n- 验收下一版\n## 风险\n- 不应转任务',
  );
  assert.match(text, /验收下一版/);
  assert.ok(!text.includes('完成发布'));
  assert.ok(!text.includes('不应转任务'));
});
