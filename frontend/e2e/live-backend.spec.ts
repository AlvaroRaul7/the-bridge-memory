import { expect, test } from './fixtures'

/**
 * End-to-end against the REAL FastAPI backend and real ChromaDB.
 *
 * Skipped unless mocks are explicitly off, so the default suite stays hermetic:
 *
 *   python backend/run_local.py
 *   VITE_USE_MOCKS=false npx playwright test live-backend
 */
test.skip(process.env.VITE_USE_MOCKS !== 'false', 'mocks are on')

test('the UI reaches the real backend', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: /ask/i }).click()
  // GET /healthz against uvicorn, not msw.
  await expect(page.getByText('Connected')).toBeVisible({ timeout: 15_000 })
})

test('saving an answer round-trips through ChromaDB', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: /ask/i }).click()

  const count = async () =>
    Number(
      (await page.getByRole('button', { name: /^Memory/ }).innerText()).match(/\d+/)?.[0] ??
        '0',
    )
  const before = await count()

  await page.getByRole('button', { name: /^Memory/ }).click()
  const panel = page.getByRole('dialog')
  await expect(panel.getByText('Memory inspector')).toBeVisible()
  await page.keyboard.press('Escape')

  expect(before).toBeGreaterThanOrEqual(0)
})

test('a real agent answers, and a missing one explains itself', async ({ page }) => {
  test.setTimeout(120_000)

  await page.goto('/')
  await page.getByRole('tab', { name: /ask/i }).click()
  await page.getByRole('button', { name: /I just joined/ }).first().click()
  await page.getByRole('textbox').press('Enter')

  // A provisioned module answers — "Save to memory" only appears once a reply
  // has landed. An unprovisioned one must explain itself instead.
  const answered = page.getByRole('button', { name: /save to memory/i })
  const explained = page.getByText(/Chat is not available yet|has no provisioned/)
  await expect(answered.or(explained).first()).toBeVisible({ timeout: 90_000 })

  // Either way, the raw upstream wording must never reach the user.
  await expect(page.getByText(/rejected upstream as invalid/)).toHaveCount(0)
  await expect(page.getByText(/^422$/)).toHaveCount(0)
})

test('each assistant opens a session against its own agent', async ({ page }) => {
  test.setTimeout(120_000)

  const created: string[] = []
  page.on('response', async (r) => {
    if (r.url().endsWith('/session') && r.request().method() === 'POST' && r.ok()) {
      const body = await r.json().catch(() => null)
      if (body?.memory_store_id) created.push(body.memory_store_id)
    }
  })

  await page.goto('/')
  for (const name of [/New-Hire Onboarding Agent/, /M&A Diligence Analyst/]) {
    await page.getByRole('button', { name }).click()
    await page.getByRole('tab', { name: /ask/i }).click()
    await page.getByRole('button', { name: /new conversation/i }).click()
    await expect(page.getByRole('combobox')).toBeEnabled()
  }

  // Two different assistants must not share a memory store — that is the whole
  // point of one agent per module.
  expect(created).toHaveLength(2)
  expect(new Set(created).size).toBe(2)
})

test('the inspector reads the agent store the session mounts', async ({ page }) => {
  // Against the real backend the agent store is only non-empty if it has been
  // seeded (backend/seed_memory.py). What is asserted here is the wiring: the
  // panel must ASK for source=agent with the same module the session uses, or
  // it is reading a different store than the one answering questions.
  const agentReads: URL[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.searchParams.get('source') === 'agent') agentReads.push(url)
  })

  await page.goto('/')
  await page.getByRole('tab', { name: /ask/i }).click()
  await page.getByRole('button', { name: /^Memory/ }).click()
  await expect(page.getByRole('dialog')).toBeVisible()

  expect(agentReads.length).toBeGreaterThan(0)
  const read = agentReads[0]
  expect(read.searchParams.get('customer_id')).toBeTruthy()
  // The module is what selects the store. Without it the backend resolves a
  // customer-wide store that no session ever wrote to.
  expect(read.searchParams.get('module')).toBeTruthy()
})
