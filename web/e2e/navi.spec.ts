import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mockCatalog } from '../tests/fixtures/mockCatalog';
import type { Catalog } from '../src/app/api/catalog';

const patternNames = ['等高线 Contour', '流场 Flow field', '扭索纹 Guilloché', '星轨 Star trails', '山峦 Ridgeline'];

async function recordWindowOpen(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.open = (url) => {
      window.sessionStorage.setItem('navi-last-open', String(url));
      return null;
    };
  });
}

async function expectNoSeriousViolations(page: Page): Promise<void> {
  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')).toEqual([]);
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}

test('renders the hero, section index and catalog with touch-sized controls', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('我的导航 · Navi');
  await expect(page.getByRole('heading', { level: 1, name: '我的导航' })).toBeAttached();
  await expect(page.getByText(/^当前时间 \d{2}:\d{2}$/)).toBeAttached();
  await expect(page.getByRole('combobox', { name: '搜索网页或筛选链接' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: '基础设施' })).toBeVisible();
  await expect(page.getByRole('link', { name: '打开 Grafana' })).toHaveAttribute('href', '/go/grafana');
  await expect(page.getByRole('navigation', { name: '分区目录' }).getByRole('link')).toHaveCount(10);
  await expectNoHorizontalOverflow(page);

  for (const button of await page.getByRole('button').all()) {
    if (!(await button.isVisible())) continue;
    const box = await button.boundingBox();
    const label = (await button.getAttribute('aria-label')) ?? (await button.textContent()) ?? '';
    expect(box?.width, label).toBeGreaterThanOrEqual(44);
    expect(box?.height, label).toBeGreaterThanOrEqual(44);
  }
  await expectNoSeriousViolations(page);
});

test('cards finish their entrance animation and open through the server redirect', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const card = page.getByRole('link', { name: '打开 GitHub' });
  await card.scrollIntoViewIfNeeded();
  await expect(card).toHaveCSS('opacity', '1');
  const popupPromise = page.waitForEvent('popup');
  await card.click();
  const popup = await popupPromise;
  await expect.poll(() => popup.url()).toContain('github');
});

test('hero search filters links across pages and falls back to web search', async ({ page }) => {
  await recordWindowOpen(page);
  await page.goto('/');
  const search = page.getByRole('combobox', { name: '搜索网页或筛选链接' });
  await search.fill('github');
  const results = page.getByRole('listbox', { name: '搜索结果' });
  await expect(results.getByRole('option')).toHaveCount(2);
  await expect(results.getByRole('option').first()).toHaveAttribute('href', '/go/github');
  await expect(results.getByRole('option').last()).toContainText('在 百度 中搜索「github」');

  await search.press('ArrowDown');
  await expect(results.getByRole('option').last()).toHaveAttribute('aria-selected', 'true');
  await search.press('Enter');
  const opened = new URL(await page.evaluate(() => window.sessionStorage.getItem('navi-last-open') ?? ''));
  expect(opened.hostname).toBe('www.baidu.com');
  expect(opened.searchParams.get('wd')).toBe('github');

  // The result list covers the engine row; clearing the query reveals it again.
  await search.press('Escape');
  await page.getByRole('button', { name: 'Bing', exact: true }).click();
  await expect(search).toBeFocused();
  await search.fill('Navi UI');
  await search.press('ArrowUp');
  await search.press('Enter');
  expect(await page.evaluate(() => window.sessionStorage.getItem('navi-last-open'))).toContain('www.bing.com/search');

  await search.press('Escape');
  await expect(search).toHaveValue('');
  await expect(results).toHaveCount(0);
});

test('quick search opens with the keyboard and restores focus', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: '打开 Grafana' })).toBeVisible();
  await page.keyboard.press('ControlOrMeta+k');
  const dialog = page.getByRole('dialog', { name: '搜索链接' });
  const input = dialog.getByRole('combobox', { name: '搜索链接' });
  await expect(input).toBeFocused();
  await input.fill('dashboards');
  await expect(dialog.getByRole('option').first()).toContainText('Grafana');
  await page.keyboard.press('Tab');
  await expect(input).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: '搜索链接' })).toBeFocused();

  await page.locator('body').click({ position: { x: 5, y: 300 } });
  await page.keyboard.press('/');
  await expect(page.getByRole('combobox', { name: '搜索网页或筛选链接' })).toBeFocused();
});

test('page tabs switch content and the selection survives a reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '灵感收藏' }).click();
  await expect(page.getByRole('heading', { level: 2, name: '精选' })).toBeVisible();
  await expect(page).toHaveTitle('灵感收藏 · Navi');
  await page.reload();
  await expect(page.getByRole('button', { name: '灵感收藏' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { level: 2, name: '精选' })).toBeVisible();
});

