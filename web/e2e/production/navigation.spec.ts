import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures';

test.beforeEach(async ({ page, app }) => {
  const response = await page.request.post(`${app.url}/api/auth/login`, {
    headers: { 'X-Navi-Request': '1' }, data: { username: 'tester', password: 'correct-password' },
  });
  expect(response.ok()).toBe(true);
});

// No page.route() mocks: these tests exercise the embedded assets and real Go API.
test('production assets respect CSP and private destinations take priority', async ({ page, app }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  const response = await page.goto(app.url);
  expect(response?.headers()['content-security-policy']).toContain("default-src 'self'");
  await expect(page.getByRole('link', { name: '打开 部署测试' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'mint-tide');
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('link', { name: '打开 部署测试' }).click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(`${app.targetURL}/private`);
  expect(app.state.privateProbes).toBe(1);
  expect(app.state.publicProbes).toBe(0);
  expect(errors.filter((error) => !error.includes('404'))).toEqual([]);
});

test('unreachable page has themed retry, return link and successful fresh retry', async ({ page, app }) => {
  app.state.privateReady = false;
  app.state.publicReady = false;
  await page.goto(app.url);
  const path = await page.getByRole('link', { name: '打开 部署测试' }).getAttribute('href');
  if (path === null) throw new Error('Missing navigation link');
  const response = await page.goto(app.url + path);
  expect(response?.status()).toBe(502);
  await expect(page.getByRole('heading', { name: '部署测试 当前无法访问' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'mint-tide');
  await expect(page.getByRole('link', { name: '返回导航' })).toHaveAttribute('href', '/');
  await page.setViewportSize({ width: 320, height: 568 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  app.state.publicReady = true;
  await page.getByRole('link', { name: '重试访问' }).click();
  await expect(page).toHaveURL(`${app.targetURL}/public`);
});

test('atomic YAML reload and invalid-edit recovery reach the open browser', async ({ page, app }) => {
  await page.goto(app.url);
  await expect(page).toHaveTitle('生产检查 · Navi');
  await writeFile(join(app.directory, 'next.yaml'), app.catalog('原子更新'));
  await rename(join(app.directory, 'next.yaml'), join(app.directory, 'urls.yaml'));
  await expect(page).toHaveTitle('原子更新 · Navi');
  await writeFile(join(app.directory, 'urls.yaml'), 'version: [invalid');
  await expect(page.getByText('目录更新失败，当前仍显示最近一次有效内容。')).toBeVisible();
  await expect(page.getByRole('link', { name: '打开 部署测试' })).toBeVisible();
  await writeFile(join(app.directory, 'urls.yaml'), app.catalog('已恢复'));
  await expect(page).toHaveTitle('已恢复 · Navi');
  await expect(page.getByText('目录更新失败，当前仍显示最近一次有效内容。')).toHaveCount(0);
});

test.describe('icons without catalog watching', () => {
  test.use({ catalogWatch: false });
  test('runtime storage failure is visible and recovery delivers a fallback icon', async ({ page, app }) => {
    await page.goto(app.url);
    const card = page.getByRole('link', { name: '打开 部署测试' });
    await expect(card).toBeVisible();
    await expect(card.locator('img')).toHaveCount(0);
    const cache = join(app.directory, '.cache', 'favicons');
    await rm(cache, { recursive: true });
    await writeFile(cache, 'blocked');
    app.state.iconsReady = true;
    await expect(page.getByText(/图标缓存写入失败/)).toBeVisible();
    await rm(cache);
    await mkdir(cache);
    await expect(page.getByText(/图标缓存写入失败/)).toHaveCount(0);
    await expect(card.locator('img')).toBeVisible();
    await expect.poll(() => card.locator('img').evaluate((image) => image instanceof HTMLImageElement && image.naturalWidth > 0)).toBe(true);
    await page.reload();
    await expect(page.getByRole('link', { name: '打开 部署测试' }).locator('img')).toBeVisible();
  });
});
