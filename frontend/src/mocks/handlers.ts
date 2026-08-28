/**
 * msw handlers implementing `backend/app/routers/*` — the real Spec 2 surface.
 *
 * A stand-in for the FastAPI service, not a second implementation of it. With
 * the backend running, set VITE_USE_MOCKS=false and none of this loads.
 *
 * Two honest limitations:
 *  - "Semantic" search here is keyword overlap. The real engine is ChromaDB
 *    with embeddings, so ranking will differ.
 *  - The agent's reply is scripted per scenario rather than generated.
 */

import { HttpResponse, http } from 'msw'
import type {
  AgentMemoryListResponse,
  CurationReport,
  DeletedMemory,
  MemoryHit,
  MemoryListResponse,
  MemoryRecord,
  MemoryWriteRequest,
  MemoryWriteResponse,
  MessageResponse,
  SessionCreateRequest,
  SessionResponse,
} from '@/lib/api-types'
import { API_BASE_URL } from '@/lib/api'
import { scenarioAnswers } from '@/data/scenario-answers'
import { scenarios } from '@/lib/scenarios'
import { nextId, seedMemoriesFor } from './seed'

const memories: MemoryRecord[] = []
/** id → owning tenant. Chroma stores tenancy with the record; the mock mirrors it. */
const tenantOf = new Map<string, string>()
const sessions = new Map<string, SessionResponse>()
/** Which assistant a session is talking to — client-side in the real thing too. */
const sessionScenario = new Map<string, string>()
/** How many turns a session has taken, so the second one can differ. */
const sessionTurns = new Map<string, number>()

/**
 * The backend's get-or-create registry, in miniature: one memory store per
 * (customer, module), stable across calls. Same customer on a different
 * assistant gets a different store — that separation is the thing worth
 * mocking, and a fixed 'memstore_mock' hid it.
 */
const customerStores = new Map<string, string>()
function storeFor(customerId: string, module?: string | null): string {
  const key = module ? `${module}:${customerId}` : customerId
  const existing = customerStores.get(key)
  if (existing) return existing
  const id = `memstore_${Math.random().toString(36).slice(2, 10)}`
  customerStores.set(key, id)
  return id
}

const seeded = new Set<string>()
function ensureSeeded(tenant: string) {
  if (seeded.has(tenant)) return
  seeded.add(tenant)
  for (const record of seedMemoriesFor(tenant)) {
    // Every record gets its owning tenant recorded, seeded ones included.
    // Matching on metadata.scenario_id instead leaks memory between two
    // accounts using the same assistant — the exact isolation property the
    // whole tenant_id scheme exists to guarantee.
    tenantOf.set(record.id, tenant)
    memories.push(record)
  }
}

const url = (path: string) => `${API_BASE_URL}${path}`

/** Mirrors deps.require_api_key so the UI's 401 path is exercised too. */
function unauthorized(request: Request) {
  const expected = import.meta.env.VITE_API_KEY
  if (!expected) return null
  return request.headers.get('X-API-Key') === expected
    ? null
    : HttpResponse.json({ detail: 'Missing or invalid X-API-Key.' }, { status: 401 })
}

const STOP = new Set(['the', 'and', 'for', 'with', 'what', 'how', 'who', 'need', 'that', 'this'])
const terms = (text: string) =>
  (text.toLowerCase().match(/[a-z0-9-]{3,}/g) ?? []).filter((t) => !STOP.has(t))

