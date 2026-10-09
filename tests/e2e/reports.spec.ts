import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { standardReportDefinition, shiftDate } from '../../packages/core/src/reports';

test('周报铸造舱：自动周历、风格引导、素材选择、最终稿与下周点火', async ({ browser }) => {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
      viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1050 },
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const base = 'http://localhost:3001';
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base);
    await page.getByRole('button', { name: '还没有账号？创建一个' }).click();
    await page.getByLabel('如何称呼你').fill('Report explorer');
    await page.getByLabel('邮箱', { exact: true }).fill(`foundry-${randomUUID()}@orbit.test`);
    await page.getByLabel('密码', { exact: true }).fill('Foundry-test-2026');
    await page.getByRole('button', { name: '创建账号', exact: true }).click();
    await expect(page.locator('.nebula-matrix')).toBeVisible();
    const me = await (await page.request.get(`${base}/api/v1/auth/me`)).json();
    const prefix = `${base}/api/v1/workspaces/${me.memberships[0].workspace.id}`;
    const create = async (title: string, other: Record<string, unknown> = {}) =>
      await (
        await page.request.post(`${prefix}/items`, {
          headers: { Origin: base, 'Idempotency-Key': randomUUID() },
          data: { title, ...other },
        })
      ).json();
    const first = await create('完成周报工作台设计', { notes: '验证桌面和手机布局', quadrant: 2 });
    const omitted = await create('需要排除的测试事项', { quadrant: 4 });
    const historical = await create('回顾上周方案', {
      occurredAt: '2026-01-05T00:00:00Z',
      quadrant: 2,
    });
    await page.reload();
    await page.getByRole('button', { name: '打开工作舱' }).click();
    await page.getByRole('button', { name: '周报', exact: true }).click();
    await expect(page.getByRole('heading', { name: '把这一周，铸成你的表达。' })).toBeVisible();
    await expect(page.locator('.foundry-day')).toHaveCount(7);
    await expect(page.locator('.foundry-loading')).toHaveCount(0);
    await expect(page.getByRole('checkbox', { name: `选入周报：${first.title}` })).toBeChecked();
    await page.getByRole('checkbox', { name: `选入周报：${omitted.title}` }).uncheck();
    await page.getByRole('checkbox', { name: `选入周报：${historical.title}` }).uncheck();
    await page.getByRole('button', { name: '导入历史周报', exact: true }).click();
    const drawer = page.getByRole('dialog', { name: '我的写作风格' });
    await expect(drawer).toBeVisible();
    await page.getByLabel('历史周报样本').fill('# 历史周报\n## 项目进展\n- 发布验收完成。');
    // The real-model contract is covered by PostgreSQL/API integration tests. UI uses a deterministic proposal.
    await page.route('**/report-template/learn', (route) =>
      route.fulfill({
        json: { definition: { ...standardReportDefinition, name: '我的简洁周报' }, mode: 'ai' },
      }),
    );
    await page.getByRole('button', { name: '提炼我的风格', exact: true }).click();
    await expect(drawer.getByText('风格已提炼，检查后保存。')).toBeVisible();
    await expect(page.getByLabel('历史周报样本')).toHaveValue('');
    await page.getByRole('button', { name: '确认保存风格', exact: true }).click();
    await expect(drawer).toBeHidden();
    await page.getByRole('button', { name: '添加其他时期', exact: true }).click();
    const extras = page.getByRole('dialog', { name: '添加其他时期的事项' });
    await extras.getByRole('combobox', { name: '时间段', exact: true }).selectOption('custom');
    await extras.getByLabel('开始日期', { exact: true }).fill('2026-01-01');
    await extras.getByLabel('结束日期（不含）', { exact: true }).fill('2026-02-01');
    await extras.getByRole('combobox', { name: '检索方式', exact: true }).selectOption('all');
    await expect(
      extras.getByRole('checkbox', { name: `选入周报：${historical.title}` }),
    ).toBeVisible();
    await extras.getByRole('checkbox', { name: `选入周报：${historical.title}` }).check();
    await page.getByRole('button', { name: '完成选择', exact: true }).click();
    await page.locator('.main-content').evaluate((node) => {
      node.scrollTop = 0;
    });
    await page.screenshot({
      path: `.impeccable/review/foundry-materials-${mobile ? 'mobile' : 'desktop'}.png`,
      animations: 'disabled',
    });
    const response = page.waitForResponse(
      (r) => r.url() === `${prefix}/reports` && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: '铸造本周周报', exact: true }).click();
    const generated = await (await response).json();
    expect(generated.sourceIds).toEqual([first.id, historical.id]);
    expect(generated.content.split('[orbit-1]:')[0]).not.toContain('workspace=');
    expect(generated.content).toContain(
      `[orbit-1]: /?workspace=${me.memberships[0].workspace.id}&item=${first.id}`,
    );
    await expect(page.getByLabel('周报内容')).toHaveValue(/完成周报工作台设计/);
    const editor = page.getByLabel('周报内容');
    await editor.fill((await editor.inputValue()) + '\n\n## 下周计划\n- 完成新一期发布验收');
    const saved = page.waitForResponse(
      (r) => r.url() === `${prefix}/reports/${generated.id}` && r.request().method() === 'PATCH',
    );
    await page.getByRole('button', { name: '保存草稿', exact: true }).click();
    expect((await saved).ok()).toBeTruthy();
    await expect(page.getByRole('button', { name: '保存草稿', exact: true })).toHaveText(
      '保存草稿',
    );
    await page.screenshot({
      path: `.impeccable/review/foundry-editor-${mobile ? 'mobile' : 'desktop'}.png`,
      animations: 'disabled',
    });
    await page.getByRole('button', { name: '提取下周计划', exact: true }).first().click();
    await expect(page.getByRole('checkbox', { name: '导入计划 1' })).toBeVisible();
    await page.getByRole('button', { name: '确认创建 1 项事项', exact: true }).click();
    await expect(page.getByRole('button', { name: '计划已进入轨道' })).toBeVisible();
    await expect(page.locator('.foundry-plan-note')).toHaveText('1 项事项已创建，可在星图查看。');
    const rows = await (await page.request.get(`${prefix}/items`)).json();
    const plan = rows.items.find((i: any) => i.title === '完成新一期发布验收');
    expect(plan.sourceReportId).toBe(generated.id);
    await page.screenshot({
      path: `.impeccable/review/foundry-plan-${mobile ? 'mobile' : 'desktop'}.png`,
      animations: 'disabled',
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBeTruthy();
    expect(errors).toEqual([]);
    await page.getByRole('button', { name: '打开周报档案' }).click();
    await expect(page.getByRole('dialog', { name: '周报档案' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: '打开周报档案' })).toBeFocused();
    await context.close();
  }
});

