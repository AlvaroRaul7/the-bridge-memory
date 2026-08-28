import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

/**
 * Unit/contract tests only. The Playwright specs under e2e/ import
 * @playwright/test and must not be picked up here — `npm test` is vitest,
 * `npm run test:e2e` is Playwright.
 */
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ['src/**/*.spec.ts'],
    },
  }),
)
