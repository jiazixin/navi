import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures';

test('login protects data, persists across reload and logout revokes access', async ({ page, app }, testInfo) => {
  for (const endpoint of ['/api/catalog', '/api/status', '/api/icons/unknown', '/api/events']) {
    expect((await page.request.get(app.url + endpoint)).status()).toBe(401);
  }
  await page.goto(app.url);
  await expect(page).toHaveURL(app.url + '/login');
  await expect(page.getByRole('heading', { name: '登录你的空间' })).toBeVisible();
  await expect(page.getByRole('link', { name: '打开 部署测试' })).toHaveCount(0);
  await page.locator('form').waitFor();
  await page.evaluate(async () => { await Promise.all(document.getAnimations().map((animation) => animation.finished)); });
  await page.screenshot({ path: testInfo.outputPath('login-desktop.png'), fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 320, height: 568 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('login-mobile.png'), fullPage: true });
  await page.getByLabel('账号', { exact: true }).fill('tester');
  await page.getByLabel('密码', { exact: true }).fill('wrong');
  await page.getByRole('button', { name: '显示密码' }).click();
  await expect(page.getByLabel('密码', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: '登录并进入' }).click();
  await expect(page.getByRole('alert')).toContainText('账号或密码不正确');
  await page.getByLabel('密码', { exact: true }).fill('correct-password');
  await page.getByLabel('密码', { exact: true }).press('Enter');
  await expect(page.getByRole('link', { name: '打开 部署测试' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('link', { name: '打开 部署测试' })).toBeVisible();
  await page.goto(app.url + '/navigation');
  await expect(page.getByRole('link', { name: '打开 部署测试' })).toBeVisible();
  await page.getByRole('button', { name: '退出登录' }).click();
  await expect(page).toHaveURL(app.url + '/login');
  expect((await page.request.get(app.url + '/api/catalog')).status()).toBe(401);
  await page.goBack();
  await expect(page.getByRole('heading', { name: '登录你的空间' })).toBeVisible();
});

test('revoked sessions return an open page to login', async ({ page, app }) => {
  test.setTimeout(45_000);
  await page.request.post(app.url + '/api/auth/login', { headers: { 'X-Navi-Request': '1' }, data: { username: 'tester', password: 'correct-password' } });
  await page.goto(app.url);
  await expect(page.getByRole('link', { name: '打开 部署测试' })).toBeVisible();
  await page.request.post(app.url + '/api/auth/logout', { headers: { 'X-Navi-Request': '1' } });
  await expect(page.getByRole('heading', { name: '登录你的空间' })).toBeVisible({ timeout: 35_000 });
});


test.describe('optional authentication', () => {
  test.use({ authEnabled: false });
  test('empty credentials open the home page without login or logout controls', async ({ page, app }) => {
    expect((await page.request.get(app.url + '/api/catalog')).status()).toBe(200);
    await page.goto(app.url);
    await expect(page.getByRole('link', { name: '打开 部署测试' })).toBeVisible();
    await expect(page).toHaveURL(app.url + '/');
    await expect(page.getByRole('button', { name: '退出登录' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: '登录你的空间' })).toHaveCount(0);
    await page.goto(app.url + '/login');
    await expect(page).toHaveURL(app.url + '/');
    const popupPromise = page.waitForEvent('popup');
    await page.getByRole('link', { name: '打开 部署测试' }).click();
    await expect(await popupPromise).toHaveURL(app.targetURL + '/private');
  });
});