test('appearance panel switches patterns and palettes, persists them and never blocks input', async ({ page }) => {
  await page.goto('/');
  const trigger = page.getByRole('button', { name: '外观：纹样与色调' });
  await trigger.click();
  const panel = page.getByRole('dialog', { name: '外观' });
  await expect(panel.getByRole('radio', { name: '等高线 Contour' })).toBeFocused();
  await expect(panel).toHaveCSS('opacity', '1');
  await expectNoSeriousViolations(page);

  await panel.getByRole('radio', { name: '山峦 Ridgeline' }).click();
  await panel.getByRole('radio', { name: /青瓷/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'celadon');
  await expect(page.locator('[data-backdrop] canvas')).toHaveAttribute('data-pattern', 'ridge');
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(trigger).toBeFocused();

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'celadon');
  await expect(page.locator('[data-backdrop] canvas')).toHaveAttribute('data-pattern', 'ridge');

  const backdropOnTop = await page.evaluate(() => {
    const element = document.elementFromPoint(window.innerWidth * 0.75, window.innerHeight * 0.4);
    return element?.closest('[data-backdrop]') !== null;
  });
  expect(backdropOnTop).toBe(false);
});

test('every pattern paints visible pixels with and without motion', async ({ page }) => {
  await page.goto('/');
  for (const reducedMotion of ['reduce', 'no-preference'] as const) {
    await page.emulateMedia({ reducedMotion });
    for (const name of patternNames) {
      await page.getByRole('button', { name: '外观：纹样与色调' }).click();
      await page.getByRole('dialog', { name: '外观' }).getByRole('radio', { name }).click();
      await page.keyboard.press('Escape');
      await expect
        .poll(() =>
          page.locator('[data-backdrop] canvas').evaluate((canvas: HTMLCanvasElement) => {
            const context = canvas.getContext('2d');
            if (context === null) return 0;
            const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
            let painted = 0;
            for (let index = 3; index < pixels.length; index += 4 * 97) if ((pixels[index] ?? 0) > 0) painted += 1;
            return painted;
          }),
        )
        .toBeGreaterThan(20);
    }
  }
});

test('degraded status is announced without hiding the catalog', async ({ page }) => {
  await page.route('**/api/status', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ health: 'degraded', revision: 1 }) }),
  );
  await page.goto('/');
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('服务处于降级状态');
  await expect(page.getByRole('link', { name: '打开 Grafana' })).toBeVisible();
  await alert.getByRole('button', { name: '关闭提示' }).click();
  await expect(alert).toHaveCount(0);
});

test('a catalog failure offers a working retry', async ({ page }) => {
  // Fail every request (including query retries and SSE reconciliation) until the user retries.
  let available = false;
  await page.route('**/api/catalog', async (route) => {
    if (available) await route.continue();
    else await route.fulfill({ status: 503, body: '{}' });
  });
  await page.goto('/');
  const retry = page.getByRole('button', { name: '重新加载' });
  await expect(retry).toBeVisible({ timeout: 15_000 });
  available = true;
  await retry.click();
  await expect(page.getByRole('link', { name: '打开 Grafana' })).toBeVisible();
});

test('a thousand-link catalog stays searchable', async ({ page }) => {
  const links = Array.from({ length: 1000 }, (_, index) => ({
    runtimeId: `link-${index}`,
    name: `Service ${String(index).padStart(4, '0')}`,
    publicUrl: `https://service-${index}.example.com/`,
    tags: [],
  }));
  const large: Catalog = {
    revision: 99,
    pages: [
      {
        id: 'large',
        title: '大型目录',
        groups: Array.from({ length: 20 }, (_, group) => ({ name: `分组 ${group + 1}`, links: links.slice(group * 50, group * 50 + 50) })),
      },
    ],
  };
  await page.route('**/api/catalog', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(large) }));
  await page.goto('/');
  await expect(page.getByRole('link', { name: /^打开 Service/ })).toHaveCount(1000);
  const search = page.getByRole('combobox', { name: '搜索网页或筛选链接' });
  await search.fill('Service 0999');
  await expect(page.getByRole('listbox', { name: '搜索结果' }).getByRole('option').first()).toHaveAttribute('href', '/go/link-999');
});

for (const viewport of [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
]) {
  test(`compact layout at ${viewport.width}px keeps every control reachable`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.getByRole('link', { name: '打开 Cloudflare' })).toBeVisible();
    for (const name of ['搜索链接', '外观：纹样与色调', '退出登录']) {
      await expect(page.getByRole('button', { name })).toBeVisible();
    }
    await expectNoHorizontalOverflow(page);
    await page.getByRole('navigation', { name: '分区目录' }).getByRole('link', { name: /开发/ }).click();
    await expect(page.getByRole('heading', { level: 2, name: '开发' })).toBeInViewport();
    await expectNoHorizontalOverflow(page);
    await expectNoSeriousViolations(page);
  });
}

test('the development catalog keeps the size these checks rely on', () => {
  expect(mockCatalog.pages[0]?.groups).toHaveLength(10);
});
