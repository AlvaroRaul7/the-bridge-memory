import { useCallback, useEffect, useState } from 'react'
import { CircleCheck, CircleSlash } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { api, ApiError } from '@/lib/api'
import { tenantId as makeTenantId } from '@/lib/auth'
import {
  forgetSession,
  listSessions,
  mostRecentSession,
  rememberSession,
  type StoredSession,
} from '@/lib/session-store'
import type { MemoryRecord } from '@/lib/api-types'
import type { Scenario } from '@/lib/types'
import { ChatView, type ChatTurn } from './chat-view'
import { MemoryInspector } from './memory-inspector'
import { SessionSwitcher } from './session-switcher'

/**
 * The three Spec 3 views, wired to the real Spec 2 endpoints.
 *
 * Sessions and memory are different systems in the backend: a session is a
 * Managed Agents conversation with one mounted store, while memory is the
 * tenant-scoped ChromaDB tier. Neither the session nor the memory record
 * carries a user id, so this component is where the two are tied together —
 * sessions are persisted per (account, assistant) in localStorage, and every
 * memory write stamps user_id and session_id into its metadata.
 */
export function ConsoleView({
  scenario,
  pendingQuestion,
  onPendingConsumed,
  accountId,
}: {
  scenario: Scenario
  pendingQuestion?: string
  onPendingConsumed?: () => void
  /** Signed-in account, or undefined when auth is off. Scopes tenant + sessions. */
  accountId?: string
}) {
  const userId = accountId ?? 'demo'
  const tenantId = makeTenantId(scenario.id, accountId)

  const [sessions, setSessions] = useState<StoredSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string>()
  const [creating, setCreating] = useState(false)

  const [memories, setMemories] = useState<MemoryRecord[]>([])
  const [memoriesLoading, setMemoriesLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string>()

  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [busy, setBusy] = useState(false)
  const [savingId, setSavingId] = useState<string>()
  const [health, setHealth] = useState<'ok' | 'down'>()

  const describe = (err: unknown) =>
    err instanceof ApiError
      ? err.status
        ? `${err.status} — ${err.message}`
        : err.message
      : err instanceof Error
        ? err.message
        : String(err)

  const loadMemories = useCallback(async () => {
    try {
      setMemories(await api.listMemory(tenantId))
    } catch {
      setMemories([])
    } finally {
      setMemoriesLoading(false)
    }
  }, [tenantId])

  const refreshMemories = useCallback(() => {
    setMemoriesLoading(true)
    void loadMemories()
  }, [loadMemories])

  useEffect(() => {
    api.health().then(() => setHealth('ok')).catch(() => setHealth('down'))
  }, [])

  // Mounted with key={account:scenario}, so a switch remounts and clears the
  // conversation. This effect only reads.
  useEffect(() => {
    void loadMemories()

    // Reopen whatever conversation this account last had with this assistant,
    // rather than silently starting a new one on every reload.
    const stored = listSessions(userId, scenario.id)
    setSessions(stored)
    const recent = mostRecentSession(userId, scenario.id)
    if (!recent) return

    // Confirm the backend still has it; sessions get terminated, and an id
    // left over from a different API mode will be rejected outright.
    api
      .getSession(recent.sessionId, userId, scenario.id)
      .then(() => setActiveSessionId(recent.sessionId))
      .catch(() => {
        // Drop it. Without this the same dead id is re-fetched on every load,
        // logging a 404/422 each time and never clearing itself.
        forgetSession(userId, scenario.id, recent.sessionId)
        setSessions((prev) => prev.filter((s) => s.sessionId !== recent.sessionId))
        setActiveSessionId(undefined)
      })
  }, [loadMemories, scenario.id, userId])

  /**
   * `resetTurns` matters: starting a conversation from the button should clear
   * the transcript, but the lazy creation inside send() must NOT — send() has
   * already put the user's message on screen, and wiping it here made the
   * message vanish the moment it was sent.
   */
  const createSession = useCallback(async (
    { resetTurns = true }: { resetTurns?: boolean } = {},
  ): Promise<string | undefined> => {
    setCreating(true)
    try {
      const title = `${scenario.shortName} · ${new Date().toLocaleDateString()}`
      const created = await api.createSession({
        // The two scoping axes the backend mounts a store from: who is asking,
        // and which assistant they are asking. Same customer, different
        // assistant, different memory — which is what makes the picker mean
        // something.
        customer_id: userId,
        module: scenario.id,
        title,
        // The backend has no scenario concept, so which assistant this is
        // travels as per-session guidance — which is also genuinely useful to
        // the agent.
        instructions:
          `You are assisting with ${scenario.domain}. ` +
          `Assistant profile: ${scenario.id}. ${scenario.systemPromptFocus}.`,
      })

      const stored: StoredSession = {
        sessionId: created.id,
        userId,
        scenarioId: scenario.id,
        title: created.title ?? title,
        createdAt: created.created_at ?? new Date().toISOString(),
      }
      rememberSession(stored)
      setSessions((prev) => [stored, ...prev.filter((s) => s.sessionId !== stored.sessionId)])
      setActiveSessionId(created.id)
      if (resetTurns) setTurns([])
      return created.id
    } catch (err) {
      setTurns((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: 'agent',
          text: '',
          error: explainSessionFailure(err),
        },
      ])
      return undefined
    } finally {
      setCreating(false)
    }
  }, [scenario, userId])

  const send = useCallback(
    async (message: string) => {
      setBusy(true)
      const agentId = `a_${Date.now()}`
      setTurns((prev) => [
        ...prev,
        { id: `u_${Date.now()}`, role: 'user', text: message },
        { id: agentId, role: 'agent', text: '', searching: true },
      ])

      try {
        // A conversation is created lazily on the first message, so opening the
        // tab does not burn a session.
        const sessionId = activeSessionId ?? (await createSession({ resetTurns: false }))
        if (!sessionId) throw new Error('No active conversation.')

        // Retrieval is shown before the answer — the Spec 3 differentiator.
        const hits = await api.searchMemory({ tenant_id: tenantId, q: message, k: 5 })
        setTurns((prev) =>
          prev.map((t) => (t.id === agentId ? { ...t, hits, searching: false } : t)),
        )

        const reply = await api.sendMessage(sessionId, message)
        setTurns((prev) =>
          prev.map((t) =>
            t.id === agentId
              ? {
                  ...t,
                  text: reply.text,
                  toolUses: reply.tool_uses,
                  stopReason: reply.stop_reason,
                }
              : t,
          ),
        )
        // The agent may have written to its own store during the turn.
        void loadMemories()
      } catch (err) {
        setTurns((prev) =>
          prev.map((t) =>
            t.id === agentId ? { ...t, searching: false, error: describe(err) } : t,
          ),
        )
      } finally {
        setBusy(false)
      }
    },
    [activeSessionId, createSession, loadMemories, tenantId],
  )

  const save = useCallback(
    async (turn: ChatTurn) => {
      setSavingId(turn.id)
      try {
        await api.writeMemory({
          tenant_id: tenantId,
          text: turn.text,
          metadata: {
            kind: 'note',
            source: 'saved from a conversation',
            // The backend session has no user_id, so provenance lives here.
            user_id: userId,
            session_id: activeSessionId,
            scenario_id: scenario.id,
            created_at: new Date().toISOString(),
          },
        })
        setTurns((prev) =>
          prev.map((t) => (t.id === turn.id ? { ...t, consolidated: true } : t)),
        )
        await loadMemories()
      } catch (err) {
        setTurns((prev) =>
          prev.map((t) =>
            t.id === turn.id ? { ...t, error: `Could not save: ${describe(err)}` } : t,
          ),
        )
      } finally {
        setSavingId(undefined)
      }
    },
    [activeSessionId, loadMemories, scenario.id, tenantId, userId],
  )

  const remove = useCallback(
    async (id: string) => {
      setDeletingId(id)
      try {
        // tenant_id is required on delete — the backend uses it to prove
        // ownership before removing anything.
        await api.deleteMemory(id, tenantId)
        setMemories((prev) => prev.filter((m) => m.id !== id))
      } finally {
        setDeletingId(undefined)
      }
    },
    [tenantId],
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <SessionSwitcher
          sessions={sessions}
          activeId={activeSessionId}
          onSelect={(id) => {
            setActiveSessionId(id)
            setTurns([])
          }}
          onCreate={() => void createSession()}
          creating={creating}
        />

        <div className="ml-auto flex items-center gap-2">
          <Badge variant="muted">{scenario.domain}</Badge>
          <HealthPill health={health} />
          <MemoryInspector
            memories={memories}
            workspace={scenario.domain}
            loading={memoriesLoading}
            deletingId={deletingId}
            onDelete={remove}
            onOpen={refreshMemories}
          />
        </div>
      </div>

      <ChatView
        scenario={scenario}
        pendingQuestion={pendingQuestion}
        onPendingConsumed={onPendingConsumed}
        turns={turns}
        busy={busy}
        onSend={send}
        onConsolidate={save}
        consolidatingId={savingId}
      />
    </div>
  )
}

