/** Shared UI pieces for the Employee services view: wording, definitions, tones, empty states. */
import type { Definition, Tone } from '@/charts'
import { Button, EmptyState, goTo, IconDatabase, type Severity, type Span } from '@/components'
import type { AnalyticsContext } from '@/data/context'
import { PERIOD_LABELS } from '@/data/scope'
import { formatDate } from '@/lib/dates'
import { fmt } from '@/lib/format'
import { RESOLUTION_SLA_TARGET, TRANSACTION_ON_TIME_TARGET } from '../engine/catalog'
import type { LevelStatus } from '../engine/levels'

/** "last 12 months", or the exact range for a custom window. */
export function period(ctx: Pick<AnalyticsContext, 'filters' | 'window'>): string {
  const p = ctx.filters.period
  return p === 'custom' ? ctx.window.label : PERIOD_LABELS[p].toLowerCase()
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

/* ───────────── definitions ───────────── */

export const DEF = {
  resolutionSla: {
    term: 'Resolution SLA met',
    text: `Cases opened in the period that were resolved within their category's resolution target, in calendar hours. Open cases already past their target count as missed; open cases still inside it are left out. Target ${fmt(RESOLUTION_SLA_TARGET, 'pct0')}.`,
    formula: 'resolved within target ÷ (resolved + open past target)',
  },
  responseSla: {
    term: 'First response SLA met',
    text: "Cases opened in the period with a first reply within their category's response target, in calendar hours. A case resolved without a logged reply counts its resolution as the reply.",
    formula: 'firstResponseAt − openedAt ≤ response target',
  },
  timeToResolve: {
    term: 'Time to resolve',
    text: 'Calendar time from opened to resolved, for cases resolved in the period. Medians, not averages, so a few very long cases do not move it.',
    formula: 'median(resolvedAt − openedAt)',
  },
  backlog: {
    term: 'Open backlog',
    text: 'Cases still open at the end of the as-of date, in any open status. Age runs from the opened date.',
    formula: 'as-of date − opened date',
  },
  csat: {
    term: 'Satisfaction (CSAT)',
    text: 'Mean of the 1 to 5 scores requesters gave on cases resolved in the period. Hidden below 5 responses.',
    formula: 'mean(csat)',
  },
  firstContact: {
    term: 'First-contact resolution',
    text: 'Resolved cases handled at Tier 0 or Tier 1 that were neither reopened nor escalated.',
    formula: 'resolved ∧ ¬reopened ∧ ¬escalated ∧ tier ∈ {0, 1}',
  },
  reopen: {
    term: 'Reopen rate',
    text: 'Resolved cases opened in the period that were reopened after resolution.',
    formula: 'reopened ÷ resolved',
  },
  escalation: {
    term: 'Escalation rate',
    text: 'Cases opened in the period that were escalated to a higher tier.',
    formula: 'escalated ÷ opened',
  },
  onTime: {
    term: 'On time',
    text: `A transaction is on time when it was completed on or before its due date. The population is every transaction due in the period; open ones past due count as late. Target ${fmt(TRANSACTION_ON_TIME_TARGET, 'pct0')}.`,
    formula: 'completedDate ≤ dueDate',
  },
  anonymity: {
    term: 'Small groups',
    text: 'A rate, median or average needs at least 5 cases, transactions or responses from at least 5 different people; otherwise it shows as "—" (hidden to protect anonymity). Breakdowns fold groups behind fewer than 5 people into "Other (k)", where k is the number of groups folded.',
  },
} satisfies Record<string, Definition>

/** Shown in place of row-level lists when the scope has fewer than 5 people. */
export const SMALL_SCOPE =
  'Fewer than 5 people are behind the cases and transactions in this scope, so rows are hidden to protect anonymity. Widen the filters to see them.'
