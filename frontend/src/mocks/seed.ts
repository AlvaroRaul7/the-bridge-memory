/**
 * Seeds the mock backend from the scenario registry.
 *
 * Shapes match `backend/app/schemas.py`: a memory is `{id, text, metadata}`,
 * with everything the UI needs beyond the text living in the free-form
 * metadata dict (see MemoryMetadata for the convention).
 */

import { scenarioAnswers } from '@/data/scenario-answers'
import { scenarios } from '@/lib/scenarios'
import type { MemoryKind, MemoryRecord } from '@/lib/api-types'

function inferKind(path: string): MemoryKind {
  if (path.includes('polic')) return 'policy'
  if (path.includes('contact') || path.includes('people')) return 'contact'
  if (path.includes('risk') || path.includes('rating') || path.includes('positioning'))
    return 'decision'
  if (path.includes('changelog') || path.includes('faq')) return 'note'
  return 'fact'
}

let counter = 0
export const nextId = () => `mem_${(++counter).toString().padStart(6, '0')}`

/** Which scenario a tenant belongs to. Tenants end with the scenario id. */
export function scenarioForTenant(tenant: string) {
  return scenarios.find((s) => tenant.endsWith(s.id))
}

/**
 * Seed one tenant on demand.
 *
 * With auth on, the tenant embeds the signed-in account id, so the set of
 * tenants is not knowable upfront — the mock seeds whatever it is asked for.
 */
export function seedMemoriesFor(tenant: string): MemoryRecord[] {
  const scenario = scenarioForTenant(tenant)
  if (!scenario) return []

  const baseline = scenarioAnswers[`${scenario.id}:1`]
  if (!baseline) return []

  const now = Date.now()
  return baseline.memoryAfter.map((entry, i) => ({
    id: nextId(),
    text: entry.content,
    metadata: {
      kind: inferKind(entry.path),
      // A provenance string, not a filesystem path.
      source: entry.path.replace(/^\/mnt\/memory\//, ''),
      scenario_id: scenario.id,
      created_at: new Date(now - (10 - i) * 60_000).toISOString(),
    },
  }))
}
