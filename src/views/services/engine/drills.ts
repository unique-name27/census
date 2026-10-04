/**
 * The records behind every number in the view, as specs for the shared drill panel (src/drill).
 * Pure: each builder takes the facts a metric already selected (kept on the model's rows as
 * `records`) and returns a spec, or null when the number must not drill. The UI wraps the calls
 * in thunks, so the rows are gathered on click.
 *
 * Privacy, on top of the panel's own rules:
 *  - in a small scope (fewer than 5 people behind the view's records) nothing drills;
 *  - a number drills only when the group it describes is behind at least the anonymity minimum
 *    of people (`DrillScope.minGroup`), so a list can't give away a rate hidden beside it; a
 *    hidden value ("—") never drills;
 *  - employee relations cases are never listed (counts and timeliness only): a drill over cases
 *    that include some says how many it leaves out, and one with nothing else doesn't drill.
 *
 * Success ratios (SLA met, on time, ready by Day −3, first-contact resolution) list every judged
 * record with its outcome, misses first, and the note spells out the ratio. Incident rates
 * (reopened, escalated, retro) list the incidents, and the note names the denominator.
 */
import type { Column } from '@/charts/types'
import type { AnalyticsContext } from '@/data/context'
import { type HrCase, type HrTransaction, MIN_GROUP, type TransactionType } from '@/data/schema'
import { PERIOD_LABELS, type Window } from '@/data/scope'
import { type DrillSpec, drillSpec } from '@/drill/types'
import { businessDaysBetween, daysBetween, formatDate, formatMonth } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import { mean, median } from '@/lib/stats'
import { isFirstContact, isRowPrivate } from './cases'
import { FINAL_PAY_RULES, TRANSACTION_DEADLINES } from './catalog'
import type { CaseColumns, CaseFact, TxFact } from './facts'
import { clockMet, clockStop, type LevelClock, type LevelRow } from './levels'
import { type Personal, peopleIn } from './util'

/* ───────────── scope ───────────── */

export interface DrillScope {
  /** False in a small scope: nothing drills. */
  on: boolean
  /** "last 12 months", or the range of a custom window. */
  per: string
  window: Window
  asOf: string
  /** The org scope in words, e.g. "Whole company". */
  scope: string
  /** Optional case columns present in the data; a missing one drops its drill column. */
  caseCols: Pick<CaseColumns, 'firstResponseAt' | 'resolvedAt'>
  /** The anonymity minimum in force (a dictionary setting; MIN_GROUP when absent). */
  minGroup?: number
}

/** "last 12 months", or the exact range for a custom window. */
export function periodWords(ctx: Pick<AnalyticsContext, 'filters' | 'window'>): string {
  const p = ctx.filters.period
  return p === 'custom' ? ctx.window.label : PERIOD_LABELS[p].toLowerCase()
}

export function drillScope(
  ctx: Pick<AnalyticsContext, 'filters' | 'window' | 'asOf' | 'scopeLabel'>,
  caseCols: DrillScope['caseCols'],
  small: boolean,
  minGroup = MIN_GROUP,
): DrillScope {
  return {
    on: !small,
    per: periodWords(ctx),
    window: ctx.window,
    asOf: ctx.asOf,
    scope: ctx.scopeLabel,
    caseCols,
    minGroup,
  }
}

/** "Jul 2026" for a "2026-07" month key (or any date in the month). */
export const monthName = (month: string): string => formatMonth(`${month.slice(0, 7)}-01`)
export const windowSub = (s: DrillScope): string => `${s.window.label} · ${s.scope}`
export const asOfSub = (s: DrillScope): string => `As of ${formatDate(s.asOf)} · ${s.scope}`
export const monthSub = (s: DrillScope, month: string): string => `${monthName(month)} · ${s.scope}`

/* ───────────── the gate ───────────── */

const peopleCache = new WeakMap<readonly Personal[], number>()

function peopleOf(rows: readonly Personal[]): number {
  let n = peopleCache.get(rows)
  if (n === undefined) {
    n = peopleIn(rows)
    peopleCache.set(rows, n)
  }
  return n
}

/**
 * Whether a number over this group may open its records: the scope is not small and the group
 * is behind at least the anonymity minimum of people. Cheap to call on every render (cached per
 * array).
 */
