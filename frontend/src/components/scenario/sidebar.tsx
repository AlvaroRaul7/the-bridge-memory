import { Layers } from 'lucide-react'
import { accents } from '@/lib/accents'
import { cn } from '@/lib/utils'
import type { Scenario } from '@/lib/types'

export function Sidebar({
  scenarios,
  selectedId,
  onSelect,
}: {
  scenarios: Scenario[]
  selectedId: string
  onSelect: (id: string) => void
}) {
  return (
    <nav className="flex w-72 shrink-0 flex-col border-r border-border bg-card/40">
      <div className="flex items-center gap-2 px-4 pt-5 pb-3">
        <Layers className="size-3.5 text-muted-foreground" />
        <span className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
          Assistants
        </span>
      </div>

      <div className="flex flex-col gap-1 px-3 pb-4">
        {scenarios.map((scenario) => {
          const a = accents[scenario.accent]
          const active = scenario.id === selectedId
          return (
            <button
              key={scenario.id}
              type="button"
              onClick={() => onSelect(scenario.id)}
              className={cn(
                'group flex flex-col gap-1.5 rounded-lg border-l-2 px-3 py-2.5 text-left transition-colors',
                active
                  ? cn(a.border, a.soft)
                  : 'border-l-transparent hover:bg-accent/60',
              )}
            >
              <div className="flex items-center gap-2">
                <span className={cn('size-1.5 rounded-full', a.dot)} />
                <span
                  className={cn(
                    'text-[10px] font-semibold tracking-wider uppercase',
                    active ? a.text : 'text-muted-foreground',
                  )}
                >
                  {scenario.shortName}
                </span>
              </div>

              <span
                className={cn(
                  'text-[13px] leading-tight font-medium',
                  active ? 'text-foreground' : 'text-foreground/80',
                )}
              >
                {scenario.name}
              </span>

              <span className="truncate text-[11.5px] text-muted-foreground">
                {scenario.domain}
              </span>
            </button>
          )
        })}
      </div>

      <div className="mt-auto border-t border-border px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">
        Each assistant keeps its own separate memory. Nothing one of them learns
        is visible to the others.
      </div>
    </nav>
  )
}
