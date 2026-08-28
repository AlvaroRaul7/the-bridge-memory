import { expect, test } from '@playwright/test'

/**
 * The Clerk-enabled path. Skipped unless a publishable key is set, so the
 * normal suite keeps running unauthenticated (the mode specs/03 describes).
 *
 *   VITE_CLERK_PUBLISHABLE_KEY=pk_test_... npx playwright test auth
 *
 * With a real key this asserts the sign-in gate. With an unreachable Clerk
 * (a bogus key, a blocked script, no network) it asserts the failure screen —
 * because <Show> renders null until Clerk resolves, and without an explicit
 * ClerkFailed branch that is a permanently blank page.
 */
test.skip(!process.env.VITE_CLERK_PUBLISHABLE_KEY, 'no Clerk key configured')

test('a signed-out visitor never reaches the workspace', async ({ page }) => {
  await page.goto('/')

  // Either the sign-in gate or the failure screen — never the workspace, and
  // never a blank page.
  await expect(
    page
      .getByText('Sign in to reach your assistants')
      .or(page.getByText('We could not reach the authentication service')),
  ).toBeVisible({ timeout: 20_000 })

  await expect(page.getByRole('tab', { name: /guide/i })).toHaveCount(0)
  await expect(page.getByRole('textbox')).toHaveCount(0)
})

test('an unreachable Clerk explains itself rather than showing nothing', async ({
  page,
}) => {
  // Block Clerk's script to simulate a bad key / blocked CDN / offline.
  await page.route('**/clerk*.js', (route) => route.abort())
  await page.goto('/')

  await expect(page.getByText('Sign-in is unavailable')).toBeVisible({
    timeout: 20_000,
  })
  await expect(page.getByText('VITE_CLERK_PUBLISHABLE_KEY')).toBeVisible()
})

test('the sign-in frame does not clip its content on a short viewport', async ({
  page,
}) => {
  await page.route('**/clerk*.js', (route) => route.abort())
  await page.setViewportSize({ width: 1280, height: 560 })
  await page.goto('/')

  const notice = page.getByText('Sign-in is unavailable')
  await notice.waitFor({ timeout: 20_000 })

  // Everything must be reachable — clipped content would report a box outside
  // the scrollable area, or none at all.
  const box = await page.getByText('VITE_CLERK_PUBLISHABLE_KEY').boundingBox()
  expect(box).not.toBeNull()
  const docHeight = await page.evaluate(() => document.documentElement.scrollHeight)
  expect(box!.y + box!.height).toBeLessThanOrEqual(docHeight)
})
