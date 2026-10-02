import { expect, test } from '@playwright/test';
import { mockCatalog } from '../tests/fixtures/mockCatalog';

test('catalog groups become opaque with normal motion on entry and filtering', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const infrastructure = page.getByRole('region', { name: '基础设施', exact: true });
  await expect(infrastructure).toHaveCSS('opacity', '1');
  await expect(infrastructure.getByRole('link', { name: '打开 Grafana' })).toBeVisible();

  const search = page.getByRole('searchbox', { name: '搜索导航', exact: true });
  await search.fill('Grafana');
  await expect(infrastructure).toHaveCSS('opacity', '1');
  await expect(page.getByRole('link', { name: /^打开 / })).toHaveCount(1);
  await search.fill('');
  await expect(page.getByRole('link', { name: '打开 GitHub' })).toBeVisible();
  for (const group of await page.locator('main section[aria-labelledby]').all()) {
    await expect(group).toHaveCSS('opacity', '1');
  }
});

test('Tab leaves each selection menu without entering its exit animation', async ({ page, browserName }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const theme = page.getByRole('button', { name: '主题：默认' });
  const pattern = page.getByRole('button', { name: /背景纹样：/ });
  const logout = page.getByRole('button', { name: '退出登录' });
  const provider = page.getByRole('button', { name: '搜索入口：百度' });
  const externalInput = page.getByRole('searchbox', { name: '搜索互联网或询问模型' });
  // Safari on macOS uses Option+Tab to include buttons in native keyboard navigation.
  const fullKeyboardAccess = browserName === 'webkit' && process.platform === 'darwin';
  const forwardTab = fullKeyboardAccess ? 'Alt+Tab' : 'Tab';
  const backwardTab = fullKeyboardAccess ? 'Alt+Shift+Tab' : 'Shift+Tab';
  const cases = [
    { trigger: theme, menu: '选择主题', next: pattern },
    { trigger: pattern, menu: '选择背景纹样', next: logout },
    { trigger: provider, menu: '选择搜索入口', next: externalInput },
  ];
  for (const menuCase of cases) {
    await menuCase.trigger.click();
    const menu = page.getByRole('menu', { name: menuCase.menu });
    await expect(menu.getByRole('menuitemradio', { checked: true })).toBeFocused();
    await page.keyboard.press(forwardTab);
    await expect(menuCase.next).toBeFocused();
    await expect(menu).toHaveCount(0);

    await menuCase.trigger.click();
    await expect(menu.getByRole('menuitemradio', { checked: true })).toBeFocused();
    await page.keyboard.press(backwardTab);
    await expect(menuCase.trigger).toBeFocused();
    await expect(menu).toHaveCount(0);
  }
});

test('mobile result Escape closes search and restores the search trigger', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const trigger = page.getByRole('button', { name: '打开搜索' });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: '搜索导航' });
  await expect(dialog.getByRole('searchbox', { name: '搜索导航' })).toBeFocused();
  const firstResult = dialog.getByRole('link', { name: /^打开 / }).first();
  await dialog.getByRole('searchbox', { name: '搜索导航' }).press('ArrowDown');
  await expect(firstResult).toBeFocused();
  await firstResult.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.locator('#navi-shell')).not.toHaveAttribute('inert');
});

test('resizing mobile search to desktop preserves the query and keyboard focus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await page.getByRole('button', { name: '打开搜索' }).click();
  const dialog = page.getByRole('dialog', { name: '搜索导航' });
  await dialog.getByRole('searchbox', { name: '搜索导航' }).fill('Grafana');
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(dialog).toHaveCount(0);
  const desktopSearch = page.getByRole('searchbox', { name: '搜索导航', exact: true });
  await expect(desktopSearch).toHaveValue('Grafana');
  await expect(desktopSearch).toBeFocused();
  await expect(page.locator('#navi-shell')).not.toHaveAttribute('inert');
  await desktopSearch.press('Escape');
  await expect(desktopSearch).toHaveValue('');
});

test('a thousand-link catalog remains searchable and restores source order', async ({ page }) => {
  const links = Array.from({ length: 1_000 }, (_, index) => ({
    runtimeId: `release-link-${index}`,
    name: `服务 ${index}`,
    publicUrl: `https://example.com/${index}`,
    tags: [],
  }));
  await page.route('**/api/catalog', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        ...mockCatalog,
        backgroundPattern: 'none',
        pages: [{ id: 'stress', title: '容量检查', groups: [{ name: '服务', links }] }],
      }),
    });
  });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const cards = page.getByRole('link', { name: /^打开 / });
  await expect(cards).toHaveCount(1_000);
  await expect(page.getByRole('region', { name: '服务', exact: true })).toHaveCSS('opacity', '1');
  const search = page.getByRole('searchbox', { name: '搜索导航', exact: true });
  await search.fill('服务 999');
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toHaveAccessibleName('打开 服务 999');
  await search.fill('');
  await expect(cards).toHaveCount(1_000);
  await expect(cards.first()).toHaveAccessibleName('打开 服务 0');
  await expect(cards.last()).toHaveAccessibleName('打开 服务 999');
});
