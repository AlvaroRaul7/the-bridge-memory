import { Database, Loader2, Trash2 } from 'lucide-react'
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
import type { MemoryKind, MemoryRecord } from '@/lib/api-types'
import { cn } from '@/lib/utils'

/**
 * Spec 3: "a side panel listing memories for the current tenant/session
 * (GET /memory), with metadata (kind, source, timestamp) visible, and a manual
 * delete action per row for demo control."
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
  workspace,
  loading,
  deletingId,
  onDelete,
  onOpen,
}: {
  memories: MemoryRecord[]
  workspace: string
  loading: boolean
  deletingId?: string
  onDelete: (id: string) => void
  onOpen: () => void
}) {
  return (
    <Sheet onOpenChange={(open) => open && onOpen()}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <Database />
          Memory
          <Badge variant="muted" className="ml-1 py-0">
            {memories.length}
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
            {memories.length} thing{memories.length === 1 ? '' : 's'} remembered
            for {workspace}. Delete anything that should not be kept — it is
            removed for good and will not be used in future answers.
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

            {!loading && memories.length === 0 && (
              <p className="px-5 py-6 text-[13px] text-muted-foreground">
                Nothing remembered yet. Ask a question, then save the answer
                you want kept.
              </p>
            )}

            {memories.map((record) => (
              <article key={record.id} className="group px-5 py-4">
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