test('周报后台轮询保留本地版本基线，跨设备修改不能被覆盖', async ({ page }) => {
  const base = 'http://localhost:3001';
  await page.goto(base);
  await page.getByRole('button', { name: '还没有账号？创建一个' }).click();
  await page.getByLabel('如何称呼你').fill('Report conflict');
  await page.getByLabel('邮箱', { exact: true }).fill(`report-conflict-${randomUUID()}@orbit.test`);
  await page.getByLabel('密码', { exact: true }).fill('Report-conflict-2026');
  await page.getByRole('button', { name: '创建账号', exact: true }).click();
  await expect(page.locator('.nebula-matrix')).toBeVisible();
  const me = await (await page.request.get(`${base}/api/v1/auth/me`)).json();
  const prefix = `${base}/api/v1/workspaces/${me.memberships[0].workspace.id}`;
  const headers = () => ({ Origin: base, 'Idempotency-Key': randomUUID() });
  await page.request.post(`${prefix}/items`, {
    headers: headers(),
    data: { title: '跨设备周报验收' },
  });
  await page.request.patch(`${prefix}/report-template`, {
    headers: headers(),
    data: { version: 0, definition: standardReportDefinition },
  });
  await page.reload();
  await page.getByRole('button', { name: '打开工作舱' }).click();
  await page.getByRole('button', { name: '周报', exact: true }).click();
  await expect(page.locator('.foundry-loading')).toHaveCount(0);
  const generatedResponse = page.waitForResponse(
    (r) => r.url() === `${prefix}/reports` && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '铸造本周周报', exact: true }).click();
  const generated = await (await generatedResponse).json();
  const editor = page.getByLabel('周报内容');
  await editor.fill((await editor.inputValue()) + '\n本地已保存稿');
  const saveResponse = page.waitForResponse(
    (r) => r.url() === `${prefix}/reports/${generated.id}` && r.request().method() === 'PATCH',
  );
  await page.getByRole('button', { name: '保存草稿', exact: true }).click();
  const saved = await (await saveResponse).json();
  expect(saved.suggestionStatus).toBe('pending');
  await editor.fill(saved.content + '\n尚未保存的本地修改');
  const remoteContent = '## 另一设备的最终稿\n- 保留这段更新';
  expect(
    (
      await page.request.patch(`${prefix}/reports/${generated.id}`, {
        headers: headers(),
        data: { version: saved.version, content: remoteContent },
      })
    ).ok(),
  ).toBeTruthy();
  await expect(page.getByRole('alert').filter({ hasText: '周报已在其他设备更新' })).toBeVisible({
    timeout: 15000,
  });
  await expect(editor).toHaveValue(/尚未保存的本地修改/);
  const conflicted = page.waitForResponse(
    (r) => r.url() === `${prefix}/reports/${generated.id}` && r.request().method() === 'PATCH',
  );
  await page.getByRole('button', { name: '保存草稿', exact: true }).click();
  expect((await conflicted).status()).toBe(409);
  expect((await (await page.request.get(`${prefix}/reports/${generated.id}`)).json()).content).toBe(
    remoteContent,
  );
  await page.getByRole('button', { name: '打开周报档案' }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('.foundry-archive-row').first().click();
  await expect(editor).toHaveValue(remoteContent);
});
