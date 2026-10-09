import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { standardReportDefinition } from '../../packages/core/src/reports';
const base = process.env.TEST_APP_URL || 'http://localhost:3001';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL || 'postgresql://orbit:orbit@127.0.0.1:55432/orbit_test';
assert.match(process.env.DATABASE_URL, /orbit_test(?:\?|$)/);
let cookie = '',
  wid = '',
  userId = '',
  modelMode = 'valid';
async function request(
  path: string,
  method = 'GET',
  data?: unknown,
  key = randomUUID(),
  session = cookie,
) {
  const response = await fetch(`${base}/api/v1/${path}`, {
    method,
    headers: {
      Origin: base,
      Cookie: session,
      'Content-Type': 'application/json',
      ...(method === 'GET' ? {} : { 'Idempotency-Key': key }),
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  return {
    status: response.status,
    body: await response.json(),
    cookie: response.headers.get('set-cookie')?.split(';')[0] || '',
  };
}
test('周报铸造舱真实数据、个人模板与原子计划导入', async (t) => {
  const { db } = await import('../../src/lib/db');
  const { styleSuggestionPass } = await import('../../src/lib/reports');
  const previous = await db.aIEndpoint.findMany({ where: { active: true } });
  const model = createServer(async (req, res) => {
    let text = '';
    for await (const part of req) text += part;
    const payload = JSON.parse(text);
    const system = payload.messages[0].content;
    const input = JSON.parse(payload.messages[1].content);
    let result: unknown = {};
    if (system.includes('风格分析器'))
      result = {
        ...standardReportDefinition,
        name: '我的项目周报',
        tone: '简洁，按项目分组',
        ...(modelMode === 'echo' ? { skeleton: input.samples[0] } : {}),
      };
    else if (system.includes('比较周报'))
      result = {
        changed: true,
        reason: '你改成了更短的行动条目',
        definition: { ...standardReportDefinition, name: '我的项目周报', length: '每项只写一句' },
      };
    else if (system.includes('提取最多'))
      result = {
        drafts: [
          {
            title: '准备下周发布检查',
            notes: '按最终稿执行',
            quadrant: 2,
            dueAt: null,
            evidence: '准备下周发布检查',
          },
        ],
      };
    else if (input.facts)
      result =
        modelMode === 'invalid'
          ? {
              sections: [
                {
                  heading: '成果',
                  entries: [
                    {
                      text: '收入增长 99%',
                      itemIds: ['evil'],
                      evidence: [{ itemId: 'evil', quote: 'fake' }],
                    },
                  ],
                },
              ],
            }
          : {
              sections: [
                {
                  heading: '本周成果',
                  entries: input.facts.map((f: { id: string; title: string }) => ({
                    text: f.title,
                    itemIds: [f.id],
                    evidence: [{ itemId: f.id, quote: f.title }],
                  })),
                },
                { heading: '下周计划', entries: [] },
              ],
            };
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(result) } }] }));
  });
  await new Promise<void>((resolve) => model.listen(55592, '127.0.0.1', resolve));
  await db.aIEndpoint.updateMany({ where: { active: true }, data: { active: false } });
  const endpoint = await db.aIEndpoint.create({
    data: {
      name: `Report test ${randomUUID()}`,
      baseUrl: 'http://127.0.0.1:55592',
      model: 'fake',
      active: true,
    },
  });
  try {
    const registered = await request(
      'auth/register',
      'POST',
      {
        email: `reports-${randomUUID()}@orbit.test`,
        password: 'Report-integration-2026',
        name: 'Report tester',
      },
      randomUUID(),
      '',
    );
    assert.equal(registered.status, 200);
    cookie = registered.cookie;
    const me = (await request('auth/me')).body;
    wid = me.memberships[0].workspace.id;
    userId = me.user.id;
    const prefix = `workspaces/${wid}`;
    const context = (await request(`${prefix}/reports/context`)).body;
    const range = { startAt: context.startAt, endAt: context.endAt };
    let item: any, archived: any, report: any, template: any;
    await t.test('自然周、当周实质进展与归档补选', async () => {
      item = (await request(`${prefix}/items`, 'POST', { title: '完成发布检查', quadrant: 2 }))
        .body;
      archived = (
        await request(`${prefix}/items`, 'POST', {
          title: '历史补充事项',
          occurredAt: '2026-01-05T00:00:00Z',
        })
      ).body;
      await request(`${prefix}/items/${archived.id}`, 'PATCH', {
        version: archived.version,
        archived: true,
      });
      const candidates = (await request(`${prefix}/reports/context`)).body;
      assert.ok(candidates.candidates.some((x: any) => x.id === item.id));
      const movementOnly = await db.item.create({
        data: { workspaceId: wid, title: '只移动位置', quadrant: 2 },
      });
      await db.itemEvent.create({
        data: {
          workspaceId: wid,
          itemId: movementOnly.id,
          actorId: userId,
          type: 'positioned',
          data: { before: { quadrant: 2 }, after: { quadrant: 1 } },
        },
      });
      const next = (await request(`${prefix}/reports/context`)).body;
      assert.ok(!next.candidates.some((x: any) => x.id === movementOnly.id));
      const extras = (
        await request(
          `${prefix}/reports/candidates?mode=all&startAt=2026-01-01T00:00:00Z&endAt=2026-02-01T00:00:00Z`,
        )
      ).body;
      assert.ok(extras.items.some((x: any) => x.id === archived.id));
      assert.ok(extras.items[0].archivedAt);
    });
    await t.test('AI 提炼样本不保存原文，模板冲突与个人隔离', async () => {
      const sample = '敏感历史样本-' + randomUUID();
      const learned = await request(`${prefix}/report-template/learn`, 'POST', {
        samples: [sample],
      });
      assert.equal(learned.body.mode, 'ai');
      modelMode = 'echo';
      const echoed = await request(`${prefix}/report-template/learn`, 'POST', {
        samples: [sample],
      });
      assert.equal(echoed.body.mode, 'rules');
      assert.ok(!JSON.stringify(echoed.body).includes(sample));
      modelMode = 'valid';
      template = (
        await request(`${prefix}/report-template`, 'PATCH', {
          version: 0,
          definition: learned.body.definition,
        })
      ).body;
      assert.equal(template.version, 1);
      assert.equal(
        (
          await request(`${prefix}/report-template`, 'PATCH', {
            version: 0,
            definition: standardReportDefinition,
          })
        ).status,
        409,
      );
      const jobs = await db.aIJob.findMany({
        where: { workspaceId: wid, skillId: 'learn-report-style' },
      });
      assert.ok(!JSON.stringify(jobs).includes(sample));
      const member = await request(
        'auth/register',
        'POST',
        {
          email: `reports-member-${randomUUID()}@orbit.test`,
          password: 'Report-integration-2026',
          name: 'Member',
        },
        randomUUID(),
        '',
      );
      const memberMe = (await request('auth/me', 'GET', undefined, randomUUID(), member.cookie))
        .body;
      await db.membership.create({
        data: { workspaceId: wid, userId: memberMe.user.id, role: 'member' },
      });
      assert.equal(
        (await request(`${prefix}/report-template`, 'GET', undefined, randomUUID(), member.cookie))
          .body,
        null,
      );
      const independent = await request(
        `${prefix}/report-template`,
        'PATCH',
        { version: 0, definition: standardReportDefinition },
        randomUUID(),
        member.cookie,
      );
      assert.equal(independent.status, 200);
      assert.notEqual(independent.body.id, template.id);
      await db.membership.update({
        where: { workspaceId_userId: { workspaceId: wid, userId: memberMe.user.id } },
        data: { role: 'viewer' },
      });
      assert.equal(
        (
          await request(
            `${prefix}/reports`,
            'POST',
            { ...range, sourceIds: [item.id] },
            randomUUID(),
            member.cookie,
          )
        ).status,
        403,
      );
      assert.equal(
        (await request(`workspaces/${memberMe.memberships[0].workspace.id}/reports/context`))
          .status,
        403,
      );
    });
    await t.test('精确选中生成、来源快照、幂等与越权拒绝', async () => {
      const body = {
        ...range,
        sourceIds: [item.id, archived.id],
        templateId: template.id,
        templateVersion: 1,
      };
      const key = randomUUID();
      const created = await request(`${prefix}/reports`, 'POST', body, key);
      assert.equal(created.status, 201, JSON.stringify(created.body));
      report = created.body;
      assert.equal(report.generationMode, 'ai');
      assert.deepEqual(report.sourceIds, body.sourceIds);
      assert.equal(report.sourceSnapshot.length, 2);
      assert.equal((await request(`${prefix}/reports`, 'POST', body, key)).body.id, report.id);
      assert.equal(
        (await request(`${prefix}/reports`, 'POST', { ...body, sourceIds: [item.id] }, key)).status,
        409,
      );
      const outsider = await db.workspace.create({ data: { name: 'Other' } });
      const foreign = await db.item.create({
        data: { workspaceId: outsider.id, title: 'Private' },
      });
      assert.equal(
        (await request(`${prefix}/reports`, 'POST', { ...range, sourceIds: [foreign.id] })).status,
        404,
      );
      assert.equal(
        (
          await request(`${prefix}/reports`, 'POST', {
            ...range,
            sourceIds: Array.from({ length: 201 }, (_, i) => String(i)),
          })
        ).status,
        400,
      );
      await request(`${prefix}/items/${item.id}`, 'PATCH', {
        version: item.version,
        title: '修改后的标题',
      });
      assert.equal(
        (await request(`${prefix}/reports/${report.id}`)).body.sourceSnapshot[0].title,
        '完成发布检查',
      );
      modelMode = 'invalid';
      const fallback = await request(`${prefix}/reports`, 'POST', {
        ...range,
        sourceIds: [item.id],
      });
      assert.equal(fallback.body.generationMode, 'rules');
      assert.ok(!fallback.body.content.includes('99%'));
      modelMode = 'valid';
    });
    await t.test('最终稿保存、后台风格建议与手动确认', async () => {
      const edited = await request(`${prefix}/reports/${report.id}`, 'PATCH', {
        version: report.version,
        content: report.content + '\n\n## 下周计划\n- 准备下周发布检查',
      });
      assert.equal(edited.status, 200);
      report = edited.body;
      assert.equal(report.suggestionStatus, 'pending');
      assert.equal(
        (await request(`${prefix}/reports/${report.id}`, 'PATCH', { version: 1, content: 'stale' }))
          .status,
        409,
      );
      await styleSuggestionPass();
      report = (await request(`${prefix}/reports/${report.id}`)).body;
      assert.equal(report.suggestionStatus, 'ready');
      assert.equal((await request(`${prefix}/report-template`)).body.version, 1);
      const accepted = await request(`${prefix}/reports/${report.id}/style`, 'POST', {
        decision: 'accept',
        version: report.version,
        templateVersion: 1,
      });
      assert.equal(accepted.status, 200);
      assert.equal((await request(`${prefix}/report-template`)).body.version, 2);
    });
    await t.test('下周计划仅为草稿，确认原子导入且可追溯、防重复', async () => {
      const before = await db.item.count({ where: { workspaceId: wid } });
      const plan = await request(`${prefix}/reports/${report.id}/plan`, 'POST', {});
      assert.equal(plan.body.drafts.length, 1);
      assert.equal(await db.item.count({ where: { workspaceId: wid } }), before);
      const input = {
        batchId: plan.body.batchId,
        version: plan.body.version,
        drafts: plan.body.drafts,
      };
      const key = randomUUID();
      const imported = await request(
        `${prefix}/reports/${report.id}/plan-items`,
        'POST',
        input,
        key,
      );
      assert.equal(imported.status, 201, JSON.stringify(imported.body));
      assert.equal(imported.body.items[0].sourceReportId, report.id);
      assert.equal(
        (await request(`${prefix}/reports/${report.id}/plan-items`, 'POST', input, key)).body
          .items[0].id,
        imported.body.items[0].id,
      );
      assert.equal(
        (await request(`${prefix}/reports/${report.id}/plan-items`, 'POST', input)).status,
        409,
      );
      assert.equal(await db.item.count({ where: { workspaceId: wid } }), before + 1);
      assert.equal((await request(`${prefix}/reports/${report.id}/plan`, 'POST', {})).status, 409);
    });
    await t.test('超过工作台 1000 条仍返回真实数量与分页', async () => {
      const values = Array.from({ length: 1002 }, (_, i) => ({
        id: `report-${randomUUID()}`,
        workspaceId: wid,
        title: `素材 ${i}`,
      }));
      await db.item.createMany({ data: values });
      await db.itemEvent.createMany({
        data: values.map((i) => ({
          workspaceId: wid,
          itemId: i.id,
          actorId: userId,
          type: 'created',
          data: { title: i.title },
        })),
      });
      const c = (await request(`${prefix}/reports/context`)).body;
      assert.ok(c.total > 1000);
      const page = (await request(`${prefix}/reports/candidates?page=2&limit=50`)).body;
      assert.equal(page.items.length, 50);
      assert.equal(page.total, c.total);
    });
    await t.test('中国日历缓存与网络失败降级', async () => {
      const { weekCalendar, syncCalendar } = await import('../../src/lib/report-calendar');
      await db.calendarCache.upsert({
        where: { year: 2026 },
        create: {
          year: 2026,
          days: [
            { date: '2026-10-05', name: '国庆节', isOffDay: true },
            { date: '2026-10-06', name: '国庆节', isOffDay: true },
            { date: '2026-10-07', name: '国庆节', isOffDay: true },
            { date: '2026-10-10', name: '国庆节', isOffDay: false },
          ],
          papers: ['https://www.gov.cn/zhengce/content/202511/content_7047090.htm'],
          checksum: 'fixture',
        },
        update: {
          days: [
            { date: '2026-10-05', name: '国庆节', isOffDay: true },
            { date: '2026-10-06', name: '国庆节', isOffDay: true },
            { date: '2026-10-07', name: '国庆节', isOffDay: true },
            { date: '2026-10-10', name: '国庆节', isOffDay: false },
          ],
          syncedAt: new Date(),
        },
      });
      const calendar = await weekCalendar('2026-10-05');
      assert.equal(calendar.days[2].kind, 'holiday');
      assert.equal(calendar.days[5].kind, 'makeup');
      const original = globalThis.fetch;
      globalThis.fetch = async () => new Response('', { status: 503 });
      try {
        assert.equal(await syncCalendar(2098, true), null);
        assert.equal((await weekCalendar('2098-10-06')).calendar.status, 'fallback');
      } finally {
        globalThis.fetch = original;
      }
    });
  } finally {
    await db.aIEndpoint.delete({ where: { id: endpoint.id } });
    for (const e of previous)
      await db.aIEndpoint.update({ where: { id: e.id }, data: { active: true } });
    await new Promise<void>((resolve) => model.close(() => resolve()));
    await db.$disconnect();
  }
});