export function canDrill(s: DrillScope, group: readonly Personal[] | null | undefined): boolean {
  return s.on && !!group?.length && peopleOf(group) >= (s.minGroup ?? MIN_GROUP)
}

/** Rows matching `pred` first, each part keeping its order (sort is stable). */
const firstWhere =
  <T>(pred: (r: T) => boolean) =>
  (a: T, b: T): number =>
    Number(pred(b)) - Number(pred(a))

const joinNote = (...parts: (string | null | undefined)[]): string | undefined =>
  parts.filter(Boolean).join(' ') || undefined

const int = (n: number) => fmt(n, 'int')

/** The note on a case drill that leaves out employee relations cases. */
export function withheldNote(n: number): string {
  return `${plural(n, 'employee relations case')} ${n === 1 ? 'is' : 'are'} counted in this number but not listed: employee relations is reported as counts and timeliness only.`
}

/* ───────────── cases ───────────── */

export interface CaseDrillOptions {
  title: string
  /** Default: the window and the scope. */
  subtitle?: string
  note?: string
  /** The group the number describes, when larger than the rows listed (default: the rows). */
  gate?: readonly Personal[]
  /** A row already listed on screen (the aging list): drills without the group gate. */
  listed?: boolean
  /** Listing order (default: as given). */
  order?: (a: CaseFact, b: CaseFact) => number
  /** Add "Within response target". */
  response?: boolean
  /** Add "Age", "Resolution target" and "Days past target" (open cases). */
  age?: boolean
  /** Add "Days to resolve" and "Share of target". */
  timing?: boolean
  flags?: readonly ('reopened' | 'escalated' | 'firstContact')[]
  /** Add the business-day clock of an Atlas measure. */
  clock?: LevelClock
}

interface Extra<F> {
  column: Column
  value: (f: F) => unknown
}

/** "Yes" / "No", or "Not yet due" for an open case still inside its target. */
function within(met: boolean | null, f: CaseFact, target: number | null): string | null {
  if (met != null) return met ? 'Yes' : 'No'
  return f.open && target != null ? 'Not yet due' : null
}

const yesNo = (v: boolean | null | undefined): string | null => (v == null ? null : v ? 'Yes' : 'No')

function caseExtras(s: DrillScope, o: CaseDrillOptions): Extra<CaseFact>[] {
  const out: Extra<CaseFact>[] = []
  const add = (key: string, label: string, value: (f: CaseFact) => unknown, format?: Column['format']) =>
    out.push({ column: format ? { key, label, format } : { key, label }, value })
  if (s.caseCols.firstResponseAt)
    add('svResponseHours', 'Hours to first response', (f) => f.responseHours, 'hours')
  if (s.caseCols.resolvedAt) {
    add('svResolveHours', 'Hours to resolve', (f) => f.resolutionHours, 'hours')
    if (o.timing) {
      add(
        'svResolveDays',
        'Days to resolve',
        (f) => (f.resolutionHours == null ? null : f.resolutionHours / 24),
        'num1',
      )
      add(
        'svShareOfTarget',
        'Share of target',
        (f) =>
          f.resolutionHours == null || !f.resolutionTarget ? null : f.resolutionHours / f.resolutionTarget,
        'pct0',
      )
    }
    add('svResolutionWithin', 'Within resolution target', (f) =>
      within(f.resolutionMet, f, f.resolutionTarget),
    )
  }
  if (o.response && s.caseCols.firstResponseAt)
    add('svResponseWithin', 'Within response target', (f) => within(f.responseMet, f, f.responseTarget))
  if (o.age) {
    add('svAgeDays', 'Age', (f) => f.ageDays, 'days')
    add(
      'svTargetDays',
      'Resolution target',
      (f) => (f.resolutionTarget == null ? null : f.resolutionTarget / 24),
      'days',
    )
    add(
      'svDaysPastTarget',
      'Days past target',
      (f) =>
        f.ageDays == null || f.resolutionTarget == null
          ? null
          : Math.max(0, Math.round(f.ageDays - f.resolutionTarget / 24)),
      'days',
    )
  }
  for (const flag of o.flags ?? []) {
    if (flag === 'reopened') add('svReopened', 'Reopened', (f) => yesNo(f.reopened))
    if (flag === 'escalated') add('svEscalated', 'Escalated', (f) => yesNo(f.escalated))
    if (flag === 'firstContact')
      add('svFirstContact', 'First-contact resolution', (f) => (f.resolved ? yesNo(isFirstContact(f)) : null))
  }
  const clock = o.clock
  if (clock) {
    const what = clock.stop === 'resolved' ? 'Business days to resolve' : 'Business days to first response'
    add('svBusinessDays', what, (f) => {
      const end = clockStop(f, clock) ?? (f.open ? s.asOf : null)
      return end ? businessDaysBetween(f.opened, end) : null
    })
    add('svClockWithin', `Within ${plural(clock.days, 'business day')}`, (f) =>
      within(clockMet(f, clock, s.asOf), f, clock.days),
    )
  }
  return out
}

