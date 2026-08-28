import { expect, test } from './fixtures'

/** The three Spec 3 views, against the msw mock of the real Spec 2 API. */

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Institutional Buddy/ })).toBeVisible()
  await page.getByRole('tab', { name: /ask/i }).click()
})

test('the Ask tab reports a healthy API and the current workspace', async ({ page }) => {
  await expect(page.getByRole('tab', { name: /ask/i })).toHaveAttribute(
    'data-state',
    'active',
  )
  await expect(page.getByText('Connected')).toBeVisible()
  await expect(page.getByText('BTS-Synthetic Engineering').first()).toBeVisible()
})

test('no conversation exists until one is needed', async ({ page }) => {
  // Sessions are created lazily so opening the tab does not burn one.
  await expect(page.getByRole('combobox')).toBeDisabled()
  await expect(page.getByText('No conversation yet')).toBeVisible()
})

test('creating a conversation calls POST /session and lists it', async ({ page }) => {
  await page.getByRole('button', { name: /new conversation/i }).click()
  await expect(page.getByRole('combobox')).toBeEnabled()

  await page.getByRole('combobox').click()
  await expect(page.getByRole('option')).toHaveCount(1)
  await page.keyboard.press('Escape')
})

test('a chat turn shows the memories retrieved for it, then the answer', async ({
  page,
}) => {
  await page.getByRole('button', { name: /I just joined/ }).first().click()
  await page.getByRole('textbox').press('Enter')

  // GET /memory/search, rendered inline — the Spec 3 differentiator.
  await expect(page.getByText(/Answered using \d+ saved note/)).toBeVisible({
    timeout: 15_000,
  })
  // POST /session/{id}/message — a real reply, no longer stubbed client-side.
  await expect(page.getByText(/#sre-access-requests/).first()).toBeVisible({
    timeout: 15_000,
  })
})

test('sending a message auto-creates the conversation', async ({ page }) => {
  await expect(page.getByRole('combobox')).toBeDisabled()

  await page.getByRole('button', { name: /I just joined/ }).first().click()
  await page.getByRole('textbox').press('Enter')
  await expect(page.getByRole('button', { name: /save to memory/i })).toBeVisible({
    timeout: 15_000,
  })

  await expect(page.getByRole('combobox')).toBeEnabled()
})

test('saving an answer writes to memory and the count goes up', async ({ page }) => {
  const count = async () =>
    Number(
      (await page.getByRole('button', { name: /^Memory/ }).innerText()).match(/\d+/)?.[0] ??
        '0',
    )
  const before = await count()

  await page.getByRole('button', { name: /I just joined/ }).first().click()
  await page.getByRole('textbox').press('Enter')
  await page.getByRole('button', { name: /save to memory/i }).click({ timeout: 15_000 })
  await expect(page.getByRole('button', { name: /saved to memory/i })).toBeVisible()

  expect(await count()).toBe(before + 1)
})

test('memory inspector lists records with metadata and deletes one', async ({ page }) => {
  await page.getByRole('button', { name: /^Memory/ }).click()
  const panel = page.getByRole('dialog')
  await expect(panel.getByText('Memory inspector')).toBeVisible()

  const rows = panel.locator('article')
  const before = await rows.count()
  expect(before).toBeGreaterThan(0)

  // kind comes out of the free-form metadata dict.
  await expect(
    rows.first().getByText(/policy|fact|contact|decision|note/).first(),
  ).toBeVisible()

  // DELETE /memory/{id}?tenant_id= — the tenant is required by the backend.
  await rows.first().getByRole('button', { name: /delete memory/i }).click()
  await expect(rows).toHaveCount(before - 1)
})

test('switching assistant switches workspace', async ({ page }) => {
  await page.getByRole('button', { name: /M&A Diligence Analyst/ }).click()
  await expect(page.getByText('Project Lighthouse / Helios Data Systems').first()).toBeVisible()
})

test('a stored session the backend rejects is dropped, not retried forever', async ({
  page,
}) => {
  // A session id minted by a previous run/mode. The backend answers 404 (mock)
  // or 422 (real Managed Agents, which validates the id format) — either way
  // it must be forgotten rather than re-fetched on every load.
  await page.goto('/')
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith('ib.sessions.v1'))
      ?? 'ib.sessions.v1.mock'
    localStorage.setItem(
      key,
      JSON.stringify({
        'demo:card-a-onboarding': [
          {
            sessionId: 'sess_deadbeef',
            userId: 'demo',
            scenarioId: 'card-a-onboarding',
            title: 'Stale conversation',
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    )
  })

  const rejected: number[] = []
  page.on('response', (r) => {
    if (r.url().includes('/session/sess_deadbeef')) rejected.push(r.status())
  })

  await page.reload()
  await page.getByRole('tab', { name: /ask/i }).click()
  await expect(page.getByText('No conversation yet')).toBeVisible()

  // Asked for once, then removed from storage.
  expect(rejected.length).toBeGreaterThan(0)
  const remaining = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith('ib.sessions.v1'))
    return key ? localStorage.getItem(key) : null
  })
  expect(remaining ?? '').not.toContain('sess_deadbeef')
})
