import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mockCatalog } from '../../src/test/mockCatalog';

type FloatingSurfaceMetrics = {
  backgroundColor: string;
  backgroundAlpha: number;
  backdropFilter: string;
  borderColor: string;
  boxShadow: string;
  surfaceToken: string;
  borderToken: string;
};

async function readFloatingSurface(
  page: Page,
  accessibleName: string,
): Promise<FloatingSurfaceMetrics> {
  const menu = page.getByRole('menu', { name: accessibleName });

  return menu.evaluate((menu) => {
    const styles = getComputedStyle(menu);
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d');

    if (context === null) throw new Error('Canvas 2D context is unavailable.');

    context.clearRect(0, 0, 1, 1);
    context.fillStyle = styles.backgroundColor;
    context.fillRect(0, 0, 1, 1);

    return {
      backgroundColor: styles.backgroundColor,
      backgroundAlpha: (context.getImageData(0, 0, 1, 1).data[3] ?? 0) / 255,
      backdropFilter: styles.backdropFilter,
      borderColor: styles.borderTopColor,
      boxShadow: styles.boxShadow,
      surfaceToken: styles.getPropertyValue('--floating-surface').trim(),
      borderToken: styles.getPropertyValue('--floating-surface-border').trim(),
    };
  });
}

test('renders the navigation-first desktop layout with stable geometry', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle('我的导航 · Navi');
  await expect(page.getByRole('region', { name: '外部搜索' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '基础设施' })).toBeVisible();
  await expect(page.getByRole('link', { name: '打开 Grafana' })).toBeVisible();
  await expect(page.getByRole('link', { name: '打开 GitHub' })).toBeVisible();

  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);

  const searchWorkbench = await page.getByRole('region', { name: '外部搜索' }).boundingBox();
  expect(searchWorkbench?.height).toBeGreaterThanOrEqual(330);
  expect(searchWorkbench?.height).toBeLessThanOrEqual(460);

  const firstCard = await page.getByRole('link', { name: '打开 Cloudflare' }).boundingBox();
  expect(firstCard?.y).toBeLessThan(900);

  const cards = page.getByRole('link', { name: /^打开 / });
  for (const card of await cards.all()) {
    const box = await card.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(104);
  }

  const iconButtons = page.getByRole('button');
  for (const button of await iconButtons.all()) {
    const box = await button.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
});

test('selection menus share one opaque floating surface across themes and viewports', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });

  const scenarios = [
    {
      viewport: { width: 1440, height: 900 },
      themes: ['默认', '绀樱夜', '薄荷汐', '苔庭青', '茶雾青', '琥珀潮', '晴海橙', '藤萝青'],
    },
    {
      viewport: { width: 390, height: 844 },
      themes: ['默认', '绀樱夜', '藤萝青'],
    },
  ];

  for (const { viewport, themes } of scenarios) {
    await page.setViewportSize(viewport);
    await page.goto('/');

    for (const theme of themes) {
      const themeTrigger = page.getByRole('button', { name: /^主题：/ });
      await themeTrigger.click();
      await page.getByRole('menuitemradio', { name: theme }).click();

      await themeTrigger.click();
      const themeSurface = await readFloatingSurface(page, '选择主题');
      await themeTrigger.click();

      const patternTrigger = page.getByRole('button', { name: /^背景纹样：/ });
      await patternTrigger.click();
      const patternSurface = await readFloatingSurface(page, '选择背景纹样');
      await patternTrigger.click();

      const providerTrigger = page.getByRole('button', { name: /^搜索入口：/ });
      await providerTrigger.click();
      const providerSurface = await readFloatingSurface(page, '选择搜索入口');
      await providerTrigger.click();

      const surfaces = [themeSurface, patternSurface, providerSurface];
      for (const surface of surfaces) {
        expect(surface.backgroundAlpha).toBe(1);
        expect(surface.backdropFilter).toBe('none');
        expect(surface.surfaceToken).not.toBe('');
        expect(surface.borderToken).not.toBe('');
      }

      expect(new Set(surfaces.map((surface) => surface.backgroundColor)).size).toBe(1);
      expect(new Set(surfaces.map((surface) => surface.borderColor)).size).toBe(1);
      expect(new Set(surfaces.map((surface) => surface.boxShadow)).size).toBe(1);
    }
  }
});

