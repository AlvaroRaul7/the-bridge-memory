/**
 * Types for the scenario registry (../../scenarios.json) and its documents.
 *
 * The API surface has its own types in `api-types.ts`, mirroring Spec 2.
 * Nothing here describes a backend contract.
 */

export type Severity = 'high' | 'medium' | 'low'
export type Accent = 'blue' | 'emerald' | 'amber' | 'violet'

export interface Contradiction {
  topic: string
  round1: string
  round2: string
  severity: Severity
}

export interface Scenario {
  id: string
  card: string
  name: string
  shortName: string
  domain: string
  accent: Accent
  persona: string
  systemPromptFocus: string
  testQuestion: string
  /** Client-facing one-liner shown at the top of the Guide. */
  headline: string
  /** Plain-language description of what this assistant is for. */
  clientSummary: string
  /** What it keeps track of, in the user's terms — not memory internals. */
  knows: string[]
  /** Click-to-ask prompts offered in the Guide and the empty chat. */
  sampleQuestions: string[]
  docsDir: string
  round1Summary: string
  round2Summary: string
  successCriteria: string[]
  contradictions: Contradiction[]
}

export interface DocFile {
  name: string
  round: 1 | 2
  content: string
}

/** A seed memory for the mock backend, before it becomes a Spec 2 MemoryRecord. */
export interface MemoryEntry {
  path: string
  content: string
  chars: number
}

/** A streamed event from a running session. */
export type SessionEvent =
  | { kind: 'text'; text: string }
  | { kind: 'tool_use'; name: string; target: string; isMemory: boolean }
  | { kind: 'status'; text: string }
