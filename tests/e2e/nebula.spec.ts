import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
async function enterMap(page: Page) {
  await expect(page.locator('.main-wrap')).toBeVisible();
  if (await page.locator('.nebula-matrix').isVisible()) return;
  if (await page.getByRole('button', { name: '打开导航', exact: true }).isVisible())
    await page.getByRole('button', { name: '打开导航', exact: true }).click();
  await page.getByRole('button', { name: '四象限', exact: true }).click();
  await expect(page.locator('.nebula-matrix')).toBeVisible();
}
async function createSedimentItems(page: Page, workspaceId: string, count = 4) {
  const dueAt = new Date(Date.now() - 10 * 864e5).toISOString();
  for (let index = 0; index < count; index++) {
    const response = await page.request.post(
      `http://localhost:3001/api/v1/workspaces/${workspaceId}/items`,
      {
        headers: {
          Origin: 'http://localhost:3001',
          'Idempotency-Key': randomUUID(),
        },
        data: {
          title: `沉积事项 ${index + 1}`,
          quadrant: (index % 4) + 1,
          dueAt,
        },
      },
    );
    expect(response.status()).toBe(201);
  }
}
test('星图桌面与手机：画布、坐标、沉浸、缩放及减少动效', async ({ browser }) => {
  for (const [name, width, height] of [
    ['desktop', 1440, 1000],
    ['mobile', 390, 844],
  ] as const) {
    const context = await browser.newContext({
      viewport: { width, height },
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://localhost:3000');
    await page.getByLabel('邮箱', { exact: true }).fill('demo@orbit.local');
    await page.getByLabel('密码', { exact: true }).fill('Orbit-Demo-2026');
    await page.getByRole('button', { name: '进入 Orbit', exact: true }).click();
    await enterMap(page);
    await expect(page.locator('.nebula-item').first()).toBeVisible();
    await expect(page.locator('.sidebar')).toBeHidden();
    await expect(page.locator('.topbar')).toBeHidden();
    await expect(page.locator('.nebula-sun')).toBeVisible();
    await page.getByRole('button', { name: '选择添加事项的星区' }).click();
    await expect(page.getByRole('button', { name: '在应变星区添加事项' })).toBeVisible();
    await expect(page.getByRole('button', { name: '在留白星区添加事项' })).toBeVisible();
    await page.getByRole('button', { name: '选择添加事项的星区' }).click();
    await expect(page.locator('.nebula-blackhole')).toHaveCount(0);
    await page.getByRole('button', { name: '打开工作舱' }).click();
    await expect(page.getByRole('dialog', { name: '主导航' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: '打开工作舱' })).toBeFocused();
    await page.getByRole('button', { name: '打开工作舱' }).evaluate((node) => node.blur());
    const composer = (await page.locator('.nebula-intent').boundingBox())!;
    expect(composer.height).toBeLessThanOrEqual(64);
    expect(composer.y + composer.height).toBeLessThan(height);
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await page.screenshot({
      path: `.impeccable/review/nebula-${name}.png`,
      animations: 'disabled',
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBeTruthy();
    expect(
      await page
        .locator('.nebula-star')
        .first()
        .evaluate((node) => getComputedStyle(node).animationName),
    ).toBe('none');
    const bounds = await page.locator('.nebula-field').boundingBox();
    for (const star of await page.locator('.nebula-item').all()) {
      const rect = await star.boundingBox();
      expect(rect!.x).toBeGreaterThanOrEqual(bounds!.x);
      expect(rect!.x + rect!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width);
    }
    const labels = await page.locator('.nebula-item').evaluateAll((nodes) =>
      nodes.map((node) => {
        const b = node.getBoundingClientRect();
        return { x: b.x, y: b.y, width: b.width, height: b.height };
      }),
    );
    for (let i = 0; i < labels.length; i++)
      for (let j = i + 1; j < labels.length; j++) {
        const a = labels[i],
          b = labels[j];
        expect(
          a.x + a.width <= b.x ||
            b.x + b.width <= a.x ||
            a.y + a.height <= b.y ||
            b.y + b.height <= a.y,
        ).toBeTruthy();
      }
    const shell = await page.locator('.nebula-map-shell').boundingBox();
    const controls = await page.locator('.nebula-map-controls').boundingBox();
    expect(controls!.y).toBeGreaterThanOrEqual(shell!.y + shell!.height - 1);
    await expect(page.getByRole('button', { name: '放入星图', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '放大星图', exact: true }).click();
    await expect(page.getByRole('button', { name: '重置星图缩放' })).toHaveText('125%');
    await page.getByRole('button', { name: '重置星图缩放' }).click();
    await page.getByRole('button', { name: '进入沉浸模式' }).click();
    await expect(page.locator('.topbar')).toBeHidden();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await page.screenshot({
      path: `.impeccable/review/nebula-${name}-immersive.png`,
      animations: 'disabled',
    });
    await page.getByRole('button', { name: '退出沉浸模式' }).click();
    await expect(page.locator('.topbar')).toBeHidden();
    await page.locator('.nebula-item').first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(errors).toEqual([]);
    await context.close();
  }
});
test('星体拖动：象限内保存、跨象限、刷新、取消、错误回退及键盘', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await page.goto('http://localhost:3001');
  const registered = await page.request.post('http://localhost:3001/api/v1/auth/register', {
    headers: { Origin: 'http://localhost:3001' },
    data: {
      email: `nebula-${randomUUID()}@orbit.test`,
      password: 'Orbit-nebula-test-password',
      name: 'Nebula tester',
    },
  });
  expect(registered.status()).toBe(200);
  const me = await (await page.request.get('http://localhost:3001/api/v1/auth/me')).json();
  const prefix = `http://localhost:3001/api/v1/workspaces/${me.memberships[0].workspace.id}`;
  const created = await (
    await page.request.post(`${prefix}/items`, {
      headers: { Origin: 'http://localhost:3001', 'Idempotency-Key': randomUUID() },
      data: { title: '可拖动验收星体', quadrant: 2 },
    })
  ).json();
  const read = async () => await (await page.request.get(`${prefix}/items/${created.id}`)).json();
  await page.reload();
  await enterMap(page);
  const star = page.locator(`[data-item-id="${created.id}"]`);
  async function dragBy(dx: number, dy: number, cancel = false) {
    const rect = await star.boundingBox();
    await page.mouse.move(rect!.x + rect!.width / 2, rect!.y + 20);
    await page.mouse.down();
    await page.mouse.move(rect!.x + rect!.width / 2 + dx, rect!.y + 20 + dy, { steps: 12 });
    if (cancel) await page.keyboard.press('Escape');
    await page.mouse.up();
  }
  await dragBy(40, -20);
  await expect.poll(async () => (await read()).version).toBe(2);
  const inside = await read();
  expect(inside.quadrant).toBe(2);
  expect(inside.orbitX).not.toBeNull();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const field = await page.locator('.nebula-field').boundingBox();
  await dragBy(-field!.width * 0.55, -field!.height * 0.5);
  await expect.poll(async () => (await read()).version).toBe(3);
  expect((await read()).quadrant).toBe(3);
  const beforeRefresh = await star.boundingBox();
  await page.reload();
  await enterMap(page);
  await expect(star).toHaveAttribute('data-quadrant', '3');
  const afterRefresh = await star.boundingBox();
  expect(Math.abs(beforeRefresh!.x - afterRefresh!.x)).toBeLessThan(1);
  await dragBy(80, 20, true);
  expect((await read()).version).toBe(3);
  await page.route(`**/items/${created.id}`, (route) =>
    route.request().method() === 'PATCH'
      ? route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ error: '事项已被更新，请刷新后再修改' }),
        })
      : route.continue(),
  );
  await dragBy(50, 20);
  await expect(page.locator('.error-banner')).toContainText('事项已被更新');
  expect((await read()).version).toBe(3);
  await page.unroute(`**/items/${created.id}`);
  await star.focus();
  await page.keyboard.press('Alt+ArrowDown');
  await expect.poll(async () => (await read()).version).toBe(4);
  await star.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await context.close();
});

