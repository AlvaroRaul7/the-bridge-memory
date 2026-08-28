import { test as base, expect } from '@playwright/test'

/**
 * Every test gets a page that fails on console errors and page exceptions.
 * Without this a render crash is invisible: the server returns 200, the DOM is
 * empty, and an assertion on "some element is missing" reads like a selector
 * problem rather than the crash it actually is.
 */
export const test = base.extend<{ errors: string[] }>({
  errors: async ({ page }, use) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })
    page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`))
    await use(errors)
    expect(errors, `console errors:\n${errors.join('\n')}`).toEqual([])
  },
})

export { expect }
