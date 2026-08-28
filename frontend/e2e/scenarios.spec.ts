import { expect, test } from './fixtures'

/** The Scenarios content tabs — no backend calls, but they must still render. */

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Institutional Buddy' })).toBeVisible()
})

test('every tab renders without a console error', async ({ page }) => {
  for (const name of [/guide/i, /documents/i, /what changed/i, /ask/i]) {
    await page.getByRole('tab', { name }).click()
    await expect(page.getByRole('tab', { name })).toHaveAttribute('data-state', 'active')
  }
})

test('guide is client-facing and its sample questions are clickable', async ({ page }) => {
  await page.getByRole('tab', { name: /guide/i }).click()
  await expect(page.getByText('Your onboarding co-pilot')).toBeVisible()
  await expect(page.getByText('How to use it')).toBeVisible()
  // No repo internals on this tab.
  await expect(page.getByText(/graded criteria/i)).toHaveCount(0)
  await expect(page.getByText(/round 1/i)).toHaveCount(0)

  // Clicking a sample question jumps to the chat with it prefilled.
  await page.getByRole('button', { name: /I just joined and I need read-only prod access/ }).click()
  await expect(page.getByRole('tab', { name: /ask/i })).toHaveAttribute('data-state', 'active')
  await expect(page.getByRole('textbox')).toHaveValue(/I just joined and I need read-only prod access/)
})

test('documents render markdown for both rounds', async ({ page }) => {
  await page.getByRole('tab', { name: /documents/i }).click()
  await expect(page.getByRole('button', { name: 'access-policy.md' })).toBeVisible()
  await page.getByRole('button', { name: 'policy-update-2026-05-15.md' }).click()
  await expect(page.getByText(/Prod Access Foundations/).first()).toBeVisible()
})

test('what-changed shows the old and new position for each item', async ({ page }) => {
  await page.getByRole('tab', { name: /what changed/i }).click()
  await expect(page.getByText('Read-only prod access trigger')).toBeVisible()
  await expect(page.getByText('Previously').first()).toBeVisible()
  await expect(page.getByText('Now').first()).toBeVisible()
})

test('all four cards load', async ({ page }) => {
  for (const card of [
    /New-Hire Onboarding Agent/,
    /Customer Success Specialist/,
    /M&A Diligence Analyst/,
    /Sales Engineer for Product X/,
  ]) {
    await page.getByRole('button', { name: card }).click()
    await expect(page.getByRole('heading', { level: 2 })).toBeVisible()
  }
})