/**
 * Cases behind a number. Employee relations cases are left out (and counted in the note); null
 * when the number must not drill or nothing is left to list.
 */
export function caseDrill(
  s: DrillScope,
  rows: readonly CaseFact[] | null | undefined,
  o: CaseDrillOptions,
): DrillSpec<'cases'> | null {
  if (!rows || !(o.listed ? s.on : canDrill(s, o.gate ?? rows))) return null
  const listed = rows.filter((f) => !isRowPrivate(f))
  if (!listed.length) return null
  if (o.order) listed.sort(o.order)
  const withheld = rows.length - listed.length
  const extras = caseExtras(s, o)
  const byRecord = new Map<HrCase, CaseFact>(listed.map((f) => [f.record, f]))
  return drillSpec({
    kind: 'cases',
    title: o.title,
    subtitle: o.subtitle ?? windowSub(s),
    rows: listed.map((f) => f.record),
    extra: {
      columns: extras.map((x) => x.column),
      values: (r: HrCase) => {
        const f = byRecord.get(r)
        return f ? Object.fromEntries(extras.map((x) => [x.column.key, x.value(f)])) : {}
      },
    },
    hide: ['hoursToResolve', 'withinTarget'],
    note: joinNote(o.note, withheld ? withheldNote(withheld) : null),
  })
}

/** One listed case (the aging list), with its age; employee relations cases never drill. */
export function oneCaseDrill(s: DrillScope, f: CaseFact): DrillSpec<'cases'> | null {
  if (!s.on || isRowPrivate(f)) return null
  return caseDrill(s, [f], { title: `Case ${f.caseId}`, subtitle: asOfSub(s), listed: true, age: true })
}

const isMissed = (f: CaseFact) => f.resolutionMet === false

/** Cases with a resolution SLA outcome, misses first; the note spells out the rate. */
export function resolutionDrill(
  s: DrillScope,
  rows: readonly CaseFact[] | null | undefined,
  title: string,
  subtitle?: string,
): DrillSpec<'cases'> | null {
  const judged = (rows ?? []).filter((f) => f.resolutionMet != null)
  const met = judged.filter((f) => f.resolutionMet).length
  return caseDrill(s, judged, {
    title,
    subtitle,
    order: firstWhere(isMissed),
    note: `Rate = ${int(met)} met ÷ ${plural(judged.length, 'case')} with an outcome (resolved, or open past target). Open cases still inside their target are left out.`,
  })
}

/** The cases that met (or missed) the resolution SLA, out of a judged group. */
export function resolutionOutcomeDrill(
  s: DrillScope,
  rows: readonly CaseFact[] | null | undefined,
  met: boolean,
  title: string,
): DrillSpec<'cases'> | null {
  const judged = (rows ?? []).filter((f) => f.resolutionMet != null)
  return caseDrill(
    s,
    judged.filter((f) => f.resolutionMet === met),
    {
      title,
      gate: judged,
      note: `${plural(judged.length, 'case')} had an outcome.`,
    },
  )
}

/** Cases with a first response SLA outcome, misses first. */
export function responseDrill(
  s: DrillScope,
  rows: readonly CaseFact[] | null | undefined,
  title: string,
  subtitle?: string,
): DrillSpec<'cases'> | null {
  const judged = (rows ?? []).filter((f) => f.responseMet != null)
  const met = judged.filter((f) => f.responseMet).length
  return caseDrill(s, judged, {
    title,
    subtitle,
    response: true,
    order: firstWhere((f: CaseFact) => f.responseMet === false),
    note: `Rate = ${int(met)} answered in time ÷ ${plural(judged.length, 'case')} with an outcome. Open cases still inside their response target are left out.`,
  })
}

