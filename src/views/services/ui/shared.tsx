/**
 * Shared UI pieces for the HR ops view: wording, tones, empty states. Figure definitions come
 * from the metric dictionary through engine/definitions.ts (`servicesDefinitions`).
 */
import { useTools } from '@/app/ToolsMenu'
import { processLink } from '@/app/tools'
import type { Tone } from '@/charts'
import { Button, EmptyState, goTo, IconDatabase, type Severity, type Span } from '@/components'
import { formatDate } from '@/lib/dates'
import { fmt } from '@/lib/format'
import type { LevelStatus } from '../engine/levels'

/** "last 12 months", or the exact range for a custom window. */
export { periodWords as period } from '../engine/drills'

/** A drill title in plain words: what, then where and when ("Cases opened, Payroll, last 12 months"). */
export const titled = (...parts: (string | null | undefined | false)[]): string =>
  parts.filter(Boolean).join(', ')

/** The Atlas process page for a process ID (Tools menu > HR process catalog), for Column.href. */
export function useProcessHref(): (id: string | null | undefined) => string | null {
  const tools = useTools()
  return (id) => (id ? processLink(tools, id) : null)
}

/** Footnote: "3,455 cases · as of 30 Sep 2026". */
export const asOfNote = (asOf: string, ...parts: (string | null | false | undefined)[]): string =>
  [...parts.filter(Boolean), `as of ${formatDate(asOf)}`].join(' · ')

export const count = (n: number, one: string, many = `${one}s`): string =>
  `${fmt(n, 'int')} ${n === 1 ? one : many}`

/** Tone for a rate against its target: under target warns, 10 pts under is critical. */
export function rateTone(rate: number | null, target: number): Tone {
  if (rate == null) return 'deemph'
  if (rate >= target) return 'default'
  return rate < target - 0.1 ? 'critical' : 'warning'
}

export const STATUS_SEVERITY: Record<LevelStatus, Severity> = {
  Met: 'good',
  'At risk': 'warning',
  Missed: 'critical',
}

export const STATUS_TONE: Record<LevelStatus, Tone> = {
  Met: 'good',
  'At risk': 'warning',
  Missed: 'critical',
}

/** A missing dataset or column, with a way to the Data room. */
export function NeedData({ title, body, span = 12 }: { title: string; body: string; span?: Span }) {
  return (
    <EmptyState
      span={span}
      icon={<IconDatabase />}
      title={title}
      body={body}
      action={
        <Button size="sm" onClick={() => goTo('data')}>
          Open the Data room
        </Button>
      }
    />
  )
}

export const NO_CASES = {
  title: 'Upload HR cases to see this',
  body: 'This tab reads the HR cases dataset (one row per help desk case, with opened, first response and resolved times). Add it in the Data room.',
}

export const NO_TX = {
  title: 'Upload HR transactions to see this',
  body: 'This tab reads the HR transactions dataset (one row per hire, exit, change or leave event, with its due and completed dates). Add it in the Data room.',
}

/** Shown in place of row-level lists when the scope has fewer people than the anonymity minimum. */
export const smallScope = (k: number): string =>
  `Fewer than ${k} people are behind the cases and transactions in this scope, so rows are hidden to protect anonymity. Widen the filters to see them.`
