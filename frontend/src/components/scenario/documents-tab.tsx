import { useState } from 'react'
import { FileText } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import type { DocFile } from '@/lib/types'
import { Markdown } from './markdown'

// Mounted with key={scenario.id}, so switching scenario remounts this and the
// selected document resets on its own — no effect needed.
export function DocumentsTab({ docs }: { docs: DocFile[] }) {
  const [selected, setSelected] = useState(docs[0]?.name)
  const doc = docs.find((d) => d.name === selected) ?? docs[0]

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <div className="flex flex-col gap-4">
        {([1, 2] as const).map((round) => (
          <div key={round}>
            <div className="mb-2 flex items-center gap-2 px-1">
              <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                {round === 1 ? 'Original' : 'Updated'}
              </span>
              <Badge variant={round === 1 ? 'muted' : 'success'}>
                {round === 1 ? 'superseded in part' : 'current'}
              </Badge>
            </div>
            <div className="flex flex-col gap-0.5">
              {docs
                .filter((d) => d.round === round)
                .map((d) => (
                  <button
                    key={d.name}
                    type="button"
                    onClick={() => setSelected(d.name)}
                    className={cn(
                      'flex items-start gap-2 rounded-md px-2.5 py-2 text-left font-mono text-[11.5px] leading-snug transition-colors',
                      d.name === doc?.name
                        ? 'bg-accent text-foreground'
                        : 'text-muted-foreground hover:bg-accent/50',
                    )}
                  >
                    <FileText className="mt-px size-3 shrink-0" />
                    <span className="break-all">{d.name}</span>
                  </button>
                ))}
            </div>
          </div>
        ))}
      </div>

      <div className="min-w-0 rounded-xl border border-border bg-card">
        {doc ? (
          <>
            <div className="flex items-center gap-2 border-b border-border px-5 py-3">
              <FileText className="size-3.5 text-muted-foreground" />
              <span className="font-mono text-[12px]">{doc.name}</span>
              <Badge
                variant={doc.round === 1 ? 'muted' : 'success'}
                className="ml-auto"
              >
                {doc.round === 1 ? 'original' : 'current'}
              </Badge>
            </div>
            <ScrollArea className="h-[calc(100vh-19rem)]">
              <div className="px-6 py-5">
                <Markdown>{doc.content}</Markdown>
              </div>
            </ScrollArea>
          </>
        ) : (
          <p className="p-6 text-[13px] text-muted-foreground">
            No documents found for this scenario.
          </p>
        )}
      </div>
    </div>
  )
}
