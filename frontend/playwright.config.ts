import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright drives the real app in a real browser.
 *
 * This exists because a React component that throws during render still
 * returns HTTP 200 and still passes `tsc` and `vite build` — that is exactly
 * how the "SelectLabel must be used within SelectGroup" crash reached a blank
 * page. Every spec here fails the run on any console error, so a render crash
 * cannot pass silently again.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    // Never reuse: a server already running with a different auth mode would
    // silently invalidate the whole run.
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      /**
       * Auth OFF by default, even when .env holds a real key.
       *
       * Otherwise every workspace test hits the sign-in gate and fails for a
       * reason that has nothing to do with what it is testing. Pass a key
       * explicitly to exercise the auth specs:
       *
       *   VITE_CLERK_PUBLISHABLE_KEY=pk_test_... npx playwright test auth
       *
       * process.env wins over .env files in Vite, so '' really does disable it.
       */
      VITE_CLERK_PUBLISHABLE_KEY: process.env.VITE_CLERK_PUBLISHABLE_KEY ?? '',

      /**
       * Mocks ON by default, whatever .env.local says.
       *
       * The suite must not depend on a backend being up — otherwise a failure
       * means "uvicorn is not running", not "the UI is broken". Run against
       * the real service deliberately:
       *
       *   VITE_USE_MOCKS=false npx playwright test live-backend
       */
      VITE_USE_MOCKS: process.env.VITE_USE_MOCKS ?? 'true',
    },
  },
})
