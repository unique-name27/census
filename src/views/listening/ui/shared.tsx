/**
 * Shared UI pieces for the Listening view: notes, definitions, tones and empty states. Figure
 * definitions come from the metric dictionary (`definitionOf`), with the anonymity rule beside.
 */
import type { Definition, Tone } from '@/charts'
import { Button, EmptyState, goTo, IconDatabase, type Severity, type Span } from '@/components'
import type { AnalyticsContext } from '@/data/context'
import { PERIOD_LABELS } from '@/data/scope'
import { formatDate } from '@/lib/dates'
import { fmt } from '@/lib/format'
import { definitionOf } from '@/metrics/api'
import type { Status } from '../engine/settings'

/** "last 12 months", or the exact range of a custom period. */
export const periodWords = (ctx: Pick<AnalyticsContext, 'filters' | 'window'>): string =>
  ctx.filters.period === 'custom' ? ctx.window.label : PERIOD_LABELS[ctx.filters.period].toLowerCase()

/** Footnote: "1,174 respondents · last 12 months · as of 30 Sep 2026". */
export const noteOf = (ctx: AnalyticsContext, ...parts: (string | null | false | undefined)[]): string =>
  [...parts.filter(Boolean), `as of ${formatDate(ctx.asOf)}`].join(' · ')

export const count = (n: number, one: string, many = `${one}s`): string =>
  `${fmt(n, 'int')} ${n === 1 ? one : many}`

/** The metrics' definitions from the dictionary, then the anonymity rule. */
export function defs(
  ctx: AnalyticsContext,
  metricIds: string | readonly string[],
  min: number,
  ...more: Definition[]
): Definition[] {
  const ids = typeof metricIds === 'string' ? [metricIds] : metricIds
  return [
    ...ids.flatMap((id) => {
      const d = definitionOf(ctx.metrics, id)
      return d ? [d] : []
    }),
    ...more,
    {
      term: 'Hidden groups',
      text: `A group with fewer than ${min} distinct respondents shows no score. Survey numbers open grouped counts and scores, never one person’s answers.`,
    },
  ]
}

export const STATUS_SEVERITY: Record<Status, Severity> = {
  met: 'good',
  watch: 'warning',
  missed: 'critical',
  none: 'info',
}

/** Bar glyph for a driver against its target: below target warns, nothing otherwise. */
export const statusTone = (s: Status): Tone => (s === 'missed' ? 'warning' : 'default')

/** A survey with no answers in scope, with a way to the Data room. */
export function NoAnswers({ survey, span = 12 }: { survey: string; span?: Span }) {
  return (
    <EmptyState
      span={span}
      icon={<IconDatabase />}
      title={`No ${survey.toLowerCase()} answers in scope`}
      body="Load a Survey responses sheet with this program in the Data room, or widen the filters. Survey answers stay in this browser."
      action={
        <Button size="sm" onClick={() => goTo('data')}>
          Open the Data room
        </Button>
      }
    />
  )
}
