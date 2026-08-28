import { useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  ArrowUp,
  BookmarkPlus,
  Loader2,
  Search,
  Sparkles,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { Markdown } from '@/components/scenario/markdown'
import { cn } from '@/lib/utils'
import type { MemoryHit, StopReason, ToolUse } from '@/lib/api-types'
import { closeness } from '@/lib/api-types'
import type { Scenario } from '@/lib/types'

/**
 * Spec 3: "send a message, show the agent's (or a stubbed) response, show which
 * memories were retrieved and used for that turn (surfacing GET /memory/search
 * results inline, not just the final answer — this is the actual product
 * differentiator)."
 *
 * Note on the agent response: Spec 2 exposes memory and session CRUD only —
 * there is no chat endpoint in it, because per Spec 4 the agent calls the
 * backend as tools rather than the UI proxying a conversation. So the reply
 * here is the stub Spec 3 explicitly allows. What is NOT stubbed is retrieval:
 * every turn issues a real GET /memory/search and renders the hits it got back.
 */

export interface ChatTurn {
  id: string
  role: 'user' | 'agent'
  text: string
  /** Memories retrieved for this turn — the point of the view. */
  hits?: MemoryHit[]
  searching?: boolean
  error?: string
  /** True once this turn's answer has been written to long-term memory. */
  consolidated?: boolean
  /** Tool calls the agent made during the turn. */
  toolUses?: ToolUse[]
  stopReason?: StopReason
}

/**
 * Sized so the page itself never scrolls — only the transcript inside does.
 * The offset covers the app header, page padding, title block and tab strip.
 */
const CHAT_PANE =
  'flex h-[calc(100vh-15.5rem)] min-h-[24rem] flex-col rounded-xl border border-border bg-card'

export function ChatView({
  scenario,
  turns,
  busy,
  onSend,
  onConsolidate,
  consolidatingId,
  pendingQuestion,
  onPendingConsumed,
}: {
  scenario: Scenario
  turns: ChatTurn[]
  busy: boolean
  onSend: (message: string) => void
  onConsolidate: (turn: ChatTurn) => void
  consolidatingId?: string
  pendingQuestion?: string
  onPendingConsumed?: () => void
}) {
  const [draft, setDraft] = useState('')
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' })
  }, [turns])

  // A question clicked on the Guide arrives here; drop it in the box so the
  // user can edit it before sending rather than firing it off behind them.
  useEffect(() => {
    if (!pendingQuestion) return
    setDraft(pendingQuestion)
    onPendingConsumed?.()
  }, [pendingQuestion, onPendingConsumed])

  const submit = () => {
    const message = draft.trim()
    if (!message || busy) return
    setDraft('')
    onSend(message)
  }

  return (
    <div className={CHAT_PANE}>
      <ScrollArea className="flex-1">
        <div className="mx-auto flex max-w-3xl flex-col gap-5 px-6 py-6">
          {turns.length === 0 && (
            <div className="rounded-lg border border-dashed border-border px-5 py-7">
              <Sparkles className="mx-auto mb-2 size-5 text-muted-foreground" />
              <p className="mb-1 text-center text-[13px] font-medium">
                {scenario.headline}
              </p>
              <p className="mb-4 text-center text-[12.5px] text-muted-foreground">
                Ask anything, or start with one of these.
              </p>
              <div className="mx-auto flex max-w-xl flex-col gap-1.5">
                {scenario.sampleQuestions.slice(0, 3).map((question) => (
                  <button
                    key={question}
                    type="button"
                    onClick={() => setDraft(question)}
                    className="rounded-lg border border-border px-3.5 py-2 text-left text-[12.5px] leading-snug text-foreground/85 transition-colors hover:bg-accent/60"
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>
          )}

          {turns.map((turn) =>
            turn.role === 'user' ? (
              <div key={turn.id} className="flex justify-end">
                <p className="max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-[13px] leading-relaxed text-primary-foreground">
                  {turn.text}
                </p>
              </div>
            ) : (
              <div key={turn.id} className="flex flex-col gap-2.5">
                <RetrievedMemories turn={turn} />
                <div className="rounded-2xl rounded-bl-sm bg-muted/50 px-4 py-3">
                  {turn.text ? (
                    <Markdown>{turn.text}</Markdown>
                  ) : (
                    <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin" />
                      Thinking…
                    </p>
                  )}
                </div>
                {turn.text && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onConsolidate(turn)}
                      disabled={turn.consolidated || consolidatingId === turn.id}
                    >
                      {consolidatingId === turn.id ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <BookmarkPlus />
                      )}
                      {turn.consolidated ? 'Saved to memory' : 'Save to memory'}
                    </Button>
                    <span className="text-[11px] text-muted-foreground">
                      Saved answers are used in future conversations.
                    </span>
                  </div>
                )}
              </div>
            ),
          )}
          <div ref={bottom} />
        </div>
      </ScrollArea>

      <div className="border-t border-border p-3">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            placeholder="Ask a question…  (Enter to send, Shift+Enter for a new line)"
            rows={2}
          />
          <Button size="icon" onClick={submit} disabled={busy || !draft.trim()}>
            {busy ? <Loader2 className="animate-spin" /> : <ArrowUp />}
          </Button>
        </div>
      </div>
    </div>
  )
}

/** Turn a provenance string ("policies/prod-access.md") into a readable label. */
function readableSource(source: string) {
  const name = source.split('/').pop()?.replace(/\.md$/, '') ?? source
  return name.replace(/[-_]/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}

/** The inline retrieval trace — GET /memory/search results for this turn. */
function RetrievedMemories({ turn }: { turn: ChatTurn }) {
  if (turn.error) {
    return (
      <div className="flex items-start gap-2 rounded-lg bg-destructive/8 px-3 py-2 text-[12px] text-destructive">
        <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
        <span>{turn.error}</span>
      </div>
    )
  }

  if (turn.searching) {
    return (
      <p className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
        <Loader2 className="size-3 animate-spin" />
        Checking what I remember…
      </p>
    )
  }

  if (!turn.hits) return null

  if (turn.hits.length === 0) {
    return (
      <p className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
        <Search className="size-3" />
        Nothing saved matched this question — answering from the source documents.
      </p>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2.5">
      <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
        <Search className="size-3" />
        Answered using {turn.hits.length} saved note{turn.hits.length === 1 ? '' : 's'}
      </p>
      <ul className="flex flex-col gap-1.5">
        {turn.hits.map((hit) => (
          <li key={hit.id} className="flex items-baseline gap-2">
            {/* Chroma returns a DISTANCE (lower is closer), not a similarity —
                convert once, in api-types, so this never gets read backwards. */}
            <Badge variant="muted" className="shrink-0 tabular-nums">
              {(closeness(hit.distance) * 100).toFixed(0)}%
            </Badge>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[11.5px] font-medium text-foreground/80">
                {readableSource(hit.metadata.source ?? 'saved note')}
              </span>
              <span
                className={cn(
                  'block truncate text-[11.5px] text-muted-foreground',
                )}
              >
                {hit.text.split('\n').find((line: string) => line.trim()) ?? ''}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
