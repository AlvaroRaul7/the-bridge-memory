/**
 * Remembers which conversation each user was in, per assistant.
 *
 * The backend's session carries no tenant_id and no user_id — it mounts one
 * memory store from its own settings — so "whose session, with which
 * assistant" is a client-side fact. Without this, a reload starts a brand new
 * conversation and the previous one becomes unreachable: its id existed only
 * in React state.
 *
 * Scoped by account id so two people sharing a browser profile do not inherit
 * each other's conversations.
 */

/**
 * Namespaced by API mode. Session ids minted by the msw mock are not valid
 * Managed Agents ids, so replaying one against the real backend gets a 422 —
 * keeping the two sets apart stops that happening at all.
 */
const KEY = `ib.sessions.v1.${import.meta.env.VITE_USE_MOCKS === 'true' ? 'mock' : 'live'}`

export interface StoredSession {
  sessionId: string
  userId: string
  scenarioId: string
  title: string
  createdAt: string
}

type Store = Record<string, StoredSession[]>

/** `${userId}:${scenarioId}` */
const slot = (userId: string, scenarioId: string) => `${userId}:${scenarioId}`

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Store) : {}
  } catch {
    // Private windows, cleared site data, or storage disabled entirely.
    return {}
  }
}

function write(store: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(store))
  } catch {
    // Losing persistence must never break the app — the session still works
    // for this page load, it just will not survive a reload.
  }
}

export function listSessions(userId: string, scenarioId: string): StoredSession[] {
  return read()[slot(userId, scenarioId)] ?? []
}

export function rememberSession(session: StoredSession) {
  const store = read()
  const key = slot(session.userId, session.scenarioId)
  const existing = store[key] ?? []
  store[key] = [
    session,
    ...existing.filter((s) => s.sessionId !== session.sessionId),
  ].slice(0, 20)
  write(store)
}

export function forgetSession(userId: string, scenarioId: string, sessionId: string) {
  const store = read()
  const key = slot(userId, scenarioId)
  store[key] = (store[key] ?? []).filter((s) => s.sessionId !== sessionId)
  write(store)
}

/** The one to reopen on load: most recently created. */
export function mostRecentSession(userId: string, scenarioId: string) {
  return listSessions(userId, scenarioId)[0]
}