test('external search opens the selected provider and preserves model prompts', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'open', {
      configurable: true,
      value: (url: string | URL | undefined, target?: string, features?: string) => {
        window.sessionStorage.setItem(
          'navi-last-open',
          JSON.stringify({ url: String(url), target, features }),
        );
        return null;
      },
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (text: string) => {
          window.sessionStorage.setItem('navi-last-copied-query', text);
          return Promise.resolve();
        },
      },
    });
  });

  await page.goto('/');
  const search = page.getByRole('searchbox', { name: '搜索互联网或询问模型' });

  const initialGeometry = await page.evaluate(() => {
    const cluster = document.querySelector('[data-expanded]');
    const shell = document.querySelector('[aria-label="外部搜索"] [role="search"] > div');
    const input = document.querySelector('[aria-label="搜索互联网或询问模型"]');
    const submit = document.querySelector('[aria-label="使用 百度 搜索"]');
    const currentIcon = document.querySelector('[data-testid="current-provider-icon"]');
    return {
      clusterWidth: cluster?.getBoundingClientRect().width,
      shellHeight: shell?.getBoundingClientRect().height,
      shellRadius: shell === null ? null : getComputedStyle(shell).borderRadius,
      inputOffset:
        input === null ? null : input.getBoundingClientRect().x - (shell?.getBoundingClientRect().x ?? 0),
      submitOffset:
        (shell?.getBoundingClientRect().right ?? 0) - (submit?.getBoundingClientRect().right ?? 0),
      iconSlotWidth: currentIcon?.getBoundingClientRect().width,
      providerIconCount: document.querySelectorAll('[data-provider-icon]').length,
    };
  });
  expect(initialGeometry.clusterWidth).toBeCloseTo(640, 0);
  expect(initialGeometry.shellHeight).toBeCloseTo(72, 3);
  expect(initialGeometry.shellRadius).toBe('999px');
  expect(initialGeometry.iconSlotWidth).toBeCloseTo(52, 3);
  expect(initialGeometry.providerIconCount).toBe(1);

  await search.click();
  await expect
    .poll(() =>
      page.locator('[data-expanded]').evaluate((element) => element.getBoundingClientRect().width),
    )
    .toBeCloseTo(820, 0);

  await page.getByRole('button', { name: '搜索入口：百度' }).click();
  await expect(page.getByRole('menu', { name: '选择搜索入口' })).toBeVisible();
  await expect(page.getByRole('menuitemradio')).toHaveCount(8);
  await expect(page.locator('[data-provider-icon]')).toHaveCount(9);

  await page.getByRole('menuitemradio', { name: 'Bing 国际版' }).click();
  await expect(
    page.getByTestId('current-provider-icon').locator('[data-provider-icon="bing"]'),
  ).toHaveCount(1);
  await expect(page.getByRole('menu', { name: '选择搜索入口' })).toHaveCount(0);

  const switchedGeometry = await page.evaluate(() => {
    const shell = document.querySelector('[aria-label="外部搜索"] [role="search"] > div');
    const input = document.querySelector('[aria-label="搜索互联网或询问模型"]');
    const submit = document.querySelector('[aria-label="使用 Bing 国际版 搜索"]');
    return {
      inputOffset:
        input === null ? null : input.getBoundingClientRect().x - (shell?.getBoundingClientRect().x ?? 0),
      submitOffset:
        (shell?.getBoundingClientRect().right ?? 0) - (submit?.getBoundingClientRect().right ?? 0),
      height: shell?.getBoundingClientRect().height,
      radius: shell === null ? null : getComputedStyle(shell).borderRadius,
    };
  });
  expect(switchedGeometry.inputOffset).toBe(initialGeometry.inputOffset);
  expect(switchedGeometry.submitOffset).toBe(initialGeometry.submitOffset);
  expect(switchedGeometry.height).toBeCloseTo(initialGeometry.shellHeight ?? 0, 3);
  expect(switchedGeometry.radius).toBe(initialGeometry.shellRadius);

  await search.fill('Navi UI 设计');
  await search.press('Enter');

  const bingTarget = await page.evaluate(() =>
    JSON.parse(window.sessionStorage.getItem('navi-last-open') ?? '{}') as {
      url?: string;
      target?: string;
      features?: string;
    },
  );
  const bingURL = new URL(bingTarget.url ?? '');
  expect(bingURL.hostname).toBe('www.bing.com');
  expect(bingURL.searchParams.get('q')).toBe('Navi UI 设计');
  expect(bingTarget.target).toBe('_blank');
  expect(bingTarget.features).toBe('noopener,noreferrer');

  await page.getByRole('button', { name: '搜索入口：Bing 国际版' }).click();
  await page.getByRole('menuitemradio', { name: 'Claude' }).click();
  await search.fill('解释这段代码');
  await page.getByRole('button', { name: '使用 Claude 搜索' }).click();
  await expect(page.getByRole('status')).toContainText('问题已复制');
  await expect
    .poll(() => page.evaluate(() => window.sessionStorage.getItem('navi-last-copied-query')))
    .toBe('解释这段代码');
});