test('时间沉积带：桌面星团、手机入口、抽屉完成与批量改期', async ({ browser }) => {
  for (const [name, width, height] of [
    ['desktop', 1440, 1000],
    ['mobile', 390, 844],
  ] as const) {
    const context = await browser.newContext({
      viewport: { width, height },
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const registered = await page.request.post('http://localhost:3001/api/v1/auth/register', {
      headers: { Origin: 'http://localhost:3001' },
      data: {
        email: `sediment-${name}-${randomUUID()}@orbit.test`,
        password: 'Orbit-sediment-test-password',
        name: 'Sediment tester',
      },
    });
    expect(registered.status()).toBe(200);
    const me = await page.request.get('http://localhost:3001/api/v1/auth/me');
    const workspaceId = (await me.json()).memberships[0].workspace.id;
    await createSedimentItems(page, workspaceId);
    await page.goto('http://localhost:3001');
    await enterMap(page);
    await expect(page.locator('.nebula-item').filter({ hasText: '沉积事项' })).toHaveCount(0);
    await expect(page.locator('.nebula-pagination')).toContainText('4 件沉积');
    if (name === 'desktop') {
      await expect(page.locator('.sediment-cluster')).toHaveCount(4);
      await expect(page.locator('.sediment-mobile-trigger')).toBeHidden();
      await page.locator('.sediment-cluster').first().click();
    } else {
      await expect(page.locator('.sediment-clusters')).toBeHidden();
      await page.getByRole('button', { name: '打开时间沉积带，共 4 件事项' }).click();
    }
    await expect(page.getByRole('dialog', { name: '时间沉积带' })).toBeVisible();
    await expect(page.locator('.sediment-row')).toHaveCount(name === 'desktop' ? 1 : 4);
    await page.screenshot({
      path: `.impeccable/review/sediment-${name}.png`,
      animations: 'disabled',
    });
    if (name === 'desktop') {
      await page.getByRole('button', { name: '全部', exact: true }).click();
      await expect(page.locator('.sediment-row')).toHaveCount(4);
      await page.locator('.sediment-row').first().getByRole('checkbox').check();
      await page.locator('.sediment-row').nth(1).getByRole('checkbox').check();
      const future = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 16);
      await page.getByLabel('新的截止时间').fill(future);
      await page.getByRole('button', { name: '重新安排', exact: true }).click();
      await expect(page.locator('.sediment-message')).toContainText('已重新安排 2 件事项');
      await expect(page.locator('.sediment-row')).toHaveCount(2);
      await page
        .getByRole('button', { name: /完成 沉积事项/ })
        .first()
        .click();
      await expect(page.locator('.sediment-row')).toHaveCount(1);
    }
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: '时间沉积带' })).toBeHidden();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBeTruthy();
    await context.close();
  }
});
test('手机触屏可以跨象限拖动', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await page.goto('http://localhost:3001');
  await page.request.post('http://localhost:3001/api/v1/auth/register', {
    headers: { Origin: 'http://localhost:3001' },
    data: {
      email: `touch-${randomUUID()}@orbit.test`,
      password: 'Orbit-nebula-test-password',
      name: 'Touch tester',
    },
  });
  const me = await (await page.request.get('http://localhost:3001/api/v1/auth/me')).json();
  const prefix = `http://localhost:3001/api/v1/workspaces/${me.memberships[0].workspace.id}`;
  const item = await (
    await page.request.post(`${prefix}/items`, {
      headers: { Origin: 'http://localhost:3001', 'Idempotency-Key': randomUUID() },
      data: { title: '手机跨象限', quadrant: 4 },
    })
  ).json();
  await page.reload();
  await enterMap(page);
  const star = page.locator(`[data-item-id="${item.id}"]`);
  const box = await star.boundingBox();
  const field = await page.locator('.nebula-field').boundingBox();
  const session = await context.newCDPSession(page);
  const x = box!.x + box!.width / 2,
    y = box!.y + 20;
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= 10; i++)
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: x + (field!.width * 0.5 * i) / 10, y: y - (field!.height * 0.4 * i) / 10 },
      ],
    });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect
    .poll(
      async () => (await (await page.request.get(`${prefix}/items/${item.id}`)).json()).quadrant,
    )
    .toBe(1);
  await context.close();
});

