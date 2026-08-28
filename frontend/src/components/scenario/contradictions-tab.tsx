import { ArrowDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { Scenario, Severity } from '@/lib/types'

const severityVariant: Record<Severity, 'destructive' | 'warning' | 'muted'> = {
  high: 'destructive',
  medium: 'warning',
  low: 'muted',
}

export function ContradictionsTab({ scenario }: { scenario: Scenario }) {
  const high = scenario.contradictions.filter((c) => c.severity === 'high').length

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>What has changed recently</CardTitle>
          <CardDescription>
            {scenario.contradictions.length} things are no longer true, {high} of
            them significant. The assistant follows the right-hand column and
            will tell you when an answer has changed — so you are not acting on
            guidance that has been replaced.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="flex flex-col gap-3">
        {scenario.contradictions.map((c) => (
          <Card key={c.topic} className="overflow-hidden">
            <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-5 py-2.5">
              <span className="text-[13px] font-semibold">{c.topic}</span>
              <Badge variant={severityVariant[c.severity]} className="ml-auto">
                {c.severity}
              </Badge>
            </div>
            <CardContent className="grid gap-0 p-0 md:grid-cols-2">
              <Side
                label="Previously"
                text={c.round1}
                className="border-b border-border md:border-r md:border-b-0"
                tone="stale"
              />
              <Side label="Now" text={c.round2} tone="fresh" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

function Side({
  label,
  text,
  className,
  tone,
}: {
  label: string
  text: string
  className?: string
  tone: 'stale' | 'fresh'
}) {
  return (
    <div className={cn('relative px-5 py-4', className)}>
      <div className="mb-1.5 flex items-center gap-1.5">
        <span
          className={cn(
            'text-[10px] font-semibold tracking-wider uppercase',
            tone === 'stale'
              ? 'text-muted-foreground'
              : 'text-emerald-600 dark:text-emerald-400',
          )}
        >
          {label}
        </span>
        {tone === 'stale' && (
          <ArrowDown className="size-3 text-muted-foreground md:-rotate-90" />
        )}
      </div>
      <p
        className={cn(
          'text-[13px] leading-relaxed',
          tone === 'stale'
            ? 'text-muted-foreground line-through decoration-muted-foreground/30'
            : 'text-foreground/90',
        )}
      >
        {text}
      </p>
    </div>
  )
}
