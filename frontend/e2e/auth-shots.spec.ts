import { test } from '@playwright/test'

const dir = process.env.SHOT_DIR ?? 'screenshots'
test.skip(!process.env.VITE_CLERK_PUBLISHABLE_KEY, 'no Clerk key configured')
test.use({ viewport: { width: 1440, height: 900 } })

test('auth screens', async ({ page }) => {
  await page.route('**/clerk*.js', (route) => route.abort())
  await page.goto('/')
  await page.getByText('Sign-in is unavailable').waitFor({ timeout: 20_000 })
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${dir}/07-auth-unavailable.png` })
})
