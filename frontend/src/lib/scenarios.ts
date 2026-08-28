/**
 * Loads the scenario registry and the synthetic documents from the repo root.
 *
 * Both are read straight off disk at build time — scenarios.json is the same
 * file the Python scripts read, and the docs are the same markdown the agent
 * is given. Nothing here is duplicated into the UI, so a change to a scenario
 * shows up on both sides at once.
 */

import registry from '../../../scenarios.json'
import type { DocFile, Scenario } from './types'

export const scenarios = registry.scenarios as Scenario[]

export function getScenario(id: string): Scenario | undefined {
  return scenarios.find((s) => s.id === id)
}

// Eagerly inline every synthetic-data markdown file as a raw string.
const rawDocs = import.meta.glob('../../../synthetic-data/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/** Docs for one scenario, grouped by round and sorted by filename. */
export function docsFor(scenario: Scenario): DocFile[] {
  const prefix = `../../../${scenario.docsDir}/`
  return Object.entries(rawDocs)
    .filter(([path]) => path.startsWith(prefix))
    .map(([path, content]) => {
      const rest = path.slice(prefix.length)
      const [roundDir, name] = rest.split('/')
      return {
        name,
        round: (roundDir === 'round2' ? 2 : 1) as 1 | 2,
        content,
      }
    })
    .sort((a, b) => a.round - b.round || a.name.localeCompare(b.name))
}
