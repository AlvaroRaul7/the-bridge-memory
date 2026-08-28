import { Brain, Database, FileText, Loader2, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { savedAt } from '@/lib/api-types'
import type { AgentMemoryRecord, MemoryKind, MemoryRecord } from '@/lib/api-types'
import { cn } from '@/lib/utils'

/**
 * Spec 3: "a side panel listing memories for the current tenant/session
 * (GET /memory), with metadata (kind, source, timestamp) visible, and a manual
 * delete action per row for demo control."
 *
 * Two tiers, shown separately because they are genuinely different systems:
 *
 *  - What the agent learned — files it wrote itself to its mounted store
 *    during a session. This is what it answers from.
 *  - What you saved — the Chroma tier, written only when someone clicks
 *    "Save to memory".
 *
 * They are never both populated by the same action, so collapsing them into
 * one list would make an empty half look like a failure of the other.
 */

/** `kind` lives in the free-form metadata dict, and may be absent. */
function kindOf(record: MemoryRecord): MemoryKind {
  const kind = record.metadata.kind
  return kind && kind in kindVariant ? kind : 'fact'
}

/** Turn a provenance string ("policies/prod-access.md") into a readable label. */
function readableSource(source: string) {
  const name = source.split('/').pop()?.replace(/\.md$/, '') ?? source
  return name.replace(/[-_]/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}

const kindVariant: Record<MemoryKind, 'default' | 'success' | 'warning' | 'muted' | 'secondary'> = {
  policy: 'warning',
  contact: 'success',
  decision: 'default',
  fact: 'secondary',
  note: 'muted',
}

export function MemoryInspector({
  memories,
  agentMemories,
  workspace,
  loading,
  deletingId,
  onDelete,
  onDeleteAgentMemory,
  onOpen,
}: {
  memories: MemoryRecord[]
  agentMemories: AgentMemoryRecord[]
  workspace: string
  loading: boolean
  deletingId?: string
  onDelete: (id: string) => void
  onDeleteAgentMemory: (id: string) => void
  onOpen: () => void
}) {
  const total = memories.length + agentMemories.length
  return (
    <Sheet onOpenChange={(open) => open && onOpen()}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <Database />
          Memory
          <Badge variant="muted" className="ml-1 py-0">
            {total}
          </Badge>
        </Button>
      </SheetTrigger>

      <SheetContent className="p-0">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Database className="size-3.5" />
            Memory inspector
          </SheetTitle>
          <SheetDescription>
            {total} thing{total === 1 ? '' : 's'} remembered for {workspace}.
            Delete anything that should not be kept — it is removed for good
            and will not be used in future answers.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="flex flex-col divide-y divide-border">
            {loading && (
              <p className="flex items-center gap-2 px-5 py-6 text-[13px] text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                Loading memories…
              </p>
            )}

            {!loading && total === 0 && (
              <p className="px-5 py-6 text-[13px] text-muted-foreground">
                Nothing remembered yet. Ask a question, then save the answer
                you want kept.
              </p>
            )}

            {!loading && agentMemories.length > 0 && (
              <SectionHeading
                icon={<Brain className="size-3.5" />}
                title="What the agent learned"
                caption="Written by the agent itself during a session — this is what it answers from."
              />
            )}

            {agentMemories.map((record) => (
              <article key={record.id} data-tier="agent" className="group px-5 py-4">
                <div className="mb-2 flex items-center gap-2">
                  <Badge variant="default">
                    <FileText className="size-2.5" />
                    {record.path}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ml-auto size-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                    onClick={() => onDeleteAgentMemory(record.id)}
                    disabled={deletingId === record.id}
                    aria-label={`Delete memory ${record.path}`}
                  >
                    {deletingId === record.id ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Trash2 className="text-destructive" />
                    )}
                  </Button>
                </div>

                {record.content ? (
                  <pre className="max-h-40 overflow-y-auto font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap text-foreground/80">
                    {record.content}
                  </pre>
                ) : (
                  <p className="text-[11.5px] text-muted-foreground">
                    {record.size_bytes ?? 0} bytes
                  </p>
                )}

                {record.updated_at && (
                  <div className="mt-2 text-[10.5px] text-muted-foreground">
                    <time dateTime={record.updated_at}>
                      Updated {new Date(record.updated_at).toLocaleString()}
                    </time>
                  </div>
                )}
              </article>
            ))}

            {!loading && memories.length > 0 && (
              <SectionHeading
                icon={<Database className="size-3.5" />}
                title="What you saved"
                caption="Answers kept explicitly with “Save to memory”, searched before each turn."
              />
            )}

            {memories.map((record) => (
              <article key={record.id} data-tier="saved" className="group px-5 py-4">
                <div className="mb-2 flex items-center gap-2">
                  <Badge variant={kindVariant[kindOf(record)] ?? 'muted'}>
                    {kindOf(record)}
                  </Badge>
                  <span className="truncate text-[11.5px] text-muted-foreground">
                    {readableSource(record.metadata.source ?? 'saved note')}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ml-auto size-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                    onClick={() => onDelete(record.id)}
                    disabled={deletingId === record.id}
                    aria-label={`Delete memory ${record.id}`}
                  >
                    {deletingId === record.id ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Trash2 className="text-destructive" />
                    )}
                  </Button>
                </div>

                <pre
                  className={cn(
                    'max-h-40 overflow-y-auto font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap text-foreground/80',
                  )}
                >
                  {record.text}
                </pre>

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-muted-foreground">
                  {savedAt(record.metadata) && (
                    <time dateTime={savedAt(record.metadata)}>
                      Saved {new Date(savedAt(record.metadata)!).toLocaleString()}
                    </time>
                  )}
                  {/* Provenance the backend session cannot carry — see
                      MemoryMetadata in api-types.ts. */}
                  {record.metadata.session_id && (
                    <span title={`Conversation ${record.metadata.session_id}`}>
                      from a saved conversation
                    </span>
                  )}
                </div>
              </article>
            ))}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}

function SectionHeading({
  icon,
  title,
  caption,
}: {
  icon: React.ReactNode
  title: string
  caption: string
}) {
  return (
    <div className="bg-muted/40 px-5 py-2.5">
      <h3 className="flex items-center gap-2 text-[12px] font-medium text-foreground">
        {icon}
        {title}
      </h3>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{caption}</p>
    </div>
  )
}
