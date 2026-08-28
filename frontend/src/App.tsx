import { useEffect, useMemo, useState } from 'react'
import {
  Brain,
  FileText,
  GitCompareArrows,
  MessagesSquare,
  Moon,
  ScrollText,
  Sun,
} from 'lucide-react'
import { ClerkFailed, ClerkLoaded, ClerkLoading, Show, UserButton, useUser } from '@clerk/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TooltipProvider } from '@/components/ui/tooltip'
import { GuideTab } from '@/components/scenario/guide-tab'
import { ContradictionsTab } from '@/components/scenario/contradictions-tab'
import { DocumentsTab } from '@/components/scenario/documents-tab'
import { Sidebar } from '@/components/scenario/sidebar'
import { ConsoleView } from '@/components/console/console-view'
import { AuthBridge } from '@/components/auth/auth-bridge'
import {
  AuthLoadingScreen,
  AuthUnavailableScreen,
  SignInScreen,
} from '@/components/auth/sign-in-screen'
import { authEnabled } from '@/lib/auth'
import { displayName, greetingFor } from '@/lib/greeting'
import { accents } from '@/lib/accents'
import { docsFor, scenarios } from '@/lib/scenarios'
import { cn } from '@/lib/utils'

export default function App() {
  // With Clerk off this renders the workspace directly, exactly as before —
  // and critically, without any Clerk hook running, since there is no
  // ClerkProvider above it in that path.
  if (!authEnabled) return <Workspace />

  // v6 replaced <SignedIn>/<SignedOut> with a single <Show when=...>, which
  // renders null until Clerk resolves — so the load and failure states have to
  // be handled explicitly or an unreachable Clerk leaves a blank page forever.
  return (
    <>
      <ClerkLoading>
        <AuthLoadingScreen />
      </ClerkLoading>
      <ClerkFailed>
        <AuthUnavailableScreen />
      </ClerkFailed>
      <ClerkLoaded>
        <Show when="signed-in" fallback={<SignInScreen />}>
          <AuthBridge />
          <SignedInWorkspace />
        </Show>
      </ClerkLoaded>
    </>
  )
}

/** Only mounted once `when="signed-in"` holds, so `useUser()` is safe here. */
function SignedInWorkspace() {
  const { user } = useUser()
  return <Workspace accountId={user?.id} name={displayName(user)} />
}

function Workspace({ accountId, name }: { accountId?: string; name?: string }) {
  const usingMocks = import.meta.env.VITE_USE_MOCKS === 'true'
  const [scenarioId, setScenarioId] = useState(scenarios[0].id)
  const [tab, setTab] = useState('guide')
  // Set when a sample question is clicked; the chat consumes it and clears it.
  const [pendingQuestion, setPendingQuestion] = useState<string>()
  const [dark, setDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  )

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  const askQuestion = (question: string) => {
    setPendingQuestion(question)
    setTab('console')
  }

  const scenario = scenarios.find((s) => s.id === scenarioId)!
  const docs = useMemo(() => docsFor(scenario), [scenario])
  const a = accents[scenario.accent]

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-screen flex-col overflow-hidden">
        <header className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-3">
          <Brain className="size-4" />
          <div className="min-w-0">
            <h1 className="text-[13.5px] leading-tight font-semibold">
              {/* Greet by name when Clerk gives us one; an email-only account
                  has no first name, so fall back rather than say "undefined". */}
              {name ? `${greetingFor(new Date())}, ${name}` : 'Institutional Buddy'}
            </h1>
            <p className="text-[11.5px] text-muted-foreground">
              {name
                ? 'Your institutional buddy — ask about your business, and it remembers what matters.'
                : 'Ask about your business, and it remembers what matters.'}
            </p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Badge variant={usingMocks ? 'warning' : 'success'}>
              {usingMocks ? 'Demo data' : 'Live'}
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setDark((d) => !d)}
              aria-label="Toggle theme"
            >
              {dark ? <Sun /> : <Moon />}
            </Button>
            {authEnabled && (
              <UserButton appearance={{ elements: { avatarBox: 'size-7' } }} />
            )}
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <Sidebar
            scenarios={scenarios}
            selectedId={scenarioId}
            onSelect={(id) => {
              setScenarioId(id)
              setPendingQuestion(undefined)
            }}
          />

          <main className="min-w-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-[1500px] px-6 py-5">
              <div className="mb-5 flex items-start gap-3">
                <span className={cn('mt-1.5 size-2 rounded-full', a.dot)} />
                <div className="min-w-0">
                  <h2 className="text-[17px] leading-tight font-semibold tracking-tight">
                    {scenario.name}
                  </h2>
                  <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                    {scenario.domain}
                  </p>
                </div>
              </div>

              <Tabs value={tab} onValueChange={setTab} className="flex flex-col gap-4">
                <TabsList className="self-start">
                  <TabsTrigger value="guide">
                    <ScrollText />
                    Guide
                  </TabsTrigger>
                  <TabsTrigger value="console">
                    <MessagesSquare />
                    Ask
                  </TabsTrigger>
                  <TabsTrigger value="documents">
                    <FileText />
                    Documents
                  </TabsTrigger>
                  <TabsTrigger value="contradictions">
                    <GitCompareArrows />
                    What changed
                    <Badge variant="muted" className="ml-1 py-0">
                      {scenario.contradictions.length}
                    </Badge>
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="guide">
                  <GuideTab scenario={scenario} onAsk={askQuestion} name={name} />
                </TabsContent>
                <TabsContent value="console">
                  <ConsoleView
                    key={`${accountId ?? 'demo'}:${scenario.id}`}
                    scenario={scenario}
                    accountId={accountId}
                    pendingQuestion={pendingQuestion}
                    onPendingConsumed={() => setPendingQuestion(undefined)}
                  />
                </TabsContent>
                <TabsContent value="documents">
                  <DocumentsTab key={scenario.id} docs={docs} />
                </TabsContent>
                <TabsContent value="contradictions">
                  <ContradictionsTab scenario={scenario} />
                </TabsContent>
              </Tabs>
            </div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  )
}