test('a quick pointer visit keeps the desktop search pill expanded', async ({ page }) => {
  await page.goto('/');
  const cluster = page.getByTestId('external-search-cluster');
  const initialBox = await cluster.boundingBox();
  expect(initialBox?.width).toBeCloseTo(640, 0);

  await page.mouse.move(
    (initialBox?.x ?? 0) + (initialBox?.width ?? 0) / 2,
    (initialBox?.y ?? 0) + (initialBox?.height ?? 0) / 2,
  );
  await page.mouse.move(1, 1);

  await expect
    .poll(() => cluster.evaluate((element) => element.getBoundingClientRect().width))
    .toBeCloseTo(820, 0);
  await page.waitForTimeout(500);
  await expect(cluster).toHaveAttribute('data-expanded', 'true');
  expect((await cluster.boundingBox())?.width).toBeCloseTo(820, 0);
});

test('theme switching keeps the current provider badge stable in both directions', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');

  const providerTrigger = page.getByTestId('current-provider-icon');
  await expect(providerTrigger).toBeVisible();
  await expect(providerTrigger.locator('[data-provider-icon="baidu"]')).toHaveCount(1);
  await expect(page.locator('[data-provider-icon]')).toHaveCount(1);

  async function selectTheme(label: string): Promise<void> {
    await page.getByRole('button', { name: /^主题：/ }).click();
    await page.getByRole('menuitemradio', { name: label }).click();
  }

  async function sampleThemeTransition(expectedTheme: string): Promise<{
    backgroundColors: string[];
    borderColors: string[];
    brandTokens: string[];
    finalTheme: string;
    glyphColors: string[];
    glyphFills: string[];
    noBadgeAnimationsEveryFrame: boolean;
    noSecondarySVGEveryFrame: boolean;
    sampleCount: number;
    sameButtonEveryFrame: boolean;
    sameGlyphEveryFrame: boolean;
    samePathEveryFrame: boolean;
    singleGlyphEveryFrame: boolean;
    stableFilter: boolean;
    stableOpacity: boolean;
    stableVisibility: boolean;
  }> {
    return page.evaluate(async (targetTheme) => {
      const button = document.querySelector<HTMLButtonElement>(
        '[data-testid="current-provider-icon"]',
      );
      const glyph = button?.querySelector<SVGElement>('[data-provider-icon="baidu"]');
      const path = glyph?.querySelector<SVGPathElement>('path');
      if (
        button === null ||
        glyph === null ||
        glyph === undefined ||
        path === null ||
        path === undefined
      ) {
        throw new Error('Current provider optical badge not found');
      }

      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          observer.disconnect();
          reject(new Error(`Theme did not change to ${targetTheme}`));
        }, 5_000);
        const observer = new MutationObserver(() => {
          if (document.documentElement.dataset.theme !== targetTheme) return;
          window.clearTimeout(timeout);
          observer.disconnect();
          resolve();
        });
        observer.observe(document.documentElement, {
          attributeFilter: ['data-theme'],
          attributes: true,
        });
      });

      const samples: {
        backgroundColor: string;
        borderColor: string;
        brandToken: string;
        filter: string;
        glyphColor: string;
        glyphFill: string;
        noBadgeAnimations: boolean;
        noSecondarySVG: boolean;
        opacity: string;
        sameButton: boolean;
        sameGlyph: boolean;
        samePath: boolean;
        singleGlyph: boolean;
        visibility: string;
      }[] = [];
      const start = performance.now();

      while (performance.now() - start < 360) {
        const buttonStyle = getComputedStyle(button);
        const glyphStyle = getComputedStyle(glyph);
        const pathStyle = getComputedStyle(path);
        samples.push({
          backgroundColor: buttonStyle.backgroundColor,
          borderColor: buttonStyle.borderColor,
          brandToken: glyphStyle.getPropertyValue('--provider-brand').trim(),
          filter: glyphStyle.filter,
          glyphColor: glyphStyle.color,
          glyphFill: pathStyle.fill,
          noBadgeAnimations: button.getAnimations({ subtree: true }).length === 0,
          noSecondarySVG: button.querySelectorAll('svg').length === 1,
          opacity: glyphStyle.opacity,
          sameButton:
            button === document.querySelector('[data-testid="current-provider-icon"]'),
          sameGlyph:
            glyph ===
            document.querySelector(
              '[data-testid="current-provider-icon"] [data-provider-icon="baidu"]',
            ),
          samePath:
            path ===
            document.querySelector(
              '[data-testid="current-provider-icon"] [data-provider-icon="baidu"] path',
            ),
          singleGlyph:
            document.querySelectorAll(
              '[data-testid="current-provider-icon"] [data-provider-icon]',
            ).length === 1,
          visibility: glyphStyle.visibility,
        });
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }

      return {
        backgroundColors: [...new Set(samples.map((sample) => sample.backgroundColor))],
        borderColors: [...new Set(samples.map((sample) => sample.borderColor))],
        brandTokens: [...new Set(samples.map((sample) => sample.brandToken))],
        finalTheme: document.documentElement.dataset.theme ?? '',
        glyphColors: [...new Set(samples.map((sample) => sample.glyphColor))],
        glyphFills: [...new Set(samples.map((sample) => sample.glyphFill))],
        noBadgeAnimationsEveryFrame: samples.every((sample) => sample.noBadgeAnimations),
        noSecondarySVGEveryFrame: samples.every((sample) => sample.noSecondarySVG),
        sampleCount: samples.length,
        sameButtonEveryFrame: samples.every((sample) => sample.sameButton),
        sameGlyphEveryFrame: samples.every((sample) => sample.sameGlyph),
        samePathEveryFrame: samples.every((sample) => sample.samePath),
        singleGlyphEveryFrame: samples.every((sample) => sample.singleGlyph),
        stableFilter: samples.every((sample) => sample.filter === 'none'),
        stableOpacity: samples.every((sample) => sample.opacity === '1'),
        stableVisibility: samples.every((sample) => sample.visibility === 'visible'),
      };
    }, expectedTheme);
  }

  await selectTheme('藤萝青');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'violet-lime');

  const violetToBlossomPromise = sampleThemeTransition('navy-blossom');
  await selectTheme('绀樱夜');
  const violetToBlossom = await violetToBlossomPromise;

  const blossomToVioletPromise = sampleThemeTransition('violet-lime');
  await selectTheme('藤萝青');
  const blossomToViolet = await blossomToVioletPromise;

  for (const report of [violetToBlossom, blossomToViolet]) {
    expect(report.sampleCount).toBeGreaterThan(2);
    expect(report.backgroundColors).toEqual(['rgb(248, 250, 252)']);
    expect(report.borderColors).toEqual(['rgb(203, 213, 225)']);
    expect(report.brandTokens).toEqual(['#2932E1']);
    expect(report.glyphColors).toEqual(['rgb(41, 50, 225)']);
    expect(report.glyphFills).toEqual(['rgb(41, 50, 225)']);
    expect(report.noBadgeAnimationsEveryFrame).toBe(true);
    expect(report.noSecondarySVGEveryFrame).toBe(true);
    expect(report.sameButtonEveryFrame).toBe(true);
    expect(report.sameGlyphEveryFrame).toBe(true);
    expect(report.samePathEveryFrame).toBe(true);
    expect(report.singleGlyphEveryFrame).toBe(true);
    expect(report.stableOpacity).toBe(true);
    expect(report.stableVisibility).toBe(true);
    expect(report.stableFilter).toBe(true);
  }
  expect(violetToBlossom.finalTheme).toBe('navy-blossom');
  expect(blossomToViolet.finalTheme).toBe('violet-lime');
});

