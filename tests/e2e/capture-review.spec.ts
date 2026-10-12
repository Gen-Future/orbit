import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

async function register(page: Page) {
  await page.goto('http://localhost:3001');
  await page.getByRole('button', { name: '还没有账号？创建一个' }).click();
  await page.getByLabel('如何称呼你').fill('Capture Review');
  await page.getByLabel('邮箱', { exact: true }).fill(`review-${randomUUID()}@orbit.test`);
  await page.getByLabel('密码', { exact: true }).fill('UI-test-password');
  await page.getByRole('button', { name: '创建账号', exact: true }).click();
  await expect(page.locator('.nebula-matrix')).toBeVisible();
}
const baseDraft = {
  title: '整理客户反馈并提交产品方案',
  notes: '保留原始反馈，先确认最值得推进的改动。',
  quadrant: 2,
  triageStatus: 'pending',
  projectId: null,
  plannedAt: null,
  dueAt: null,
  reminderAt: null,
  subtasks: [],
};
const names: Record<number, string> = {
  1: '行动星区',
  2: '生长星区',
  3: '应变星区',
  4: '留白星区',
};

test('待整理 AI 草稿可一键进入全部四象限，也可明确保存收件箱', async ({ browser }) => {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: 844 },
      serviceWorkers: 'block',
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await register(page);
    await page.route('**/api/v1/workspaces/*/ai', (route) => {
      const draft = { ...baseDraft, title: route.request().postDataJSON().text };
      return route.fulfill({
        json: {
          draft,
          drafts: [draft],
          mode: 'ai',
          fallbackReason: null,
          message: '已整理',
          insights: [
            {
              classificationReason: '需要你判断这件事的重要性，先保留待整理。',
              clarification: '',
              similar: [],
            },
          ],
        },
      });
    });
    for (const q of [1, 2, 3, 4, 0]) {
      const title = q ? `${names[q]}：整理反馈与方案` : '暂存一件尚未决定优先级的事项';
      await page.getByLabel('自然语言记录事项').fill(title);
      await page.getByRole('button', { name: '解析并放入轨道', exact: true }).click();
      const panel = page.getByRole('dialog');
      await expect(panel.getByRole('button', { name: '保存到收件箱' })).toBeVisible();
      await expect(panel.getByLabel('补充说明')).toBeHidden();
      if (q) {
        await panel.getByRole('radio', { name: new RegExp(`^${names[q]}`) }).check();
        await expect(panel.getByRole('button', { name: '放入四象限' })).toBeVisible();
      }
      if (q === 1) {
        await page.screenshot({
          path: `.impeccable/review/capture-review-${width}.png`,
          animations: 'disabled',
        });
        await panel.getByText('修改细节', { exact: true }).click();
        await panel.getByLabel('补充说明').fill('在保留 AI 建议的基础上加入自己的说明');
        const footer = await panel.locator('.capture-footer').boundingBox();
        expect(footer!.y + footer!.height).toBeLessThanOrEqual(844);
        const button = panel.getByRole('button', { name: '放入四象限' });
        expect(
          await button.evaluate((node) => {
            const r = node.getBoundingClientRect();
            return (
              document
                .elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
                ?.closest('button') === node
            );
          }),
        ).toBeTruthy();
      }
      if (q === 2) {
        let firstKey = '';
        await page.route(
          '**/api/v1/workspaces/*/capture',
          async (route) => {
            firstKey = route.request().headers()['idempotency-key'];
            await route.fulfill({ status: 503, json: { error: '暂时无法保存，请重试' } });
          },
          { times: 1 },
        );
        await panel.getByRole('button', { name: '放入四象限', exact: true }).click();
        await expect(panel.getByRole('alert')).toContainText('内容已保留');
        await expect(panel.getByLabel('事项名称')).toHaveValue(title);
        await expect(panel.getByRole('radio', { name: /^生长星区/ })).toBeChecked();
        const retryRequest = page.waitForRequest(
          (request) => request.url().endsWith('/capture') && request.method() === 'POST',
        );
        const retryResponse = page.waitForResponse(
          (response) =>
            response.url().endsWith('/capture') && response.request().method() === 'POST',
        );
        await panel.getByRole('button', { name: '放入四象限', exact: true }).click();
        expect((await retryRequest).headers()['idempotency-key']).toBe(firstKey);
        const retrySaved = await (await retryResponse).json();
        expect(retrySaved).toMatchObject({ quadrant: 2, triageStatus: 'triaged' });
        await expect(panel).toBeHidden();
        continue;
      }
      const savedResponse = page.waitForResponse(
        (response) => response.url().endsWith('/capture') && response.request().method() === 'POST',
      );
      await panel
        .getByRole('button', { name: q ? '放入四象限' : '保存到收件箱', exact: true })
        .click();
      const response = await savedResponse;
      expect(response.status()).toBe(201);
      const saved = await response.json();
      expect(saved.triageStatus).toBe(q ? 'triaged' : 'pending');
      expect(saved.quadrant).toBe(q || 2);
      await expect(panel).toBeHidden();
      if (q)
        await expect(page.locator('.nebula-item').filter({ hasText: title })).toHaveAttribute(
          'data-quadrant',
          String(q),
        );
      if (q === 4) {
        await page.reload();
        await expect(page.locator('.nebula-item').filter({ hasText: title })).toHaveAttribute(
          'data-quadrant',
          '4',
        );
      }
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBeTruthy();
    expect(errors).toEqual([]);
    await context.close();
  }
});