/** Resolved cases with a time to resolve, longest first; the note gives the median. */
export function resolveTimeDrill(
  s: DrillScope,
  resolved: readonly CaseFact[] | null | undefined,
  title: string,
  subtitle?: string,
): DrillSpec<'cases'> | null {
  const timed = (resolved ?? []).filter((f) => f.resolutionHours != null)
  const hours = median(timed.map((f) => f.resolutionHours as number))
  const text = hours == null ? '—' : hours >= 48 ? fmt(hours / 24, 'days') : fmt(hours, 'hours')
  return caseDrill(s, timed, {
    title,
    subtitle,
    timing: true,
    order: (a, b) => (b.resolutionHours as number) - (a.resolutionHours as number),
    note: `Median of ${plural(timed.length, 'case')} resolved: ${text}.`,
  })
}

/** Resolved cases with a satisfaction score, lowest first; the note gives the mean. */
export function csatDrill(
  s: DrillScope,
  resolved: readonly CaseFact[] | null | undefined,
  title: string,
  subtitle?: string,
): DrillSpec<'cases'> | null {
  const scored = (resolved ?? []).filter((f) => f.csat != null)
  const avg = mean(scored.map((f) => f.csat as number))
  return caseDrill(s, scored, {
    title,
    subtitle,
    order: (a, b) => (a.csat as number) - (b.csat as number),
    note: `Mean of ${plural(scored.length, 'response')}: ${fmt(avg, 'num1')} out of 5.`,
  })
}

/** The reopened cases among a group's resolved cases; the note names the denominator. */
export function reopenDrill(
  s: DrillScope,
  opened: readonly CaseFact[] | null | undefined,
  title: string,
): DrillSpec<'cases'> | null {
  const judged = (opened ?? []).filter((f) => f.resolved != null && f.reopened != null)
  const hits = judged.filter((f) => f.reopened)
  return caseDrill(s, hits, {
    title,
    gate: judged,
    flags: ['reopened', 'escalated'],
    note: `Rate = ${int(hits.length)} reopened ÷ ${plural(judged.length, 'resolved case')}.`,
  })
}

/** The escalated cases in a group; the note names the denominator. */
export function escalateDrill(
  s: DrillScope,
  opened: readonly CaseFact[] | null | undefined,
  title: string,
): DrillSpec<'cases'> | null {
  const judged = (opened ?? []).filter((f) => f.escalated != null)
  const hits = judged.filter((f) => f.escalated)
  return caseDrill(s, hits, {
    title,
    gate: judged,
    flags: ['reopened', 'escalated'],
    note: `Rate = ${int(hits.length)} escalated ÷ ${plural(judged.length, 'case')} opened.`,
  })
}

/** Resolved cases with their first-contact outcome, the ones that weren't first. */
export function firstContactDrill(
  s: DrillScope,
  resolved: readonly CaseFact[] | null | undefined,
  title: string,
): DrillSpec<'cases'> | null {
  const rows = resolved ?? []
  const hits = rows.filter(isFirstContact).length
  return caseDrill(s, rows, {
    title,
    flags: ['firstContact', 'reopened', 'escalated'],
    order: firstWhere((f: CaseFact) => !isFirstContact(f)),
    note: `Rate = ${int(hits)} resolved at first contact ÷ ${plural(rows.length, 'resolved case')}.`,
  })
}

/** Cases open at the as-of date, oldest first. */
export function openDrill(
  s: DrillScope,
  open: readonly CaseFact[] | null | undefined,
  title: string,
  listed = false,
): DrillSpec<'cases'> | null {
  return caseDrill(s, open, {
    title,
    subtitle: asOfSub(s),
    listed,
    age: true,
    order: (a, b) => (b.ageDays ?? 0) - (a.ageDays ?? 0),
  })
}

/* ───────────── transactions ───────────── */

export interface TxDrillOptions {
  title: string
  subtitle?: string
  note?: string
  /** The group the number describes, when larger than the rows listed (default: the rows). */
  gate?: readonly Personal[]
  order?: (a: TxFact, b: TxFact) => number
  exitType?: boolean
  retro?: boolean
}