export const handlers = [
  http.get(url('/healthz'), () => HttpResponse.json({ status: 'ok' })),

  /* --- sessions ----------------------------------------------------------- */

  http.post(url('/session'), async ({ request }) => {
    const denied = unauthorized(request)
    if (denied) return denied

    const body = ((await request.json()) ?? {}) as SessionCreateRequest
    if (!body.customer_id) {
      return HttpResponse.json(
        { detail: 'customer_id is required.' },
        { status: 422 },
      )
    }

    const id = `sess_${Math.random().toString(36).slice(2, 10)}`
    const session: SessionResponse = {
      id,
      status: 'idle',
      title: body.title ?? null,
      created_at: new Date().toISOString(),
      // The backend get-or-creates one store per (customer, module). Mirror
      // that here, or the mock hides the isolation the real API provides.
      memory_store_id: storeFor(body.customer_id, body.module),
      module: body.module ?? null,
      usage: { input_tokens: 0, output_tokens: 0 },
    }
    sessions.set(id, session)

    // The real backend has no scenario concept; the client encodes which
    // assistant this session is for in its per-session instructions.
    const hint = `${body.instructions ?? ''} ${body.title ?? ''}`
    const scenario = scenarios.find((s) => hint.includes(s.id))
    if (scenario) sessionScenario.set(id, scenario.id)

    return HttpResponse.json(session, { status: 201 })
  }),

  http.get(url('/session/:id'), ({ request, params }) => {
    const denied = unauthorized(request)
    if (denied) return denied

    if (!new URL(request.url).searchParams.get('customer_id')) {
      return HttpResponse.json(
        { detail: 'customer_id is required.' },
        { status: 422 },
      )
    }

    const session = sessions.get(String(params.id))
    if (!session) {
      return HttpResponse.json({ detail: 'Not found.' }, { status: 404 })
    }
    return HttpResponse.json(session)
  }),

  http.post(url('/session/:id/message'), async ({ request, params }) => {
    const denied = unauthorized(request)
    if (denied) return denied

    const id = String(params.id)
    const session = sessions.get(id)
    if (!session) {
      return HttpResponse.json({ detail: 'Not found.' }, { status: 404 })
    }

    const body = (await request.json()) as { text?: string }
    if (!body?.text) {
      return HttpResponse.json({ detail: 'text is required' }, { status: 422 })
    }

    const scenarioId = sessionScenario.get(id) ?? scenarios[0].id
    // Turn 1 gets the baseline answer; later turns get the reconciled one, so
    // the "same question, sharper answer" comparison is reachable in the UI.
    const turn = (sessionTurns.get(id) ?? 0) + 1
    sessionTurns.set(id, turn)
    const script = scenarioAnswers[`${scenarioId}:${turn > 1 ? 2 : 1}`]

    const response: MessageResponse = {
      session_id: id,
      text: script?.answer ?? 'No scripted answer for this assistant.',
      stop_reason: 'end_turn',
      tool_uses: (script?.events ?? [])
        .filter((e) => e.kind === 'tool_use')
        .map((e) => ({
          name: e.name,
          target: e.target,
          touched_memory: e.isMemory,
        })),
    }
    return HttpResponse.json(response)
  }),

  /* --- memory ------------------------------------------------------------- */

  http.post(url('/memory'), async ({ request }) => {
    const denied = unauthorized(request)
    if (denied) return denied

    const body = (await request.json()) as MemoryWriteRequest
    if (!body?.tenant_id || !body?.text) {
      return HttpResponse.json(
        { detail: 'tenant_id and text are required' },
        { status: 422 },
      )
    }
    ensureSeeded(body.tenant_id)

    const record: MemoryRecord = {
      id: nextId(),
      text: body.text,
      metadata: { created_at: new Date().toISOString(), ...body.metadata },
    }
    // Tenancy lives outside the record in Chroma; the mock keeps a parallel map.
    tenantOf.set(record.id, body.tenant_id)
    memories.unshift(record)

    return HttpResponse.json({ id: record.id } satisfies MemoryWriteResponse, {
      status: 201,
    })
  }),

  // Registered before GET /memory so the list route does not shadow it.
  http.get(url('/memory/search'), ({ request }) => {
    const denied = unauthorized(request)
    if (denied) return denied

    const params = new URL(request.url).searchParams
    const tenantId = params.get('tenant_id')
    const q = params.get('q')
    const k = Number(params.get('k') ?? 5)

    if (!tenantId || !q) {
      return HttpResponse.json(
        { detail: 'tenant_id and q are required' },
        { status: 422 },
      )
    }
    ensureSeeded(tenantId)

    const wanted = terms(q)
    const hits: MemoryHit[] = forTenant(tenantId)
      .map((record) => {
        const haystack = terms(record.text + ' ' + (record.metadata.source ?? ''))
        const overlap = wanted.filter((t) => haystack.includes(t)).length
        const ratio = wanted.length ? overlap / wanted.length : 0
        // Chroma reports DISTANCE, where lower is closer. Invert the ratio so
        // the mock behaves the same way round as the real engine.
        return { ...record, distance: Number((1 - ratio).toFixed(4)) }
      })
      .filter((h) => h.distance < 1)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, k)

    return HttpResponse.json(hits)
  }),

  http.get(url('/memory'), ({ request }) => {
    const denied = unauthorized(request)
    if (denied) return denied

    const params = new URL(request.url).searchParams
    // Defaults to `agent`, same as the backend — a caller that forgets
    // `source` must get the agent shape here too, not a silent Chroma list.
    const source = params.get('source') ?? 'agent'

    if (source === 'agent') {
      const customerId = params.get('customer_id')
      if (!customerId) {
        return HttpResponse.json(
          { detail: 'customer_id is required when source=agent.' },
          { status: 422 },
        )
      }
      // Nothing writes to the agent's own store in mock mode: only a real
      // agent turn does, with file tools against its mount.
      return HttpResponse.json({
        source: 'agent',
        memory_store_id: storeFor(customerId, params.get('module')),
        memories: [],
        prefixes: [],
      } satisfies AgentMemoryListResponse)
    }

    const tenantId = params.get('tenant_id')
    if (!tenantId) {
      return HttpResponse.json(
        { detail: 'tenant_id is required when source=chroma.' },
        { status: 422 },
      )
    }
    ensureSeeded(tenantId)

    return HttpResponse.json({
      source: 'chroma',
      tenant_id: tenantId,
      memories: forTenant(tenantId),
    } satisfies MemoryListResponse)
  }),

  http.delete(url('/memory/:id'), ({ request, params }) => {
    const denied = unauthorized(request)
    if (denied) return denied

    const query = new URL(request.url).searchParams
    // Required with no default server-side: the two stores hold different
    // things and a wrong guess destroys data.
    const source = query.get('source')
    if (source !== 'chroma' && source !== 'agent') {
      return HttpResponse.json(
        { detail: 'source is required and must be "agent" or "chroma".' },
        { status: 422 },
      )
    }
    const tenantId = query.get('tenant_id')
    if (source === 'chroma' && !tenantId) {
      return HttpResponse.json(
        { detail: 'tenant_id is required when source=chroma.' },
        { status: 422 },
      )
    }

    const id = String(params.id)
    // The real router looks the record up within the tenant first, so ids from
    // another tenant 404 rather than deleting. Same here.
    const index = memories.findIndex((m) => m.id === id && tenantOf.get(m.id) === tenantId)
    if (index === -1) {
      return HttpResponse.json({ detail: 'Not found.' }, { status: 404 })
    }
    memories.splice(index, 1)
    tenantOf.delete(id)

    return HttpResponse.json({ id, deleted: true } satisfies DeletedMemory)
  }),

  http.post(url('/memory/curate'), async ({ request }) => {
    const denied = unauthorized(request)
    if (denied) return denied

    const body = (await request.json()) as { tenant_id?: string }
    if (!body?.tenant_id) {
      return HttpResponse.json({ detail: 'tenant_id is required' }, { status: 422 })
    }
    return HttpResponse.json({
      merged: [],
      pruned: [],
      contradictions: [],
      summary: 'Mock curator: nothing to do.',
    } satisfies CurationReport)
  }),
]


function forTenant(tenantId: string): MemoryRecord[] {
  // Tenancy is authoritative and never inferred. memory_engine enforces the
  // same boundary server-side.
  return memories.filter((m) => tenantOf.get(m.id) === tenantId)
}
