import { test } from '@playwright/test'

/**
 * Not assertions — a way to actually look at the UI. Run with:
 *   npx playwright test screenshots --update-snapshots
 * Output lands in the directory named by SHOT_DIR.
 */
const dir = process.env.SHOT_DIR ?? 'screenshots'

test.use({ viewport: { width: 1440, height: 900 } })

test('capture', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('heading', { name: 'Institutional Buddy' }).waitFor()
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${dir}/01-guide.png` })

  await page.getByRole('tab', { name: /ask/i }).click()
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${dir}/02-ask-empty.png` })

  await page.getByRole('button', { name: /I just joined/ }).first().click()
  await page.getByRole('textbox').press('Enter')
  await page.getByRole('button', { name: /save to memory/i }).waitFor({ timeout: 20_000 })
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${dir}/03-answer.png` })

  await page.getByRole('button', { name: /^Memory/ }).click()
  await page.getByRole('dialog').waitFor()
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${dir}/04-memory-inspector.png` })
  await page.keyboard.press('Escape')

  await page.getByRole('tab', { name: /what changed/i }).click()
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${dir}/05-what-changed.png` })

  await page.getByRole('button', { name: /Customer Success Specialist/ }).click()
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${dir}/06-guide-card-b.png` })
})

test('no page-level scroll on the Ask tab', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await page.getByRole('tab', { name: /ask/i }).click()
  await page.waitForTimeout(400)
  const overflow = await page.evaluate(
    () => document.documentElement.scrollHeight - document.documentElement.clientHeight,
  )
  if (overflow > 0) throw new Error(`page scrolls by ${overflow}px`)
})