const OUTCOME_WORD: Record<string, string> = {
  'on-time': 'On time',
  late: 'Late',
  overdue: 'Open past due',
  pending: 'Not yet due',
}

/** On time, completed late or open past due: the transactions an on-time rate judges. */
export const isJudgedTx = (f: TxFact): boolean =>
  f.outcome === 'on-time' || f.outcome === 'late' || f.outcome === 'overdue'
export const isLateTx = (f: TxFact): boolean => f.outcome === 'late' || f.outcome === 'overdue'

/** Days past the due date: completed late, or open past due as of the as-of date; 0 when on time. */
export function txDaysLate(f: TxFact, asOf: string): number | null {
  if (f.outcome === 'late') return f.daysVsDue
  if (f.outcome === 'overdue' && f.due) return daysBetween(f.due, asOf)
  return f.outcome === 'on-time' ? 0 : null
}

/** The deadline the transaction is judged against, in words. */
export function deadlineRule(f: Pick<TxFact, 'type' | 'jurisdiction'>): string {
  const finalPay =
    f.type === 'Termination' && f.jurisdiction ? FINAL_PAY_RULES.get(f.jurisdiction) : undefined
  return finalPay?.rule ?? TRANSACTION_DEADLINES[f.type as TransactionType] ?? 'Due date in the file'
}

/** Transactions behind a number, with outcome, days late and the deadline rule. */
export function txDrill(
  s: DrillScope,
  rows: readonly TxFact[] | null | undefined,
  o: TxDrillOptions,
): DrillSpec<'transactions'> | null {
  if (!rows?.length || !canDrill(s, o.gate ?? rows)) return null
  const listed = o.order ? rows.slice().sort(o.order) : rows.slice()
  const extras: Extra<TxFact>[] = [
    {
      column: { key: 'svOutcome', label: 'Outcome' },
      value: (f) => (f.outcome ? OUTCOME_WORD[f.outcome] : null),
    },
    {
      column: { key: 'svDaysLate', label: 'Days late', format: 'days' },
      value: (f) => txDaysLate(f, s.asOf),
    },
    { column: { key: 'svRule', label: 'Deadline rule' }, value: deadlineRule },
  ]
  if (o.exitType) extras.push({ column: { key: 'svExitType', label: 'Exit type' }, value: (f) => f.exitType })
  if (o.retro)
    extras.push({ column: { key: 'svRetro', label: 'Retro adjustment' }, value: (f) => yesNo(f.retro) })
  const byRecord = new Map<HrTransaction, TxFact>(listed.map((f) => [f.record, f]))
  return drillSpec({
    kind: 'transactions',
    title: o.title,
    subtitle: o.subtitle ?? windowSub(s),
    rows: listed.map((f) => f.record),
    extra: {
      columns: extras.map((x) => x.column),
      values: (r: HrTransaction) => {
        const f = byRecord.get(r)
        return f ? Object.fromEntries(extras.map((x) => [x.column.key, x.value(f)])) : {}
      },
    },
    hide: ['daysLate'],
    note: o.note,
  })
}

/** Judged transactions with their outcome, the latest first; the note spells out the rate. */
export function onTimeDrill(
  s: DrillScope,
  rows: readonly TxFact[] | null | undefined,
  title: string,
  o: { subtitle?: string; exitType?: boolean } = {},
): DrillSpec<'transactions'> | null {
  const judged = (rows ?? []).filter(isJudgedTx)
  const ok = judged.filter((f) => f.outcome === 'on-time').length
  return txDrill(s, judged, {
    title,
    subtitle: o.subtitle,
    exitType: o.exitType,
    order: (a, b) => (txDaysLate(b, s.asOf) ?? 0) - (txDaysLate(a, s.asOf) ?? 0),
    note: `Rate = ${int(ok)} on time ÷ ${plural(judged.length, 'transaction')} due (completed, or open past due). Transactions not yet due are left out.`,
  })
}

/** Some of a judged group's transactions (on time, late, open past due). */
export function txOutcomeDrill(
  s: DrillScope,
  rows: readonly TxFact[] | null | undefined,
  pick: (f: TxFact) => boolean,
  title: string,
  o: { subtitle?: string; exitType?: boolean } = {},
): DrillSpec<'transactions'> | null {
  const judged = (rows ?? []).filter(isJudgedTx)
  return txDrill(s, judged.filter(pick), {
    title,
    subtitle: o.subtitle,
    exitType: o.exitType,
    gate: judged,
    order: (a, b) => (txDaysLate(b, s.asOf) ?? 0) - (txDaysLate(a, s.asOf) ?? 0),
    note: `Out of ${plural(judged.length, 'transaction')} due.`,
  })
}

