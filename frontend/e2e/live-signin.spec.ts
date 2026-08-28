import { expect, test } from '@playwright/test'

/** Checks the real Clerk widgets against the backdrop, sign-in and sign-up. */
const dir = process.env.SHOT_DIR ?? 'screenshots'

// Needs a real Clerk key; the default suite runs unauthenticated.
//   VITE_CLERK_PUBLISHABLE_KEY=pk_test_... npx playwright test live-signin
test.skip(!process.env.VITE_CLERK_PUBLISHABLE_KEY, 'no Clerk key configured')
test.use({ viewport: { width: 1440, height: 900 } })

test('sign-in and sign-up both stay on our backdrop', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))

  await page.goto('/')
  await expect(page.getByText('Your institutional buddy')).toBeVisible({ timeout: 25_000 })
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${dir}/08-signin-live.png` })

  // Clerk's own "Sign up" footer link goes to the hosted accounts.dev portal,
  // which we cannot style — it must be hidden in favour of our toggle.
  await expect(page.locator('.cl-footerAction')).toBeHidden()

  await page.getByRole('button', { name: 'Sign up' }).click()
  await expect(page.getByText('Create an account to get your own assistants')).toBeVisible()
  await page.waitForTimeout(2000)
  await page.screenshot({ path: `${dir}/09-signup-live.png` })

  // Still on our origin, still on the backdrop.
  expect(new URL(page.url()).host).toBe('localhost:5173')
  await expect(page.locator('img[alt=""]')).toBeVisible()

  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Your institutional buddy')).toBeVisible()

  console.log('CONSOLE_ERRORS:', JSON.stringify(errors))
})