test('太阳完成与黑洞删除：取消、失败恢复、吸入动效、撤销及手机触屏', async ({ browser }) => {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
      viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
      hasTouch: mobile,
      isMobile: mobile,
      reducedMotion: mobile ? 'reduce' : 'no-preference',
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const base = 'http://localhost:3001';
    await page.goto(base);
    expect(
      (
        await page.request.post(`${base}/api/v1/auth/register`, {
          headers: { Origin: base },
          data: {
            email: `cosmos-${randomUUID()}@orbit.test`,
            password: 'Orbit-cosmos-test-password',
            name: 'Orbit explorer',
          },
        })
      ).status(),
    ).toBe(200);
    const me = await (await page.request.get(`${base}/api/v1/auth/me`)).json();
    const prefix = `${base}/api/v1/workspaces/${me.memberships[0].workspace.id}`;
    const create = async (title: string, quadrant: number) =>
      (
        await page.request.post(`${prefix}/items`, {
          headers: { Origin: base, 'Idempotency-Key': randomUUID() },
          data: { title, quadrant },
        })
      ).json();
    const solar = await create('完成发布方案，点亮太阳', 2);
    const hole = await create('删除不再需要的旧草稿', 4);
    const read = async (id: string) => (await page.request.get(`${prefix}/items/${id}`)).json();
    await page.reload();
    await enterMap(page);
    const touch = mobile ? await context.newCDPSession(page) : null;
    async function move(x: number, y: number) {
      if (touch)
        await touch.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x, y }],
        });
      else await page.mouse.move(x, y, { steps: 8 });
    }
    async function start(id: string) {
      const b = (await page.locator(`[data-item-id="${id}"]`).boundingBox())!;
      const x = b.x + b.width / 2,
        y = b.y + b.height / 2;
      if (touch)
        await touch.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ x, y }],
        });
      else {
        await page.mouse.move(x, y);
        await page.mouse.down();
      }
      await expect(page.locator('.nebula-blackhole')).toHaveCount(0);
      await move(x + 20, y - 20);
      await expect(page.locator('.nebula-blackhole')).toBeVisible();
    }
    async function target(name: 'sun' | 'blackhole') {
      const b = (await page
        .locator(name === 'sun' ? '.nebula-sun' : '.blackhole-target')
        .boundingBox())!;
      await move(b.x + b.width / 2, b.y + b.height / 2);
      await expect(page.locator(`.nebula-${name}`)).toHaveClass(/is-target/);
    }
    async function release() {
      if (touch)
        await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      else await page.mouse.up();
    }
    if (!mobile) {
      await start(solar.id);
      await target('sun');
      await page.keyboard.press('Escape');
      await release();
      expect((await read(solar.id)).version).toBe(1);
      await start(hole.id);
      await target('blackhole');
      await page.locator(`[data-item-id="${hole.id}"]`).dispatchEvent('pointercancel');
      await release();
      expect((await read(hole.id)).deletedAt).toBeNull();
      await page.route(`**/items/${hole.id}`, (route) =>
        route.request().method() === 'DELETE'
          ? route.fulfill({ status: 409, json: { error: '删除保存冲突，请刷新重试' } })
          : route.continue(),
      );
      await start(hole.id);
      await target('blackhole');
      await release();
      await expect(page.locator('.error-banner')).toContainText('删除保存冲突');
      await expect(page.locator(`[data-item-id="${hole.id}"]`)).toBeVisible();
      expect((await read(hole.id)).deletedAt).toBeNull();
      await page.unroute(`**/items/${hole.id}`);
      await page.getByRole('button', { name: '关闭错误提示' }).click();
    }
    await start(solar.id);
    await target('sun');
    await release();
    await expect.poll(async () => (await read(solar.id)).status).toBe('done');
    await expect(page.locator('.celebration')).toContainText(solar.title);
    if (!mobile)
      await expect(page.locator('.stellar-flight[data-outcome="complete"]')).toBeVisible();
    await expect(page.locator(`[data-item-id="${solar.id}"]`)).toHaveCount(0);
    expect((await read(solar.id)).deletedAt).toBeNull();
    await expect(page.locator('.nebula-blackhole')).toHaveCount(0);
    await expect(page.locator('.celebration')).toBeHidden();
    await start(hole.id);
    await target('blackhole');
    await page.screenshot({
      path: `.impeccable/review/cosmos-blackhole-${mobile ? 'mobile' : 'desktop'}.png`,
      animations: 'disabled',
    });
    await release();
    await expect.poll(async () => Boolean((await read(hole.id)).deletedAt)).toBe(true);
    expect((await read(hole.id)).status).toBe('open');
    await expect(page.locator(`[data-item-id="${hole.id}"]`)).toHaveCount(0);
    if (!mobile) await expect(page.locator('.stellar-flight[data-outcome="delete"]')).toBeVisible();
    await page.getByRole('button', { name: '撤销删除' }).click();
    await expect.poll(async () => (await read(hole.id)).deletedAt).toBeNull();
    await expect(page.locator(`[data-item-id="${hole.id}"]`)).toBeVisible();
    // Deleting from the accessible detail action uses the same path and can be restored after reload.
    await page.locator(`[data-item-id="${hole.id}"]`).click();
    await page.getByRole('button', { name: '删除事项（含子事项）' }).click();
    await expect.poll(async () => Boolean((await read(hole.id)).deletedAt)).toBe(true);
    await page.reload();
    await enterMap(page);
    await page.getByRole('button', { name: '打开工作舱' }).click();
    await page.getByRole('button', { name: '时光回放', exact: true }).click();
    await page.getByLabel('归档状态').selectOption('deleted');
    await page.locator('.history-list .task-main').filter({ hasText: hole.title }).click();
    await page.getByRole('button', { name: '恢复已删除事项' }).click();
    await expect.poll(async () => (await read(hole.id)).deletedAt).toBeNull();
    expect(errors).toEqual([]);
    await context.close();
  }
});
