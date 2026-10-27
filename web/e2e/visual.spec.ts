import { expect, test, type Page } from '@playwright/test'

const palettes = ['ink', 'paper', 'celadon', 'dusk'] as const
const patterns = ['contour', 'flow', 'guilloche', 'stars', 'ridge', 'none'] as const

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-16T01:41:30.000Z'))
  await page.emulateMedia({ reducedMotion: 'reduce' })
})

async function open(
  page: Page,
  preferences: { theme?: string; pattern?: string } = {},
): Promise<void> {
  await page.addInitScript((stored) => {
    if (stored.theme !== undefined) window.localStorage.setItem('navi.theme', stored.theme)
    if (stored.pattern !== undefined) window.localStorage.setItem('navi.pattern', stored.pattern)
  }, preferences)
  await page.goto('/')
  await expect(page.getByRole('link', { name: '打开 Grafana' })).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
}

test('desktop home', async ({ page }) => {
  await open(page)
  await expect(page).toHaveScreenshot('home-desktop.png', { animations: 'disabled' })
})

test('desktop full catalog', async ({ page }) => {
  // Full-page capture resizes the viewport, which redraws the canvas; keep this shot pattern-free.
  await open(page, { pattern: 'none' })
  await expect(page).toHaveScreenshot('catalog-desktop-full.png', {
    animations: 'disabled',
    fullPage: true,
  })
})

for (const palette of palettes) {
  test(`palette ${palette}`, async ({ page }) => {
    await open(page, { theme: palette, pattern: 'none' })
    await expect(page).toHaveScreenshot(`palette-${palette}.png`, { animations: 'disabled' })
  })
}

for (const pattern of patterns) {
  test(`pattern ${pattern}`, async ({ page }) => {
    await open(page, { pattern })
    await expect(page).toHaveScreenshot(`pattern-${pattern}.png`, { animations: 'disabled' })
  })
}

test('search results', async ({ page }) => {
  await open(page)
  await page.getByRole('combobox', { name: '搜索网页或筛选链接' }).fill('git')
  await expect(page.getByRole('listbox', { name: '搜索结果' })).toBeVisible()
  await expect(page).toHaveScreenshot('search-results.png', { animations: 'disabled' })
})

test('quick search and appearance panel', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: '外观：纹样与色调' }).click()
  await expect(page).toHaveScreenshot('appearance-panel.png', { animations: 'disabled' })
  await page.keyboard.press('Escape')
  await page.keyboard.press('ControlOrMeta+k')
  await page.getByRole('combobox', { name: '搜索链接' }).fill('ai')
  await expect(page).toHaveScreenshot('quick-search.png', { animations: 'disabled' })
})

test('mobile home and catalog', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await open(page)
  await expect(page).toHaveScreenshot('home-mobile.png', { animations: 'disabled' })
  await page.getByRole('heading', { level: 2, name: '开发' }).scrollIntoViewIfNeeded()
  await expect(page).toHaveScreenshot('catalog-mobile.png', { animations: 'disabled' })
})

test('degraded banner and failure state', async ({ page }) => {
  await page.route('**/api/status', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ health: 'degraded', revision: 1 }),
    }),
  )
  await open(page)
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page).toHaveScreenshot('degraded.png', { animations: 'disabled' })
})