test('Google and Gemini keep accurate multicolor marks without a provider chevron', async ({
  page,
}) => {
  await page.goto('/');

  await page.getByTestId('current-provider-icon').click();
  await page.getByRole('menuitemradio', { name: 'Google' }).click();

  const googleCurrent = await page.evaluate(() => {
    const trigger = document.querySelector('[data-testid="current-provider-icon"]');
    const icon = trigger?.querySelector('[data-provider-icon="google"]');
    if (trigger === null || icon === null || icon === undefined) {
      throw new Error('Current Google provider icon not found');
    }
    return {
      fills: Array.from(icon.querySelectorAll('path'), (path) => path.getAttribute('fill')),
      svgCount: trigger.querySelectorAll('svg').length,
    };
  });
  expect(googleCurrent).toEqual({
    fills: ['#4285F4', '#34A853', '#FBBC05', '#EA4335'],
    svgCount: 1,
  });

  await page.getByTestId('current-provider-icon').click();
  const googleMenuIcons = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-provider-icon="google"]'), (icon) =>
      Array.from(icon.querySelectorAll('path'), (path) => path.getAttribute('fill')),
    ),
  );
  expect(googleMenuIcons).toEqual([
    ['#4285F4', '#34A853', '#FBBC05', '#EA4335'],
    ['#4285F4', '#34A853', '#FBBC05', '#EA4335'],
  ]);

  await page.getByRole('menuitemradio', { name: 'Gemini' }).click();
  await page.getByTestId('current-provider-icon').click();

  const geminiMenu = await page.evaluate(() => {
    const trigger = document.querySelector('[data-testid="current-provider-icon"]');
    const icons = Array.from(document.querySelectorAll('[data-provider-icon="gemini"]'));
    const definitionIDs = icons.flatMap((icon) =>
      Array.from(icon.querySelectorAll('[id]'), (definition) => definition.id),
    );
    if (trigger === null || icons.length !== 2) {
      throw new Error('Current and menu Gemini provider icons not found');
    }
    return {
      definitionCount: definitionIDs.length,
      definitionsUnique: new Set(definitionIDs).size === definitionIDs.length,
      instances: icons.map((icon) => ({
        clipPaths: icon.querySelectorAll('clipPath').length,
        filters: icon.querySelectorAll('filter').length,
        gradientColors: Array.from(icon.querySelectorAll('radialGradient'), (gradient) =>
          gradient.querySelector('stop')?.getAttribute('stop-color'),
        ),
        radialGradients: icon.querySelectorAll('radialGradient').length,
        baseFill: icon.querySelector('rect')?.getAttribute('fill'),
      })),
      triggerSVGCount: trigger.querySelectorAll('svg').length,
    };
  });
  expect(geminiMenu).toEqual({
    definitionCount: 8,
    definitionsUnique: true,
    instances: [
      {
        baseFill: '#3186FF',
        clipPaths: 1,
        filters: 0,
        gradientColors: ['#FC413D', '#FBBC04', '#00B95C'],
        radialGradients: 3,
      },
      {
        baseFill: '#3186FF',
        clipPaths: 1,
        filters: 0,
        gradientColors: ['#FC413D', '#FBBC04', '#00B95C'],
        radialGradients: 3,
      },
    ],
    triggerSVGCount: 1,
  });

  await page.getByTestId('current-provider-icon').click();
  await page.getByRole('button', { name: /^主题：/ }).click();
  await page.getByRole('menuitemradio', { name: '绀樱夜' }).click();

  const geminiAfterThemeChange = await page.evaluate(() => {
    const trigger = document.querySelector('[data-testid="current-provider-icon"]');
    const icon = trigger?.querySelector('[data-provider-icon="gemini"]');
    if (trigger === null || icon === null || icon === undefined) {
      throw new Error('Current Gemini provider icon not found after theme change');
    }
    return {
      baseFill: icon.querySelector('rect')?.getAttribute('fill'),
      gradientColors: Array.from(icon.querySelectorAll('radialGradient'), (gradient) =>
        gradient.querySelector('stop')?.getAttribute('stop-color'),
      ),
      svgCount: trigger.querySelectorAll('svg').length,
      theme: document.documentElement.dataset.theme,
    };
  });
  expect(geminiAfterThemeChange).toEqual({
    baseFill: '#3186FF',
    gradientColors: ['#FC413D', '#FBBC04', '#00B95C'],
    svgCount: 1,
    theme: 'navy-blossom',
  });
});