/** The retro adjustments among job and pay changes; the note names the denominator. */
export function retroDrill(
  s: DrillScope,
  changes: readonly TxFact[] | null | undefined,
  title: string,
  subtitle?: string,
): DrillSpec<'transactions'> | null {
  const judged = (changes ?? []).filter((f) => f.retro != null)
  const hits = judged.filter((f) => f.retro)
  return txDrill(s, hits, {
    title,
    subtitle,
    gate: judged,
    retro: true,
    note: `Share = ${int(hits.length)} retro ÷ ${plural(judged.length, 'job and pay change')}.`,
  })
}

/** Every job and pay change in a group, retro ones first. */
export function changesDrill(
  s: DrillScope,
  changes: readonly TxFact[] | null | undefined,
  title: string,
  subtitle?: string,
): DrillSpec<'transactions'> | null {
  const judged = (changes ?? []).filter((f) => f.retro != null)
  return txDrill(s, judged, {
    title,
    subtitle,
    retro: true,
    order: firstWhere((f: TxFact) => f.retro === true),
  })
}

/* ───────────── service levels ───────────── */

export type LevelPart = 'actual' | 'n' | 'misses'

/**
 * The records behind a scorecard number: the judged rows with their outcome ('actual', 'n'),
 * or only the misses. The retro share lists its retro adjustments for 'actual'.
 */
export function levelDrill(s: DrillScope, row: LevelRow, part: LevelPart): DrillSpec | null {
  const rec = row.records
  if (!rec || row.n == null) return null
  const name = `${row.measure} (${row.processId})`
  if (rec.kind === 'transactions') {
    if (row.id === 'ds01-retro-share')
      return part === 'n'
        ? changesDrill(s, rec.rows, `Job and pay changes due (${row.processId})`)
        : retroDrill(s, rec.rows, `Retro adjustments (${row.processId})`)
    const exitType = row.id === 'of05-final-pay'
    return part === 'misses'
      ? txOutcomeDrill(s, rec.rows, isLateTx, `Missed: ${name}`, { exitType })
      : onTimeDrill(s, rec.rows, name, { exitType })
  }
  const clock = row.clock
  if (!clock) {
    // A day measure (ER-02): its cases are employee relations, never listed.
    const pick = part === 'misses' ? new Set(row.misses) : null
    return caseDrill(s, pick ? rec.rows.filter((f) => pick.has(f.caseId)) : rec.rows, {
      title: part === 'misses' ? `Missed: ${name}` : name,
      gate: rec.rows,
      timing: true,
    })
  }
  const missed = (f: CaseFact) => clockMet(f, clock, s.asOf) === false
  const hits = rec.rows.length - row.misses.length
  return caseDrill(s, part === 'misses' ? rec.rows.filter(missed) : rec.rows, {
    title: part === 'misses' ? `Missed: ${name}` : name,
    gate: rec.rows,
    clock,
    response: clock.stop === 'responded',
    order: firstWhere(missed),
    note:
      part === 'misses'
        ? `Out of ${plural(rec.rows.length, 'case')} judged on the clock.`
        : `Rate = ${int(hits)} within ${plural(clock.days, 'business day')} ÷ ${plural(rec.rows.length, 'case')} judged (stopped, or still open past the clock).`,
  })
}

/* ───────────── sources ───────────── */

/**
 * A drill source only when it will open: the group passes the gate and, for cases, something
 * outside employee relations is left to list. Checked when the number is built, so a link or a
 * button is never offered for nothing.
 */
export function drillWhen<T>(
  s: DrillScope,
  group: readonly (CaseFact | TxFact)[] | null | undefined,
  thunk: () => T,
  /** Rows already listed one by one on screen (the aging list): only the scope gate applies. */
  listed = false,
): (() => T) | undefined {
  if (!group?.length || !(listed ? s.on : canDrill(s, group))) return undefined
  const listable = group.some((f) => !('caseId' in f) || !isRowPrivate(f))
  return listable ? thunk : undefined
}
