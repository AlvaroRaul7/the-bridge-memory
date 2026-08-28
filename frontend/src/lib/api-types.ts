/**
 * Mirrors `backend/app/schemas.py` 1:1.
 *
 * Hand-written only because there is no running service to generate from. Once
 * the backend is up, replace this whole file:
 *
 *   npx openapi-typescript http://localhost:8000/openapi.json -o src/lib/api-types.ts
 *
 * Until then this file is the contract. Change a shape here and change
 * backend/app/schemas.py with it, or the drift Spec 3 warns about starts here.
 */

/* --- sessions (Managed Agents) --------------------------------------------
 *
 * Note what is NOT here: sessions carry no tenant_id and no user_id. The
 * backend mounts one memory store from its own settings. So "which assistant"
 * and "whose session" are client-side concerns — see lib/session-store.ts.
 */

export interface SessionCreateRequest {
  /**
   * Whose memory this session reads. Required: the backend get-or-creates a
   * memory store per (customer, module) and tags it with this id.
   */
  customer_id: string
  /**
   * Which module to open the session against. Each module has its own agent,
   * so this decides who answers — and, with customer_id, which store mounts.
   */
  module?: string
  title?: string
  /** Per-session guidance injected into the agent's system prompt. */
  instructions?: string
}

export interface SessionUsage {
  input_tokens?: number | null
  output_tokens?: number | null
  active_seconds?: number | null
  /** Consumption at public list rates, in minor units. */
  list_cost?: string | null
  currency?: string | null
}

export interface SessionResponse {
  id: string
  status: string
  title?: string | null
  created_at?: string | null
  memory_store_id: string
  module?: string | null
  usage?: SessionUsage | null
}

/** GET /modules — which assistants exist, and which have an agent behind them. */
export interface ModuleInfo {
  id: string
  name: string
  domain: string
  /** False when the module has no agent yet; opening a session will fail. */
  provisioned: boolean
}

/* --- messages -------------------------------------------------------------- */

export interface MessageRequest {
  text: string
}

/** A tool call the agent made during the turn. */
export interface ToolUse {
  name: string
  target?: string | null
  /** True for calls against the mounted store — the "what did it remember" signal. */
  touched_memory: boolean
}

export type StopReason =
  | 'end_turn'
  | 'requires_action'
  | 'retries_exhausted'
  | 'budget_reached'
  | 'terminated'
  | 'timeout'

export interface MessageResponse {
  session_id: string
  text: string
  stop_reason: StopReason
  tool_uses: ToolUse[]
}

/* --- memory (ChromaDB long-term tier) --------------------------------------
 *
 * Distinct from the agent's own /mnt/memory/ mount. `tenant_id` is required on
 * every route and is the isolation boundary, enforced server-side.
 */

export interface MemoryWriteRequest {
  tenant_id: string
  text: string
  metadata?: MemoryMetadata
}

export interface MemoryWriteResponse {
  id: string
}

export interface MemoryRecord {
  id: string
  text: string
  metadata: MemoryMetadata
}

/** Chroma distance: LOWER is a closer match. Not a similarity score. */
export interface MemoryHit extends MemoryRecord {
  distance: number
}

export interface MemoryListResponse {
  source: 'chroma'
  tenant_id: string
  memories: MemoryRecord[]
}

export interface DeletedMemory {
  id: string
  deleted: boolean
}

/**
 * `metadata` is a free-form dict on the backend. This is the convention this
 * client writes and reads — keep it in one place so the inspector and the
 * writer cannot disagree about key names.
 */
export interface MemoryMetadata {
  kind?: MemoryKind
  source?: string
  /** Who saved it. The backend session has no user_id, so it lives here. */
  user_id?: string
  /** Which conversation it came from. */
  session_id?: string
  /** Which assistant. Also encoded in tenant_id; kept for display. */
  scenario_id?: string
  /** Written by this client. */
  created_at?: string
  /** Written by the BACKEND on every record — prefer it when present. */
  timestamp?: string
  /** Also stamped server-side; the client never sets it. */
  tenant_id?: string
  [key: string]: unknown
}

export type MemoryKind = 'fact' | 'policy' | 'contact' | 'decision' | 'note'

/* --- curator (Tier-1 stretch goal) ----------------------------------------- */

export interface CurateRequest {
  tenant_id: string
}

export interface Contradiction {
  ids: string[]
  reason: string
}

export interface CurationReport {
  merged: string[]
  pruned: string[]
  contradictions: Contradiction[]
  summary: string
}

/* --- misc ------------------------------------------------------------------ */

export interface Health {
  status: 'ok'
}

export interface ErrorResponse {
  detail: string
  error?: Record<string, unknown> | null
}

/**
 * When a memory was saved.
 *
 * The backend stamps `timestamp` on write; the mock and older records carry
 * `created_at`. Reading only one of them silently drops the date for half the
 * records, so read both.
 */
export function savedAt(metadata: MemoryMetadata): string | undefined {
  return metadata.timestamp ?? metadata.created_at
}

/** Chroma distance → a 0–1 closeness for display. Distance 0 = identical. */
export function closeness(distance: number): number {
  return 1 / (1 + Math.max(0, distance))
}

/**
 * The agent's own memory store — deliberately not the same shape as a Chroma
 * MemoryRecord. A Chroma memory is a chunk of text with an embedding; an agent
 * memory is a file with a path that the agent wrote itself with ordinary file
 * tools. Collapsing them would hide which store you are looking at.
 */
export interface AgentMemoryRecord {
  id: string
  path: string
  size_bytes?: number | null
  created_at?: string | null
  updated_at?: string | null
  /** Only populated when include_content=true. */
  content?: string | null
}

export interface AgentMemoryListResponse {
  source: 'agent'
  memory_store_id: string
  memories: AgentMemoryRecord[]
  /** Directory-like nodes returned when listing hierarchically. */
  prefixes: string[]
}
