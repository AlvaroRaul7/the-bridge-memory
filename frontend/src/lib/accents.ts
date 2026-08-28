import type { Accent } from './types'

/**
 * Per-scenario accent colours. Written out as complete static class strings
 * because Tailwind scans source text — a template literal like
 * `bg-${accent}-500` produces no CSS.
 */
export const accents: Record<
  Accent,
  { dot: string; text: string; soft: string; border: string; ring: string }
> = {
  blue: {
    dot: 'bg-blue-500',
    text: 'text-blue-600 dark:text-blue-400',
    soft: 'bg-blue-500/10',
    border: 'border-l-blue-500',
    ring: 'ring-blue-500/25',
  },
  emerald: {
    dot: 'bg-emerald-500',
    text: 'text-emerald-600 dark:text-emerald-400',
    soft: 'bg-emerald-500/10',
    border: 'border-l-emerald-500',
    ring: 'ring-emerald-500/25',
  },
  amber: {
    dot: 'bg-amber-500',
    text: 'text-amber-600 dark:text-amber-400',
    soft: 'bg-amber-500/10',
    border: 'border-l-amber-500',
    ring: 'ring-amber-500/25',
  },
  violet: {
    dot: 'bg-violet-500',
    text: 'text-violet-600 dark:text-violet-400',
    soft: 'bg-violet-500/10',
    border: 'border-l-violet-500',
    ring: 'ring-violet-500/25',
  },
}