/**
 * Turn a session-create failure into something actionable.
 *
 * The backend deliberately does not forward upstream error text, so a
 * misconfigured AGENT_ID surfaces only as "422 — The request was rejected
 * upstream as invalid", which tells the reader nothing. 422 on session
 * creation has one overwhelmingly likely cause: the Managed Agents resource
 * ids are missing or still placeholders. Say so, and say where to look.
 */
function explainSessionFailure(err: unknown): string {
  const status = err instanceof ApiError ? err.status : 0
  if (status === 404) {
    // The backend names the module and the command to fix it.
    return (
      err instanceof ApiError ? err.message : 'This assistant has no agent yet.'
    )
  }
  if (status === 422) {
    return (
      'Chat is not available yet: the backend has no valid Managed Agents ' +
      'agent to talk to. Provision one with `python backend/provision.py ' +
      '--all`. Saved memory and search work without it.'
    )
  }
  if (status === 401) {
    return 'The backend rejected the API key. Check VITE_API_KEY matches BACKEND_API_KEY.'
  }
  return `Could not start a conversation: ${
    err instanceof ApiError ? err.message : String(err)
  }`
}

function HealthPill({ health }: { health?: 'ok' | 'down' }) {
  if (!health) return null
  return health === 'ok' ? (
    <Badge variant="success">
      <CircleCheck className="size-2.5" />
      Connected
    </Badge>
  ) : (
    <Badge variant="destructive">
      <CircleSlash className="size-2.5" />
      Not connected
    </Badge>
  )
}
