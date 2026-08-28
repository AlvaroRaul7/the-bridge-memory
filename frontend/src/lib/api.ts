/**
 * Thin typed fetch wrapper over the Spec 2 FastAPI backend.
 *
 * Every route here is declared in `specs/02-backend-fastapi.md`. Nothing else
 * in the UI calls `fetch` directly.
 *
 * Config (see .env.example):
 *   VITE_API_BASE_URL          default http://localhost:8000
 *   VITE_API_KEY               sent as X-API-Key on every request
 *   VITE_USE_MOCKS             "true" starts the msw worker instead of the API
 *   VITE_CLERK_PUBLISHABLE_KEY when set, requests also carry the signed-in
 *                              user's Clerk session token as a Bearer header
 *
 * Switching from mocks to the real backend is the one-line change Spec 3 asks
 * for: set VITE_USE_MOCKS=false. No call sites change.
 */

import { getAuthToken } from './auth'
import type {
  AgentMemoryListResponse,
  CurationReport,
  DeletedMemory,
  Health,
  MemoryHit,
  MemoryListResponse,
  MemoryRecord,
  MemoryWriteRequest,
  MemoryWriteResponse,
  MessageResponse,
  ModuleInfo,
  SessionCreateRequest,
  SessionResponse,
} from './api-types'

/** A memory read/write should be quick. */
const DEFAULT_TIMEOUT_MS = 15_000

/**
 * An agent turn runs the whole tool loop server-side. The backend defaults to
 * AGENT_TIMEOUT_SECONDS=300, so the client must not give up first.
 */
const AGENT_TURN_TIMEOUT_MS = 310_000

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

/** Spec 2 maps engine errors to real status codes; surface them as-is. */
export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request<T>(
  path: string,
  init?: RequestInit,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const apiKey = import.meta.env.VITE_API_KEY
  // Null whenever Clerk is off or the visitor is signed out.
  const token = await getAuthToken()

  // Without this a dead backend hangs the UI indefinitely rather than showing
  // an error. Chained to any caller-supplied signal so aborts still work.
  const timeout = AbortSignal.timeout(timeoutMs)
  const signal = init?.signal
    ? AbortSignal.any([init.signal, timeout])
    : timeout

  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    signal,
    headers: {
      'content-type': 'application/json',
      // Spec 2: single dev API key for the workshop. Kept so the backend keeps
      // working before it understands Clerk tokens.
      ...(apiKey ? { 'X-API-Key': apiKey } : {}),
      // The upgrade path Spec 2 flags: the backend verifies this and derives
      // the tenant from the caller instead of trusting a query parameter.
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
    })
  } catch (err) {
    // fetch() rejects for network-level failures — backend down, CORS refused,
    // DNS. "Failed to fetch" alone tells a user nothing, so say what it means.
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new ApiError(0, `The request to ${API_BASE_URL} timed out.`)
    }
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ApiError(
      0,
      `Could not reach the API at ${API_BASE_URL}. Is the backend running, ` +
        `or should VITE_USE_MOCKS be "true"?`,
    )
  }

  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = (await res.json()) as { detail?: string }
      if (body.detail) detail = body.detail
    } catch {
      // Non-JSON error body — statusText is the best we have.
    }
    throw new ApiError(res.status, detail)
  }

  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

const qs = (params: Record<string, string | number | boolean | undefined>) => {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value))
  }
  const s = search.toString()
  return s ? `?${s}` : ''
}

export const api = {
  /** GET /healthz — no auth, no upstream call. */
  health: () => request<Health>('/healthz'),

  /** GET /modules */
  listModules: () => request<ModuleInfo[]>('/modules'),

  /* --- sessions ----------------------------------------------------------
   * The backend mounts one memory store from its own settings, so a session
   * carries no tenant or user. Both are tracked client-side.
   */

  /** POST /session */
  createSession: (body: SessionCreateRequest) =>
    request<SessionResponse>('/session', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  /**
   * GET /session/{id}
   *
   * customer_id and module are not decoration: the backend re-derives the
   * mounted memory store from them, so they have to match what POST /session
   * was given or a different store comes back.
   */
  getSession: (id: string, customerId: string, module?: string) =>
    request<SessionResponse>(
      `/session/${encodeURIComponent(id)}${qs({ customer_id: customerId, module })}`,
    ),

  /**
   * POST /session/{id}/message
   *
   * Blocks for the whole agent turn — the backend's own docstring says tens of
   * seconds is normal — so this call gets its own, much longer timeout.
   */
  sendMessage: (sessionId: string, text: string, signal?: AbortSignal) =>
    request<MessageResponse>(
      `/session/${encodeURIComponent(sessionId)}/message`,
      { method: 'POST', body: JSON.stringify({ text }), signal },
      AGENT_TURN_TIMEOUT_MS,
    ),

  /* --- memory (tenant-scoped) -------------------------------------------- */

  /** POST /memory */
  writeMemory: (body: MemoryWriteRequest) =>
    request<MemoryWriteResponse>('/memory', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  /** GET /memory/search?tenant_id=&q=&k= */
  searchMemory: (params: { tenant_id: string; q: string; k?: number }) =>
    request<MemoryHit[]>(
      `/memory/search${qs({ tenant_id: params.tenant_id, q: params.q, k: params.k ?? 5 })}`,
    ),

  /**
   * GET /memory?source=chroma&tenant_id= — unwrapped to the array callers want.
   *
   * `source` is passed explicitly rather than relying on the default, which is
   * `agent` and returns a different shape (AgentMemoryRecord: a file with a
   * path, not a chunk with an embedding).
   */
  listMemory: async (tenantId: string): Promise<MemoryRecord[]> => {
    const res = await request<MemoryListResponse>(
      `/memory${qs({ source: 'chroma', tenant_id: tenantId })}`,
    )
    return res.memories
  },

  /**
   * GET /memory?source=agent&customer_id= — what the agent itself chose to
   * write to its mounted store during a session, as files with paths.
   */
  listAgentMemory: (
    customerId: string,
    opts: { module?: string; includeContent?: boolean } = {},
  ) =>
    request<AgentMemoryListResponse>(
      `/memory${qs({
        source: 'agent',
        customer_id: customerId,
        // Must match the module the session was opened with. The store is
        // scoped to (customer, module); omitting this reads a different,
        // customer-wide store that no session ever wrote to.
        module: opts.module,
        include_content: opts.includeContent ? 'true' : undefined,
      })}`,
    ),

  /**
   * DELETE /memory/{id}?source=agent — removes one file the agent wrote.
   *
   * `module` must match the session's, for the same reason listAgentMemory
   * needs it: it selects the store.
   */
  deleteAgentMemory: (id: string, customerId: string, module?: string) =>
    request<DeletedMemory>(
      `/memory/${encodeURIComponent(id)}${qs({
        source: 'agent',
        customer_id: customerId,
        module,
      })}`,
      { method: 'DELETE' },
    ),

  /**
   * DELETE /memory/{id}?source=chroma&tenant_id=
   *
   * `source` has no default server-side, deliberately: the two stores hold
   * different things and a wrong guess destroys data.
   */
  deleteMemory: (id: string, tenantId: string) =>
    request<DeletedMemory>(
      `/memory/${encodeURIComponent(id)}${qs({ source: 'chroma', tenant_id: tenantId })}`,
      { method: 'DELETE' },
    ),

  /** POST /memory/curate — Tier-1 stretch goal. */
  curate: (tenantId: string) =>
    request<CurationReport>('/memory/curate', {
      method: 'POST',
      body: JSON.stringify({ tenant_id: tenantId }),
    }),
}
