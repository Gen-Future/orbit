import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
test('桌面和手机工作台布局', async ({ browser }) => {
  for (const [name, width, height] of [
    ['desktop', 1440, 1050],
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
    await page
      .getByLabel('密码', { exact: true })
      .fill(process.env.SEED_PASSWORD || 'Orbit-Demo-2026');
    await page.getByRole('button', { name: '进入 Orbit', exact: true }).click();
    await page.getByRole('button', { name: '打开工作舱' }).click();
    await page.getByRole('button', { name: '今日轨道', exact: true }).click();
    await expect(page.getByText('打磨 Orbit 的第一份产品方案', { exact: true })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: `.impeccable/review/${name}.png`,
      fullPage: true,
      animations: 'disabled',
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBeTruthy();
    if (name === 'mobile') {
      const scrollArea = await page.locator('.main-content').boundingBox();
      const dock = await page.locator('.capture-dock').boundingBox();
      expect(scrollArea!.y + scrollArea!.height).toBeLessThanOrEqual(dock!.y + 1);
      const complete = page.getByRole('button', { name: '完成这件事', exact: true });
      await complete.scrollIntoViewIfNeeded();
      const target = await complete.boundingBox();
      // Browser layout uses subpixel positions; allow one device-independent pixel.
      expect(target!.y + target!.height).toBeLessThanOrEqual(dock!.y + 1);
      await page.screenshot({
        path: '.impeccable/review/mobile-completion.png',
        animations: 'disabled',
      });
    }

    if (name === 'mobile') {
      await page.getByRole('button', { name: '打开导航' }).click();
      await expect(page.getByRole('button', { name: '关闭导航', exact: true })).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('button', { name: '打开导航' })).toBeFocused();
      await page.getByRole('button', { name: '打开导航' }).click();
    }
    await page.getByRole('button', { name: '四象限', exact: true }).click();
    await expect(page.locator('.nebula-matrix')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBeTruthy();
    await page.getByRole('button', { name: '打开工作舱' }).click();
    await page.getByRole('button', { name: '空间设置', exact: true }).click();
    await expect(page.getByRole('heading', { name: '你的 Orbit，你来定义。' })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBeTruthy();
    expect(errors).toEqual([]);
    await context.close();
  }
});
test('UI 完整事项闭环与持久化', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  const email = `ui-${randomUUID()}@orbit.test`;
  await page.goto('http://localhost:3001');
  await page.getByRole('button', { name: '还没有账号？创建一个' }).click();
  await page.getByLabel('如何称呼你').fill('UI Tester');
  await page.getByLabel('邮箱', { exact: true }).fill(email);
  await page.getByLabel('密码', { exact: true }).fill('UI-test-password');
  await page.getByRole('button', { name: '创建账号', exact: true }).click();
  await expect(page.locator('.nebula-matrix')).toBeVisible();
  await page.getByLabel('自然语言记录事项').fill('明天下午三点提醒我处理端到端验收事项');
  await page.getByRole('button', { name: '解析并放入轨道', exact: true }).click();
  const panel = page.getByRole('dialog');
  await expect(panel.getByLabel('提醒时间')).not.toHaveValue('');
  await panel.getByLabel('事项名称').fill('端到端验收事项');
  await panel.getByLabel('注意力坐标').selectOption('1');
  await panel.getByLabel('补充说明').fill('验证记录、完成、归档和周报来源');
  await panel.getByRole('button', { name: '确认记录' }).click();
  await expect(panel).not.toBeVisible();
  await expect(page.getByText('端到端验收事项', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: '打开工作舱' }).click();
  await page.getByRole('button', { name: '今日轨道', exact: true }).click();
  await expect(page.getByText('端到端验收事项', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '完成这件事', exact: true }).click();
  await expect(page.getByText('又向前了一步。')).toBeVisible();
  await page.getByRole('button', { name: '时光回放', exact: true }).click();
  await page.locator('.history-list .task-main').filter({ hasText: '端到端验收事项' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: '归档保留' }).click();
  await expect(page.getByRole('button', { name: '恢复事项' })).toBeVisible();
  await page.getByRole('button', { name: '关闭面板' }).click();
  await page.getByLabel('归档状态').selectOption('archived');
  await expect(page.getByText('端到端验收事项', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: '周报', exact: true }).click();
  await page
    .getByLabel('结束日期（不含）')
    .fill(new Date(Date.now() + 864e5).toISOString().slice(0, 10));
  await page.getByRole('button', { name: '生成有来源的周报' }).click();
  await expect(page.getByLabel('周报内容')).toHaveValue(/端到端验收事项/);
  await page.locator('.report-sources button').first().click();
  await expect(page.getByRole('dialog').getByLabel('事项名称')).toHaveValue('端到端验收事项');
  const detail = page.getByRole('dialog');
  await expect(detail.getByRole('group', { name: '快速切换事项状态' })).toBeVisible();
  await detail.getByRole('button', { name: '进行中' }).click();
  await expect(detail.getByRole('button', { name: '进行中' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await detail.evaluate((node) => {
    node.scrollTop = 0;
  });
  await page.screenshot({
    path: '.impeccable/review/detail-status-desktop.png',
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await detail.evaluate((node) => {
    node.scrollTop = 0;
  });
  await page.screenshot({
    path: '.impeccable/review/detail-status-mobile.png',
    animations: 'disabled',
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  const mobilePanel = await detail.boundingBox();
  const mobileFields = await detail.locator('.form-grid input, .form-grid select').all();
  for (const field of mobileFields) {
    const box = await field.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(mobilePanel!.x);
    expect(box!.x + box!.width).toBeLessThanOrEqual(mobilePanel!.x + mobilePanel!.width + 1);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await detail.getByRole('button', { name: '删除事项及子事项' }).click();
  await expect(detail.getByText('确认删除这颗星体？')).toBeVisible();
  await page.screenshot({
    path: '.impeccable/review/detail-status-and-delete.png',
    animations: 'disabled',
  });
  await detail.getByRole('button', { name: '取消', exact: true }).click();
  await expect(detail.getByText('确认删除这颗星体？')).toBeHidden();
  await context.close();
});
test('PWA 元数据与安全离线页', async ({ page, context }) => {
  await page.goto('http://localhost:3000');
  const manifest = await page.request.get('/manifest.webmanifest');
  expect((await manifest.json()).display).toBe('standalone');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await context.setOffline(true);
  await page.goto('http://localhost:3000');
  await expect(page.getByRole('heading', { name: '轨道还在，连接暂歇。' })).toBeVisible();
  await context.setOffline(false);
});
