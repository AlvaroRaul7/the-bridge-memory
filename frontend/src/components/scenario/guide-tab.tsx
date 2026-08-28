import { ArrowRight, BookOpen, Database, MessageSquarePlus, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { accents } from '@/lib/accents'
import { cn } from '@/lib/utils'
import type { Scenario } from '@/lib/types'

/**
 * The landing tab. Written for someone opening this for the first time, not
 * for someone who has read the repo: no filenames, no "round 1 / round 2", no
 * grading criteria. It says what the assistant is for, how to drive it, and
 * offers questions to click.
 */

/** "Your onboarding co-pilot" → "your onboarding co-pilot" */
const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1)

const STEPS = [
  {
    icon: MessageSquarePlus,
    title: 'Ask a question',
    body: 'Type it in the Console, or click one of the samples below. Plain language is fine — you do not need to phrase it any particular way.',
  },
  {
    icon: Database,
    title: 'See what it recalled',
    body: 'Above every answer you get the notes the assistant pulled to write it, with how closely each one matched. Nothing is hidden — you can always see why it answered the way it did.',
  },
  {
    icon: BookOpen,
    title: 'Keep what is worth keeping',
    body: 'Use Commit to memory on an answer you want remembered. Open Memory at any time to read everything it has stored, and delete anything that should not be there.',
  },
  {
    icon: Sparkles,
    title: 'Come back later',
    body: 'Start a new session and ask the same question again. As the underlying documents change, the answer changes with them — and it will tell you what changed rather than quietly giving you something different.',
  },
]

export function GuideTab({
  scenario,
  onAsk,
  name,
}: {
  scenario: Scenario
  onAsk: (question: string) => void
  /** Signed-in first name, when there is one. */
  name?: string
}) {
  const a = accents[scenario.accent]

  return (
    <div className="flex flex-col gap-4">
      <Card className={cn('border-l-2', a.border)}>
        <CardHeader>
          <CardTitle className="text-[15px]">
            {name ? `${name}, meet ${lowerFirst(scenario.headline)}` : scenario.headline}
          </CardTitle>
          <CardDescription className="mt-1 max-w-3xl text-[13.5px] leading-relaxed">
            {scenario.clientSummary}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="mb-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            What it keeps track of
          </p>
          <ul className="flex flex-col gap-1.5">
            {scenario.knows.map((item) => (
              <li key={item} className="flex gap-2.5 text-[13px]">
                <span className={cn('mt-[7px] size-1 shrink-0 rounded-full', a.dot)} />
                <span className="text-foreground/85">{item}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Try one of these</CardTitle>
          <CardDescription>
            Click a question to ask it. The first one is the best place to start.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1.5">
          {scenario.sampleQuestions.map((question, i) => (
            <button
              key={question}
              type="button"
              onClick={() => onAsk(question)}
              className={cn(
                'group flex items-start gap-3 rounded-lg border px-4 py-3 text-left transition-colors',
                i === 0
                  ? cn('border-transparent', a.soft)
                  : 'border-border hover:bg-accent/60',
              )}
            >
              <span className="min-w-0 flex-1 text-[13.5px] leading-snug text-foreground/90">
                {question}
              </span>
              <ArrowRight
                className={cn(
                  'mt-0.5 size-3.5 shrink-0 transition-transform group-hover:translate-x-0.5',
                  i === 0 ? a.text : 'text-muted-foreground',
                )}
              />
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How to use it</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
          {STEPS.map((step, i) => {
            const Icon = step.icon
            return (
              <div key={step.title} className="flex gap-3">
                <div
                  className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-lg',
                    a.soft,
                  )}
                >
                  <Icon className={cn('size-3.5', a.text)} />
                </div>
                <div className="min-w-0">
                  <p className="mb-1 text-[13px] font-semibold">
                    <span className="mr-1.5 font-mono text-[11px] text-muted-foreground">
                      {i + 1}
                    </span>
                    {step.title}
                  </p>
                  <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                    {step.body}
                  </p>
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center gap-4">
          <div className="min-w-0 flex-1">
            <CardTitle>Where its answers come from</CardTitle>
            <CardDescription className="mt-1">
              Everything it tells you traces back to a source document. You can
              read all of them yourself in the Documents tab, and the
              Contradictions tab shows where newer guidance has replaced older
              guidance.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => onAsk(scenario.sampleQuestions[0])}>
            Start asking
            <ArrowRight />
          </Button>
        </CardHeader>
      </Card>
    </div>
  )
}