test('configured search provider is restored after a session-only choice', async ({ page }) => {
  await page.route('**/api/catalog', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        ...mockCatalog,
        webSearch: 'github',
      }),
      contentType: 'application/json',
      status: 200,
    });
  });

  await page.goto('/');
  await expect(page.getByRole('button', { name: '搜索入口：GitHub' })).toBeVisible();
  await page.getByRole('button', { name: '搜索入口：GitHub' }).press('ArrowDown');
  await expect(page.getByRole('menu', { name: '选择搜索入口' })).toBeVisible();
  await page.getByRole('menuitemradio', { name: 'Google' }).click();
  await expect(page.getByRole('button', { name: '搜索入口：Google' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('button', { name: '搜索入口：GitHub' })).toBeVisible();
});

test('external search stays within compact viewport geometry', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 320, height: 568 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    const shell = page.locator('[aria-label="外部搜索"] [role="search"] > div');
    const before = await shell.boundingBox();
    expect(before?.width).toBe(viewport.width - 32);
    expect(before?.height).toBe(60);

    await page.getByRole('searchbox', { name: '搜索互联网或询问模型' }).click();
    const after = await shell.boundingBox();
    expect(after).toEqual(before);

    await page.getByRole('button', { name: '搜索入口：百度' }).click();
    const menu = await page.getByRole('menu', { name: '选择搜索入口' }).boundingBox();
    expect(menu?.x).toBeGreaterThanOrEqual(16);
    expect(menu?.x === undefined ? viewport.width : menu.x + menu.width).toBeLessThanOrEqual(
      viewport.width - 16,
    );
    const metrics = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
  }
});

