import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('default desktop navigation', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: '打开 Grafana' })).toBeVisible();
  await expect(page).toHaveScreenshot('navi-desktop-dark.png', {
    animations: 'disabled',
    fullPage: true,
  });
});

test('desktop second-page pagination', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '下一页' }).click();
  await expect(page.getByRole('heading', { name: '精选' })).toBeVisible();
  await expect(page).toHaveScreenshot('navi-desktop-page2-pagination.png', {
    animations: 'disabled',
    fullPage: false,
  });
});

test('mobile search overlay', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: '打开搜索' }).click();
  await page.getByRole('searchbox', { name: '搜索导航' }).fill('Grafana');
  await expect(page).toHaveScreenshot('navi-mobile-search-dark.png', {
    animations: 'disabled',
    fullPage: true,
  });
});

test('mobile external search workbench', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('region', { name: '外部搜索' })).toBeVisible();
  await expect(page).toHaveScreenshot('navi-mobile-home-dark.png', {
    animations: 'disabled',
    fullPage: false,
  });
});

test('desktop light theme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page).toHaveScreenshot('navi-desktop-light.png', {
    animations: 'disabled',
    fullPage: true,
  });
});

test('desktop empty search result', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('searchbox', { name: '搜索导航' }).fill('missing');
  await expect(page.getByRole('heading', { name: '没有匹配的链接' })).toBeVisible();
  await expect(page).toHaveScreenshot('navi-desktop-no-results.png', {
    animations: 'disabled',
    fullPage: true,
  });
});

test('degraded catalog status', async ({ page }) => {
  await page.route('**/api/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ health: 'degraded', revision: 1 }),
    });
  });
  await page.goto('/');
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('服务处于降级状态');
  await expect(alert).toHaveCSS('opacity', '1');
  await expect(alert).toHaveCSS('transform', 'none');
  await expect(page.getByRole('link', { name: '打开 Grafana' })).toBeVisible();
  await expect(page).toHaveScreenshot('navi-desktop-degraded.png', {
    animations: 'disabled',
    fullPage: true,
  });
});

test('catalog load failure', async ({ page }) => {
  await page.route('**/api/catalog', async (route) => {
    await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '目录暂时无法加载' })).toBeVisible();
  await expect(page).toHaveScreenshot('navi-desktop-failure.png', {
    animations: 'disabled',
    fullPage: true,
    // macOS font rasterization can vary by worker for the small "Navi" label.
    maxDiffPixels: 40,
  });
});

const colorThemes = [
  { id: 'navy-blossom', label: '绀樱夜' },
  { id: 'mint-tide', label: '薄荷汐' },
  { id: 'moss-court', label: '苔庭青' },
  { id: 'tea-mist', label: '茶雾青' },
  { id: 'amber-tide', label: '琥珀潮' },
  { id: 'sunny-coast', label: '晴海橙' },
  { id: 'violet-lime', label: '藤萝青' },
] as const;

for (const theme of colorThemes) {
  test(`color theme ${theme.label}`, async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '主题：默认' }).click();
    await page.getByRole('menuitemradio', { name: theme.label }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme.id);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page).toHaveScreenshot(`navi-theme-${theme.id}.png`, {
      animations: 'disabled',
      fullPage: false,
    });
  });
}

test('theme menu', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '主题：默认' }).click();
  await expect(page.getByRole('menu', { name: '选择主题' })).toBeVisible();
  await expect(page).toHaveScreenshot('navi-theme-menu.png', {
    animations: 'disabled',
    fullPage: false,
  });
});

test('background pattern menu', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '背景纹样：经纬阵' }).click();
  await expect(page.getByRole('menu', { name: '选择背景纹样' })).toBeVisible();
  await expect(page).toHaveScreenshot('navi-background-pattern-menu.png', {
    animations: 'disabled',
    fullPage: false,
  });
});

test('external search provider menu', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '搜索入口：百度' }).click();
  await expect(page.getByRole('menu', { name: '选择搜索入口' })).toBeVisible();
  await expect(page).toHaveScreenshot('navi-external-search-menu.png', {
    animations: 'disabled',
    fullPage: false,
  });
});

const patternVisuals = [
  {
    pattern: '天游环',
    patternID: 'orbital-rings',
    theme: '绀樱夜',
    id: 'orbital-rings-navy-blossom',
  },
  { pattern: '双鱼宫', patternID: 'pisces', theme: '薄荷汐', id: 'pisces-mint-tide' },
  {
    pattern: '天弓宫',
    patternID: 'sagittarius',
    theme: '晴海橙',
    id: 'sagittarius-sunny-coast',
  },
  {
    pattern: '回廊纹',
    patternID: 'roman-meander',
    theme: '茶雾青',
    id: 'roman-meander-tea-mist',
  },
  {
    pattern: '玫瑰窗',
    patternID: 'rose-window',
    theme: '藤萝青',
    id: 'rose-window-violet-lime',
  },
  {
    pattern: '八芒阵',
    patternID: 'eight-point-star',
    theme: '苔庭青',
    id: 'eight-point-star-moss-court',
  },
  {
    pattern: '星轨幕',
    patternID: 'star-trails',
    theme: '默认',
    id: 'star-trails-default',
  },
  { pattern: '素幕', patternID: 'none', theme: '默认', id: 'none-default' },
] as const;

for (const visual of patternVisuals) {
  test(`background pattern ${visual.pattern}`, async ({ page }) => {
    await page.goto('/');
    if (visual.theme !== '默认') {
      await page.getByRole('button', { name: '主题：默认' }).click();
      await page.getByRole('menuitemradio', { name: visual.theme }).click();
    }
    await page.getByRole('button', { name: '背景纹样：经纬阵' }).click();
    await page.getByRole('menuitemradio', { name: visual.pattern }).click();
    await expect(page.locator('html')).toHaveAttribute('data-background-pattern', visual.patternID);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page).toHaveScreenshot(`navi-pattern-${visual.id}.png`, {
      animations: 'disabled',
      fullPage: false,
    });
  });
}
