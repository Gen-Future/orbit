import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
const base = process.env.TEST_APP_URL || 'http://localhost:3001';
const database =
  process.env.TEST_DATABASE_URL || 'postgresql://orbit:orbit@127.0.0.1:55432/orbit_test';
assert.match(database, /orbit_test(?:\?|$)/, '集成测试仅允许独立 orbit_test 数据库');
process.env.DATABASE_URL = database;
const unique = randomUUID().slice(0, 8);
let cookieA = '',
  cookieB = '',
  widA = '',
  widB = '',
  itemId = '',
  projectB = '',
  endpointId = '',
  token = '',
  version = 1;
async function request(
  path: string,
  method = 'GET',
  data?: unknown,
  options: { cookie?: string; key?: string; bearer?: string; origin?: string } = {},
) {
  const response = await fetch(`${base}/api/v1/${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Origin: options.origin || base,
      ...(options.bearer
        ? { Authorization: `Bearer ${options.bearer}` }
        : { Cookie: options.cookie ?? cookieA }),
      ...(method !== 'GET' ? { 'Idempotency-Key': options.key || randomUUID() } : {}),
    },
    ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
  });
  return {
    status: response.status,
    body: await response.json(),
    cookie: response.headers.get('set-cookie')?.split(';')[0] || '',
  };
}
test('真实 API / PostgreSQL 业务与隔离闭环', async (t) => {
  const { db } = await import('../../src/lib/db');
  await t.test('注册、登录与创建独立空间', async () => {
    for (const who of ['a', 'b']) {
      const response = await request(
        'auth/register',
        'POST',
        {
          email: `${who}-${unique}@orbit.test`,
          password: 'Integration-test-password',
          name: `Test ${who}`,
        },
        { cookie: '' },
      );
      assert.equal(response.status, 200, JSON.stringify(response.body));
      if (who === 'a') cookieA = response.cookie;
      else cookieB = response.cookie;
    }
    const meA = (await request('auth/me')).body;
    widA = meA.memberships[0].workspace.id;
    await db.user.update({ where: { id: meA.user.id }, data: { isSystemAdmin: true } });
    widB = (await request('auth/me', 'GET', undefined, { cookie: cookieB })).body.memberships[0]
      .workspace.id;
    assert.notEqual(widA, widB);
    projectB = (
      await request(
        `workspaces/${widB}/projects`,
        'POST',
        { name: 'Private B' },
        { cookie: cookieB },
      )
    ).body.id;
    assert.equal((await request('admin/overview')).status, 200);
    assert.equal(
      (await request('admin/overview', 'GET', undefined, { cookie: cookieB })).status,
      403,
    );
  });
  await t.test('拒绝未登录和跨空间访问', async () => {
    assert.equal(
      (await request(`workspaces/${widA}/items`, 'GET', undefined, { cookie: '' })).status,
      401,
    );
    assert.equal((await request(`workspaces/${widB}/items`)).status, 403);
  });
  await t.test('拒绝跨源 cookie 写入', async () => {
    assert.equal(
      (
        await request(
          `workspaces/${widA}/items`,
          'POST',
          { title: 'no' },
          { origin: 'https://evil.example' },
        )
      ).status,
      403,
    );
  });
  await t.test('并发幂等创建只保存一次', async () => {
    const key = randomUUID(),
      data = {
        title: `Idempotency ${unique}`,
        quadrant: 1,
        dueAt: new Date(Date.now() + 864e5).toISOString(),
        reminderAt: new Date(Date.now() - 60000).toISOString(),
      };
    const results = await Promise.all([
      request(`workspaces/${widA}/items`, 'POST', data, { key }),
      request(`workspaces/${widA}/items`, 'POST', data, { key }),
    ]);
    assert.equal(results[0].status, 201, JSON.stringify(results));
    assert.equal(results[0].body.id, results[1].body.id);
    itemId = results[0].body.id;
    assert.equal(await db.item.count({ where: { workspaceId: widA, title: data.title } }), 1);
    assert.equal(
      (await request(`workspaces/${widA}/items`, 'POST', { ...data, title: 'different' }, { key }))
        .status,
      409,
    );
  });
  await t.test('关联项目与父事项不能跨空间', async () => {
    assert.equal(
      (await request(`workspaces/${widA}/items`, 'POST', { title: 'cross', projectId: projectB }))
        .status,
      404,
    );
    assert.equal(
      (
        await request(
          `workspaces/${widB}/items`,
          'POST',
          { title: 'cross', parentId: itemId },
          { cookie: cookieB },
        )
      ).status,
      404,
    );
  });
  await t.test('追加事件与乐观锁冲突', async () => {
    const updated = await request(`workspaces/${widA}/items/${itemId}`, 'PATCH', {
      version: 1,
      notes: 'A factual note',
    });
    assert.equal(updated.status, 200);
    version = updated.body.version;
    assert.equal(
      (await request(`workspaces/${widA}/items/${itemId}`, 'PATCH', { version: 1, title: 'stale' }))
        .status,
      409,
    );
    const events = (await request(`workspaces/${widA}/events?itemId=${itemId}`)).body;
    assert.deepEqual(
      events.map((e: { type: string }) => e.type),
      ['updated', 'created'],
    );
  });
  await t.test('只读成员被禁止编辑与管理令牌', async () => {
    const email = `viewer-${unique}@orbit.test`;
    const added = await request(`workspaces/${widA}/members`, 'POST', {
      email,
      password: 'Viewer-test-password',
      role: 'viewer',
    });
    assert.equal(added.status, 201);
    const login = await request(
      'auth/login',
      'POST',
      { email, password: 'Viewer-test-password' },
      { cookie: '' },
    );
    assert.equal(
      (await request(`workspaces/${widA}/items`, 'GET', undefined, { cookie: login.cookie }))
        .status,
      200,
    );
    assert.equal(
      (
        await request(
          `workspaces/${widA}/items/${itemId}`,
          'PATCH',
          { version, status: 'done' },
          { cookie: login.cookie },
        )
      ).status,
      403,
    );
    assert.equal(
      (await request(`workspaces/${widA}/tokens`, 'GET', undefined, { cookie: login.cookie }))
        .status,
      403,
    );
  });
  await t.test('令牌空间隔离、scope 与撤销', async () => {
    const issued = await request(`workspaces/${widA}/tokens`, 'POST', {
      name: 'read-test',
      scopes: ['items.read'],
    });
    token = issued.body.token;
    assert.equal(
      (await request(`workspaces/${widA}/items`, 'GET', undefined, { bearer: token })).status,
      200,
    );
    assert.equal(
      (
        await request(
          `workspaces/${widA}/items`,
          'POST',
          { title: 'not allowed' },
          { bearer: token },
        )
      ).status,
      403,
    );
    assert.equal(
      (await request(`workspaces/${widB}/items`, 'GET', undefined, { bearer: token })).status,
      403,
    );
    await request(`workspaces/${widA}/tokens/${issued.body.id}`, 'DELETE');
    assert.equal(
      (await request(`workspaces/${widA}/items`, 'GET', undefined, { bearer: token })).status,
      401,
    );
  });
  await t.test('AI 无效输出降级且不直接写入', async () => {
    const model = createServer((_, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ choices: [{ message: { content: 'not valid json' } }] }));
    });
    await new Promise<void>((resolve) => model.listen(55591, '127.0.0.1', resolve));
    try {
      const endpoint = await request('admin/ai-endpoints', 'POST', {
        name: `Mock ${unique}`,
        provider: 'openai',
        baseUrl: 'http://127.0.0.1:55591',
        model: 'mock',
        active: true,
      });
      assert.equal(endpoint.status, 201, JSON.stringify(endpoint.body));
      endpointId = endpoint.body.id;
      const listed = await request('admin/ai-endpoints');
      assert.equal(listed.body[0].hasKey, false);
      assert.equal('encryptedKey' in listed.body[0], false);
      assert.equal(
        (await request(`admin/ai-endpoints/${endpointId}/test`, 'POST', {})).status,
        200,
      );
      assert.equal(
        (
          await request(`workspaces/${widA}/settings/ai`, 'POST', {
            provider: 'openai',
            baseUrl: 'http://127.0.0.1:55591',
            model: 'mock',
          })
        ).status,
        403,
      );
      const count = await db.item.count({ where: { workspaceId: widA } });
      const result = await request(`workspaces/${widA}/ai`, 'POST', {
        text: '明天下午3点提醒我确认方案',
      });
      assert.equal(result.status, 200);
      assert.equal(result.body.mode, 'rules');
      assert.equal(await db.item.count({ where: { workspaceId: widA } }), count);
      assert.ok(result.body.draft.dueAt);
      assert.equal(
        (await db.aIJob.findUniqueOrThrow({ where: { id: result.body.jobId } })).status,
        'failed',
      );
    } finally {
      model.closeAllConnections();
      await new Promise<void>((resolve) => model.close(() => resolve()));
    }
  });
  await t.test('AI 合法输出可预览，超时有明确降级', async () => {
    let slow = false;
    const model = createServer((_, res) => {
      if (slow) return;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  title: 'AI valid proposal',
                  notes: 'grounded',
                  quadrant: 2,
                  subtasks: ['First step'],
                }),
              },
            },
          ],
        }),
      );
    });
    await new Promise<void>((resolve) => model.listen(55591, '127.0.0.1', resolve));
    try {
      const valid = await request(`workspaces/${widA}/ai`, 'POST', { text: '整理一个具体步骤' });
      assert.equal(valid.body.mode, 'ai');
      assert.equal(valid.body.draft.title, 'AI valid proposal');
      slow = true;
      const start = Date.now();
      const timeout = await request(`workspaces/${widA}/ai`, 'POST', {
        text: '一个需要超时回退的想法',
      });
      assert.equal(timeout.body.mode, 'rules');
      assert.ok(Date.now() - start >= 14000);
      assert.ok(Date.now() - start < 22000);
    } finally {
      model.closeAllConnections();
      await new Promise<void>((resolve) => model.close(() => resolve()));
    }
  });
  await t.test('AI 返回外空间项目不会写入', async () => {
    const model = createServer((_, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  title: 'Proposal',
                  notes: '',
                  quadrant: 2,
                  projectId: projectB,
                  subtasks: [],
                }),
              },
            },
          ],
        }),
      );
    });
    await new Promise<void>((resolve) => model.listen(55591, '127.0.0.1', resolve));
    try {
      const result = await request(`workspaces/${widA}/ai`, 'POST', { text: '下一步' });
      assert.equal(result.body.mode, 'rules');
      assert.notEqual(result.body.draft.projectId, projectB);
    } finally {
      model.closeAllConnections();
      await new Promise<void>((resolve) => model.close(() => resolve()));
    }
  });
  await t.test('确认草稿原子保存父子事项', async () => {
    const value = await request(`workspaces/${widA}/capture`, 'POST', {
      title: 'Captured',
      notes: '',
      quadrant: 2,
      subtasks: ['First step', 'Second step'],
      source: 'rules',
    });
    assert.equal(value.status, 201, JSON.stringify(value.body));
    assert.equal(await db.item.count({ where: { parentId: value.body.id, workspaceId: widA } }), 2);
  });
  await t.test('通知扫描重试去重，稍后提醒产生新日程', async () => {
    const { scanNotifications } = await import('../../src/lib/notifications');
    await scanNotifications();
    await scanNotifications();
    const reminder = await db.reminder.findFirstOrThrow({ where: { itemId } });
    const notices = await db.notification.findMany({
      where: { workspaceId: widA, dedupeKey: `${widA}:reminder:${reminder.id}` },
    });
    assert.equal(notices.length, 2);
    assert.equal(reminder.status, 'sent');
    const snooze = await request(`workspaces/${widA}/items/${itemId}/snooze`, 'POST', {
      minutes: 60,
    });
    assert.equal(snooze.status, 200);
    assert.equal(await db.reminder.count({ where: { itemId, status: 'pending' } }), 1);
  });
  await t.test('邮件失败重试，应用内通知仍保留', async () => {
    const { deliverNotifications } = await import('../../src/lib/notifications');
    const userId = (await request('auth/me')).body.user.id;
    await db.notificationPreference.update({
      where: { workspaceId_userId: { workspaceId: widA, userId } },
      data: { emailEnabled: true, quietStart: 0, quietEnd: 0, dailyLimit: 20 },
    });
    await deliverNotifications();
    assert.ok(
      await db.notification.count({
        where: { workspaceId: widA, userId, attempts: { gte: 1 }, lastError: { not: null } },
      }),
    );
    await db.notificationPreference.update({
      where: { workspaceId_userId: { workspaceId: widA, userId } },
      data: { emailEnabled: false },
    });
  });
  await t.test('完成取消提醒，归档保留历史和周报来源', async () => {
    const done = await request(`workspaces/${widA}/items/${itemId}`, 'PATCH', {
      version,
      status: 'done',
    });
    assert.equal(done.status, 200);
    version = done.body.version;
    assert.ok(done.body.completedAt);
    assert.equal(await db.reminder.count({ where: { itemId, status: 'pending' } }), 0);
    const archived = await request(`workspaces/${widA}/items/${itemId}`, 'PATCH', {
      version,
      archived: true,
    });
    assert.equal(archived.status, 200);
    const history = (await request(`workspaces/${widA}/items/${itemId}`)).body;
    assert.ok(history.archivedAt);
    assert.ok(history.events.some((e: { type: string }) => e.type === 'completed'));
    const report = await request(`workspaces/${widA}/reports`, 'POST', {
      startAt: new Date(Date.now() - 864e5).toISOString(),
      endAt: new Date(Date.now() + 864e5).toISOString(),
    });
    assert.equal(report.status, 201, JSON.stringify(report.body));
    assert.ok(report.body.sourceIds.includes(itemId));
    assert.match(report.body.content, new RegExp(itemId));
  });
  await t.test('服务端归档检索、日期筛选和导出', async () => {
    const archived = (await request(`workspaces/${widA}/items?archived=true&q=Idempotency`)).body;
    assert.equal(archived.items[0].id, itemId);
    const exported = await request(`workspaces/${widA}/export`);
    assert.equal(exported.body.format, 'orbit-export-v1');
    assert.ok(exported.body.events.length > 0);
    assert.equal((await request(`workspaces/${widA}/items?from=invalid`)).status, 400);
  });
  await t.test('星图坐标原子保存、跨象限、历史、幂等与冲突', async () => {
    const created = (
      await request(`workspaces/${widA}/items`, 'POST', { title: '星图移动验收', quadrant: 2 })
    ).body;
    const path = `workspaces/${widA}/items/${created.id}`;
    const key = randomUUID();
    const input = { version: 1, position: { x: -0.4, y: 0.6 } };
    const moved = await request(path, 'PATCH', input, { key });
    assert.equal(moved.status, 200);
    assert.equal(moved.body.quadrant, 3);
    assert.equal(moved.body.orbitX, -0.4);
    assert.equal(moved.body.orbitY, 0.6);
    assert.ok(moved.body.orbitPlacedAt);
    assert.equal((await request(path, 'PATCH', input, { key })).body.version, 2);
    const reread = (await request(path)).body;
    assert.equal(reread.orbitX, -0.4);
    assert.equal(reread.events[0].type, 'positioned');
    assert.equal(reread.events[0].data.after.quadrant, 3);
    assert.equal(
      (
        await request(
          path,
          'PATCH',
          { version: 2, position: { x: 0.4, y: 0.6 } },
          { cookie: cookieB },
        )
      ).status,
      403,
    );
    assert.equal(
      (await request(path, 'PATCH', { version: 1, position: { x: 0.4, y: 0.6 } })).status,
      409,
    );
    assert.equal(
      (await request(path, 'PATCH', { version: 2, position: { x: 2, y: 0.6 } })).status,
      400,
    );
    assert.equal(
      (await request(path, 'PATCH', { version: 2, quadrant: 4, position: { x: 0.4, y: 0.6 } }))
        .status,
      400,
    );
    const reset = await request(path, 'PATCH', { version: 2, quadrant: 1 });
    assert.equal(reset.body.orbitX, null);
    assert.equal(reset.body.orbitPlacedAt, null);
  });
  await t.test('黑洞删除：隔离、幂等、子事项、停止提醒、审计及恢复', async () => {
    const root = (
      await request(`workspaces/${widA}/items`, 'POST', {
        title: '黑洞父事项',
        quadrant: 2,
        reminderAt: new Date(Date.now() + 3600000).toISOString(),
      })
    ).body;
    const child = (
      await request(`workspaces/${widA}/items`, 'POST', {
        title: '一同删除的子事项',
        parentId: root.id,
      })
    ).body;
    const earlier = (
      await request(`workspaces/${widA}/items`, 'POST', {
        title: '事先删除的子事项',
        parentId: root.id,
      })
    ).body;
    const route = `workspaces/${widA}/items/${root.id}`;
    assert.equal(
      (await request(`workspaces/${widA}/items/${earlier.id}`, 'DELETE', { version: 1 })).status,
      200,
    );
    assert.equal((await request(route, 'DELETE', { version: 1 }, { cookie: cookieB })).status, 403);
    const viewer = await request(
      'auth/login',
      'POST',
      { email: `viewer-${unique}@orbit.test`, password: 'Viewer-test-password' },
      { cookie: '' },
    );
    assert.equal(
      (await request(route, 'DELETE', { version: 1 }, { cookie: viewer.cookie })).status,
      403,
    );
    const key = randomUUID();
    const removed = await request(route, 'DELETE', { version: 1 }, { key });
    assert.equal(removed.status, 200, JSON.stringify(removed.body));
    assert.ok(removed.body.item.deletedAt);
    assert.equal(removed.body.item.status, 'open');
    assert.deepEqual(new Set(removed.body.affectedIds), new Set([root.id, child.id]));
    assert.equal((await request(route, 'DELETE', { version: 1 }, { key })).body.item.version, 2);
    assert.equal((await request(route, 'DELETE', { version: 1 })).status, 409);
    assert.equal((await request(route, 'PATCH', { version: 2, status: 'done' })).status, 409);
    assert.equal((await request(`${route}/snooze`, 'POST', { minutes: 60 })).status, 409);
    assert.equal((await request(`workspaces/${widA}/items?all=true&q=黑洞父事项`)).body.total, 0);
    assert.equal(
      (await request(`workspaces/${widA}/items?deleted=true&q=黑洞父事项`)).body.total,
      1,
    );
    assert.equal(await db.reminder.count({ where: { itemId: root.id, status: 'pending' } }), 0);
    assert.equal((await request(route)).body.events[0].type, 'deleted');
    assert.equal(
      (await request(`workspaces/${widA}/items/${child.id}/restore`, 'POST', { version: 2 }))
        .status,
      409,
    );
    assert.equal(
      (await request(`${route}/restore`, 'POST', { version: 2 }, { cookie: viewer.cookie })).status,
      403,
    );
    const restored = await request(`${route}/restore`, 'POST', { version: 2 });
    assert.equal(restored.status, 200, JSON.stringify(restored.body));
    assert.equal(restored.body.item.deletedAt, null);
    assert.equal((await request(`workspaces/${widA}/items/${child.id}`)).body.deletedAt, null);
    assert.ok((await request(`workspaces/${widA}/items/${earlier.id}`)).body.deletedAt);
    assert.equal((await request(route)).body.events[0].type, 'undeleted');
  });
  if (endpointId) await request(`admin/ai-endpoints/${endpointId}`, 'DELETE');
  await db.$disconnect();
});