test('search preserves group context and restores YAML order when cleared', async ({ page }) => {
  await page.goto('/');
  const search = page.getByRole('searchbox', { name: '搜索导航' });

  await search.fill('CODE');
  await expect(page.getByRole('link', { name: '打开 GitHub' })).toBeVisible();
  await expect(page.getByRole('link', { name: '打开 Grafana' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '开发' })).toBeVisible();

  await search.press('Escape');
  await expect(page.getByRole('link', { name: '打开 Grafana' })).toBeVisible();
  await expect(page.getByRole('link', { name: '打开 GitHub' })).toBeVisible();
});

test('bottom icon pagination switches page content and clears the old page search', async ({
  page,
}) => {
  await page.goto('/');
  const search = page.getByRole('searchbox', { name: '搜索导航' });
  await search.fill('Grafana');

  const previous = page.getByRole('button', { name: '上一页' });
  const next = page.getByRole('button', { name: '下一页' });
  await expect(previous).toBeDisabled();
  await expect(page.getByRole('button', { name: '第 1 页：我的导航' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  const pagination = page.getByRole('navigation', { name: '导航分页' });
  const initialPaginationBox = await pagination.boundingBox();
  const viewport = page.viewportSize();
  if (initialPaginationBox === null || viewport === null) {
    throw new Error('Pagination or viewport geometry is unavailable');
  }
  expect(initialPaginationBox.y + initialPaginationBox.height).toBeLessThanOrEqual(
    viewport.height,
  );

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const scrolledPaginationBox = await pagination.boundingBox();
  if (scrolledPaginationBox === null) {
    throw new Error('Pagination geometry is unavailable after scrolling');
  }
  expect(scrolledPaginationBox.y).toBeCloseTo(initialPaginationBox.y, 0);
  await expect
    .poll(() =>
      pagination.evaluate((element) => {
        const slot = element.parentElement;
        if (slot === null) return { position: 'missing', zIndex: Number.NaN };
        return {
          position: getComputedStyle(slot).position,
          zIndex: Number(getComputedStyle(slot).zIndex),
        };
      }),
    )
    .toEqual({ position: 'fixed', zIndex: 9 });

  await next.click();
  await expect(page).toHaveTitle('灵感收藏 · Navi');
  await expect(page.getByRole('heading', { name: '精选' })).toBeVisible();
  await expect(page.getByRole('link', { name: '打开 Are.na' })).toBeVisible();
  await expect(search).toHaveValue('');
  await expect(next).toBeDisabled();
  await expect(page.getByRole('button', { name: '第 2 页：灵感收藏' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  await previous.click();
  await expect(page).toHaveTitle('我的导航 · Navi');
  await expect(page.getByRole('link', { name: '打开 Grafana' })).toBeVisible();
});

test('mobile search uses a single-scroll overlay and preserves the query', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await expect(page.getByRole('searchbox', { name: '搜索导航' })).toHaveCount(0);
  await page.getByRole('button', { name: '打开搜索' }).click();
  const dialog = page.getByRole('dialog', { name: '搜索导航' });
  await expect(dialog).toBeVisible();

  const search = dialog.getByRole('searchbox', { name: '搜索导航' });
  await search.fill('Grafana');
  await expect(dialog.getByRole('link', { name: '打开 Grafana' })).toBeVisible();
  await expect(dialog.getByRole('link', { name: '打开 GitHub' })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('hidden');

  await dialog.getByRole('button', { name: '关闭搜索' }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('');
});

test('theme preference is local and survives reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '主题：默认' }).click();
  await page.getByRole('menuitemradio', { name: '绀樱夜' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme-preference', 'navy-blossom');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'navy-blossom');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme-preference', 'navy-blossom');
});

test('background pattern follows theme control, persists, and never captures input', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  const themeButton = page.getByRole('button', { name: '主题：默认' });
  const patternButton = page.getByRole('button', { name: '背景纹样：经纬阵' });
  await expect(patternButton).toBeVisible();

  const patternFollowsTheme = await page.evaluate(() => {
    const theme = document.querySelector('[aria-label="主题：默认"]');
    const pattern = document.querySelector('[aria-label="背景纹样：经纬阵"]');
    return (
      theme !== null &&
      pattern !== null &&
      Boolean(theme.compareDocumentPosition(pattern) & Node.DOCUMENT_POSITION_FOLLOWING)
    );
  });
  expect(patternFollowsTheme).toBe(true);

  const layer = page.locator('[data-background-pattern-layer]');
  await expect(layer).toHaveAttribute('data-pattern', 'meridian-grid');
  await expect(layer).toHaveCSS('position', 'fixed');
  await expect(layer).toHaveCSS('pointer-events', 'none');

  const geometryBeforeTheme = await layer.locator('svg').evaluate((svg) => ({
    paths: svg.querySelectorAll('path').length,
    circles: svg.querySelectorAll('circle').length,
    viewBox: svg.getAttribute('viewBox'),
  }));

  await themeButton.click();
  await page.getByRole('menuitemradio', { name: '绀樱夜' }).click();
  const geometryAfterTheme = await layer.locator('svg').evaluate((svg) => ({
    paths: svg.querySelectorAll('path').length,
    circles: svg.querySelectorAll('circle').length,
    viewBox: svg.getAttribute('viewBox'),
  }));
  expect(geometryAfterTheme).toEqual(geometryBeforeTheme);

  await page.getByRole('button', { name: '背景纹样：经纬阵' }).click();
  await expect(page.getByRole('menu', { name: '选择背景纹样' })).toBeVisible();
  await expect(page.getByRole('menuitemradio')).toHaveCount(9);
  await page.getByRole('menuitemradio', { name: '天游环' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-background-pattern', 'orbital-rings');
  await expect(layer).toHaveAttribute('data-pattern', 'orbital-rings');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-background-pattern', 'orbital-rings');

  await page.getByRole('button', { name: '背景纹样：天游环' }).click();
  await page.getByRole('menuitemradio', { name: '素幕' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-background-pattern', 'none');
  await expect(layer.locator('svg')).toHaveCount(0);
});

test('every visible background pattern runs a distinct ambient motion and respects reduced motion', async ({
  page,
}) => {
  const patterns = [
    { label: '经纬阵', id: 'meridian-grid' },
    { label: '天游环', id: 'orbital-rings' },
    { label: '双鱼宫', id: 'pisces' },
    { label: '天弓宫', id: 'sagittarius' },
    { label: '回廊纹', id: 'roman-meander' },
    { label: '玫瑰窗', id: 'rose-window' },
    { label: '八芒阵', id: 'eight-point-star' },
    { label: '星轨幕', id: 'star-trails' },
  ] as const;

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const motionSignatures = new Set<string>();

  for (const pattern of patterns) {
    await page.getByRole('button', { name: /^背景纹样：/ }).click();
    await page.getByRole('menuitemradio', { name: pattern.label }).click();
    await expect(page.locator('html')).toHaveAttribute('data-background-pattern', pattern.id);

    const motionLayers = page.locator(
      `[data-background-pattern-layer] [data-pattern-artwork="${pattern.id}"] [data-pattern-motion]`,
    );
    await expect(motionLayers).not.toHaveCount(0);
    await expect
      .poll(async () => {
        const states = await motionLayers.evaluateAll((layers) =>
          layers.map((layer) => {
            const style = getComputedStyle(layer);
            return {
              duration: Number.parseFloat(style.animationDuration),
              id: layer.getAttribute('data-pattern-motion'),
              name: style.animationName,
              playState: style.animationPlayState,
            };
          }),
        );

        return (
          states.length > 0 &&
          states.every(
            (state) =>
              state.id !== null &&
              state.name !== 'none' &&
              state.duration >= 18 &&
              state.playState === 'running',
          )
        );
      })
      .toBe(true);

    const motionState = await motionLayers.evaluateAll((layers) =>
      layers.map((layer) => {
        const style = getComputedStyle(layer);
        return {
          duration: Number.parseFloat(style.animationDuration),
          id: layer.getAttribute('data-pattern-motion'),
          name: style.animationName,
          playState: style.animationPlayState,
        };
      }),
    );

    motionSignatures.add(motionState.map((state) => `${state.id}:${state.name}`).join('|'));
  }

  expect(motionSignatures.size).toBe(patterns.length);

  await page.getByRole('button', { name: /^背景纹样：/ }).click();
  await page.getByRole('menuitemradio', { name: '星轨幕' }).click();
  const starTrailsFast = page.locator(
    '[data-background-pattern-layer] [data-pattern-motion="star-trails-fast"]',
  );
  const firstDashOffset = await starTrailsFast.evaluate(
    (layer) => getComputedStyle(layer).strokeDashoffset,
  );
  await page.waitForTimeout(250);
  const secondDashOffset = await starTrailsFast.evaluate(
    (layer) => getComputedStyle(layer).strokeDashoffset,
  );
  expect(secondDashOffset).not.toBe(firstDashOffset);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const pattern of patterns) {
    await page.getByRole('button', { name: /^背景纹样：/ }).click();
    await page.getByRole('menuitemradio', { name: pattern.label }).click();
    const reducedMotionLayers = page.locator(
      `[data-background-pattern-layer] [data-pattern-artwork="${pattern.id}"] [data-pattern-motion]`,
    );
    await expect(reducedMotionLayers).not.toHaveCount(0);
    await expect
      .poll(async () => {
        const names = await reducedMotionLayers.evaluateAll((layers) =>
          layers.map((layer) => getComputedStyle(layer).animationName),
        );
        return names.length > 0 && names.every((name) => name === 'none');
      })
      .toBe(true);
  }
});

test('background patterns do not create horizontal overflow on compact viewports', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 320, height: 568 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.getByRole('button', { name: /背景纹样：/ }).click();
    await page.getByRole('menuitemradio', { name: '星轨幕' }).click();

    const metrics = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
  }
});

test('star trails keep their visual origin just outside the lower-left viewport', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.getByRole('button', { name: /背景纹样：/ }).click();
    await page.getByRole('menuitemradio', { name: '星轨幕' }).click();

    const geometry = await page
      .locator('[data-background-pattern-layer] [data-pattern-artwork="star-trails"]')
      .evaluate((svg) => {
        const artwork = svg as SVGSVGElement;
        const matrix = artwork.getScreenCTM();
        const origin = artwork.querySelector('[data-star-trails-origin]');
        const circles = [...artwork.querySelectorAll('circle')].map((circle) => ({
          cx: Number(circle.getAttribute('cx')),
          cy: Number(circle.getAttribute('cy')),
          r: Number(circle.getAttribute('r')),
        }));

        if (matrix === null || origin === null) throw new Error('Star-trail geometry is missing.');

        const readStrokeWidth = (selector: string): string => {
          const element = artwork.querySelector(selector);
          if (element === null) throw new Error(`Star-trail layer is missing: ${selector}`);
          return getComputedStyle(element).strokeWidth;
        };

        return {
          fastStrokeWidth: readStrokeWidth('[data-pattern-motion="star-trails-fast"]'),
          guideStrokeWidth: readStrokeWidth(
            '[data-pattern-motion="star-trails-field"] circle',
          ),
          maxRight: Math.max(...circles.map((circle) => circle.cx + circle.r)),
          mediumStrokeWidth: readStrokeWidth('[data-pattern-motion="star-trails-medium"]'),
          opacity: getComputedStyle(artwork).opacity,
          originX: matrix.a * 90 + matrix.c * 950 + matrix.e,
          originY: matrix.b * 90 + matrix.d * 950 + matrix.f,
          preserveAspectRatio: artwork.getAttribute('preserveAspectRatio'),
          slowStrokeWidth: readStrokeWidth('[data-pattern-motion="star-trails-slow"]'),
        };
      });

    expect(geometry.opacity).toBe('0.86');
    expect(geometry.guideStrokeWidth).toBe('1.1px');
    expect(geometry.slowStrokeWidth).toBe('1.55px');
    expect(geometry.mediumStrokeWidth).toBe('1.3px');
    expect(geometry.fastStrokeWidth).toBe('1.45px');
    expect(geometry.preserveAspectRatio).toBe('xMinYMax slice');
    expect(geometry.maxRight).toBeLessThanOrEqual(870);
    expect(geometry.originX).toBeLessThanOrEqual(viewport.width * 0.25);
    expect(geometry.originY).toBeGreaterThanOrEqual(viewport.height);
    expect(geometry.originY).toBeLessThanOrEqual(viewport.height + 100);
  }
});

test('has no serious or critical automated accessibility violations', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const grafana = page.getByRole('link', { name: '打开 Grafana' });
  await expect(grafana).toBeVisible();
  await expect
    .poll(() =>
      grafana.evaluate((card) => {
        const secondary = card.querySelector<HTMLElement>('[title="Metrics and dashboards"]');
        const context = document.createElement('canvas').getContext('2d');
        if (secondary === null || context === null) return false;

        context.fillStyle = getComputedStyle(document.documentElement)
          .getPropertyValue('--text-secondary')
          .trim();
        const targetColor = context.fillStyle;
        context.fillStyle = getComputedStyle(secondary).color;
        return context.fillStyle === targetColor;
      }),
    )
    .toBe(true);

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const blockingViolations = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );

  expect(blockingViolations).toEqual([]);
});
