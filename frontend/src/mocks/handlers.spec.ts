/**
 * Exercises every route in `backend/app/routers/` against the msw mock,
 * through the real `api` client — so the client and the mock are verified
 * together, and both are checked against the shapes in
 * `backend/app/schemas.py`.
 *
 * Run: npm test
 */
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest'
import { setupServer } from 'msw/node'
import { HttpResponse, http } from 'msw'
import { handlers } from './handlers'
import { api, API_BASE_URL, ApiError } from '@/lib/api'
import { tenantId } from '@/lib/auth'

const server = setupServer(...handlers)
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const TENANT = tenantId('card-a-onboarding')

/* --- health ---------------------------------------------------------------- */

test('GET /healthz', async () => {
  expect(await api.health()).toEqual({ status: 'ok' })
})

/* --- memory ---------------------------------------------------------------- */

test('GET /memory returns records in the {id, text, metadata} shape', async () => {
  const records = await api.listMemory(TENANT)
  expect(records.length).toBeGreaterThan(0)
  const [first] = records
  expect(typeof first.id).toBe('string')
  expect(typeof first.text).toBe('string')
  expect(first.metadata).toBeTypeOf('object')
  // The old flattened fields must be gone, not merely unused.
  expect(first).not.toHaveProperty('content')
  expect(first).not.toHaveProperty('kind')
  expect(first).not.toHaveProperty('tenant_id')
})

test('a tenant is seeded on first touch', async () => {
  const fresh = tenantId('card-d-sales-engineer', 'user_abc123')
  const records = await api.listMemory(fresh)
  expect(records.length).toBeGreaterThan(0)
})

test('two accounts on the same assistant do not share memory', async () => {
  const a = await api.listMemory(tenantId('card-a-onboarding', 'user_aaa'))
  const b = await api.listMemory(tenantId('card-a-onboarding', 'user_bbb'))
  expect(a.length).toBeGreaterThan(0)
  expect(a.filter((x) => b.some((y) => y.id === x.id))).toHaveLength(0)
})

test('GET /memory/search ranks by distance, ascending', async () => {
  const hits = await api.searchMemory({
    tenant_id: TENANT,
    q: 'prod access pairing session',
  })
  expect(hits.length).toBeGreaterThan(0)
  // Chroma distance: LOWER is closer. Ascending, not descending.
  const distances = hits.map((h) => h.distance)
  expect(distances).toEqual([...distances].sort((x, y) => x - y))
  expect(hits[0]).toHaveProperty('text')
  expect(hits[0]).not.toHaveProperty('record')
  expect(hits[0]).not.toHaveProperty('score')
})

test('GET /memory/search honours k', async () => {
  const hits = await api.searchMemory({ tenant_id: TENANT, q: 'access policy', k: 1 })
  expect(hits.length).toBeLessThanOrEqual(1)
})

test('POST /memory writes and returns just an id', async () => {
  const before = (await api.listMemory(TENANT)).length
  const { id } = await api.writeMemory({
    tenant_id: TENANT,
    text: 'Written by the suite.',
    metadata: { kind: 'note', user_id: 'user_test', session_id: 'sess_test' },
  })
  expect(id).toMatch(/^mem_/)

  const after = await api.listMemory(TENANT)
  expect(after.length).toBe(before + 1)
  // Provenance the backend session cannot carry must survive the round trip.
  const written = after.find((m) => m.id === id)
  expect(written?.metadata.user_id).toBe('user_test')
  expect(written?.metadata.session_id).toBe('sess_test')
})

test('DELETE /memory/{id} requires the owning tenant', async () => {
  const { id } = await api.writeMemory({ tenant_id: TENANT, text: 'to delete' })

  // Another tenant must not be able to delete it by guessing the id.
  await expect(
    api.deleteMemory(id, tenantId('card-c-ma-diligence')),
  ).rejects.toMatchObject({ status: 404 })

  expect(await api.deleteMemory(id, TENANT)).toEqual({ id, deleted: true })
  expect((await api.listMemory(TENANT)).some((m) => m.id === id)).toBe(false)
})

test('POST /memory 422s without the required fields', async () => {
  await expect(
    api.writeMemory({ tenant_id: '', text: '' }),
  ).rejects.toMatchObject({ status: 422 })
})

/* --- sessions -------------------------------------------------------------- */

test('POST /session takes only a title and instructions', async () => {
  const created = await api.createSession({
    title: 'Onboarding · today',
    instructions: 'You are assisting with card-a-onboarding.',
  })
  expect(created.id).toMatch(/^sess_/)
  expect(created.memory_store_id).toBeTruthy()
  // Deliberately absent on the backend — provenance lives in memory metadata.
  expect(created).not.toHaveProperty('tenant_id')
  expect(created).not.toHaveProperty('user_id')

  const fetched = await api.getSession(created.id)
  expect(fetched.id).toBe(created.id)
})

test('GET /session/{id} 404s on an unknown id', async () => {
  await expect(api.getSession('sess_nope')).rejects.toMatchObject({ status: 404 })
})

test('POST /session/{id}/message answers and reports tool use', async () => {
  const session = await api.createSession({
    instructions: 'You are assisting with card-a-onboarding.',
  })
  const reply = await api.sendMessage(session.id, 'How do I get prod access?')

  expect(reply.session_id).toBe(session.id)
  expect(reply.text.length).toBeGreaterThan(0)
  expect(reply.stop_reason).toBe('end_turn')
  expect(reply.tool_uses.some((t) => t.touched_memory)).toBe(true)
})

test('a later turn reflects newer information than the first', async () => {
  const session = await api.createSession({
    instructions: 'You are assisting with card-a-onboarding.',
  })
  const first = await api.sendMessage(session.id, 'How do I get prod access?')
  const second = await api.sendMessage(session.id, 'How do I get prod access?')

  // The whole point of the demo: the answer sharpens.
  expect(first.text).not.toBe(second.text)
  expect(second.text).toMatch(/Prod Access Foundations|2026-05-15/)
})

test('sending to an unknown session 404s', async () => {
  await expect(api.sendMessage('sess_nope', 'hello')).rejects.toMatchObject({
    status: 404,
  })
})

/* --- curator --------------------------------------------------------------- */

test('POST /memory/curate returns a report', async () => {
  const report = await api.curate(TENANT)
  expect(report.summary).toBeTruthy()
  expect(Array.isArray(report.contradictions)).toBe(true)
})

/* --- errors ---------------------------------------------------------------- */

test('an unreachable API produces an explanation, not "Failed to fetch"', async () => {
  // Simulate the network failure rather than relying on nothing listening on
  // the port: once a real backend is running locally, "close the mock and see
  // what happens" reaches the actual service and the test silently inverts.
  server.use(
    http.get(`${API_BASE_URL}/healthz`, () => HttpResponse.error()),
  )

  await expect(api.health()).rejects.toSatisfy(
    (err: unknown) =>
      err instanceof ApiError && /Could not reach the API/.test(err.message),
    'an ApiError explaining the API could not be reached',
  )
})