test('批量可直接归类、保留收件箱和取消选择，分类刷新后仍保留', async ({ browser }) => {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: 844 },
      serviceWorkers: 'block',
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    await register(page);
    const drafts = [
      baseDraft,
      { ...baseDraft, title: '跟进合同的待确认问题' },
      { ...baseDraft, title: '暂时不添加的想法' },
    ];
    await page.route('**/api/v1/workspaces/*/ai', (route) =>
      route.fulfill({
        json: {
          draft: drafts[0],
          drafts,
          mode: 'ai',
          fallbackReason: null,
          message: '已整理',
          insights: [],
        },
      }),
    );
    await page.getByLabel('自然语言记录事项').fill('整理客户反馈；跟进合同；记录一个想法');
    await page.getByRole('button', { name: '解析并放入轨道', exact: true }).click();
    const panel = page.getByRole('dialog');
    const first = panel.getByRole('group', { name: '事项 1 放入位置' });
    await first.getByRole('radio', { name: /^生长星区/ }).focus();
    await page.keyboard.press('Space');
    await expect(first.getByRole('radio', { name: /^生长星区/ })).toBeChecked();
    await panel.getByLabel('选择事项 3').uncheck();
    await panel.getByLabel('事项 1 名称').fill('校对客户反馈与方案');
    await page.reload();
    await expect(
      page
        .getByRole('group', { name: '事项 1 放入位置' })
        .getByRole('radio', { name: /^生长星区/ }),
    ).toBeChecked();
    await expect(page.getByLabel('选择事项 3')).not.toBeChecked();
    await page.screenshot({
      path: `.impeccable/review/capture-batch-review-${width}.png`,
      animations: 'disabled',
    });
    await expect(panel.locator('.capture-footer')).toContainText('1 件进入四象限');
    const savedResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/capture-batch') && response.request().method() === 'POST',
    );
    await panel.getByRole('button', { name: '添加 2 件', exact: true }).click();
    const response = await savedResponse;
    expect(response.status()).toBe(201);
    const saved = await response.json();
    expect(saved.items).toHaveLength(2);
    expect(saved.items[0]).toMatchObject({
      title: '校对客户反馈与方案',
      quadrant: 2,
      triageStatus: 'triaged',
    });
    expect(saved.items[1].triageStatus).toBe('pending');
    await expect(panel).toBeHidden();
    await context.close();
  }
});
