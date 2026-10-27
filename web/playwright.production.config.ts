import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e/production',
  testMatch: '**/*.spec.ts',
  globalSetup: './e2e/production/global-setup.ts',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  reporter: [['list']],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
  },
  projects: [
    { name: 'production-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'production-firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'production-webkit', use: { ...devices['Desktop Safari'] } },
  ],
})
