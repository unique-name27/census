/**
 * The measures every survey gets (docs/VIEWS.md, Listening): its headline in the latest wave
 * against target, the change since the wave before, the response rate against the invited
 * population, the score of each driver against its target, and the driver heat table across
 * org, location and tenure. Every aggregate goes through `@/lib/surveys`, so a group under the
 * minimum has no numbers.
 */
import type { AnalyticsContext } from '@/data/context'
import type { FieldRef } from '@/data/quality/fieldRef'
import { type ISODate, STAGES, type SurveyResponse, type SurveyType } from '@/data/schema'
import { isActiveAt, type Window } from '@/data/scope'
import { type DrillSpec, drillSpec } from '@/drill/types'
import { addDays } from '@/lib/dates'
import { plural } from '@/lib/format'
import { TENURE_BANDS } from '@/lib/people'
import {
  aggregate,
  breakdown,
  responseRate,
  type SurveyAggregate,
  type WaveInfo,
  wavesOf,
} from '@/lib/surveys'
import type { MetricTarget } from '@/metrics/types'
import { type HeadlineKind, type ProgramMeta, programOf } from './catalog'
import { answersOf, type CutKey, cutOf, type Prepared } from './prepare'
import { type ListeningSettings, managerScoped, type Status, statusOf } from './settings'

/* ───────────── headline ───────────── */

export interface HeadlineValue {
  kind: HeadlineKind
  /** NPS (-100 to 100) or a mean on 1-5; null when hidden or empty. */
  value: number | null
  respondents: number
  suppressed: boolean
  /** No answers on the headline's scale. */
  empty: boolean
}

/** The answers a headline reads: the 0-10 answers for NPS, the 1-5 answers for a mean. */
export const headlineRows = (rows: readonly SurveyResponse[], kind: HeadlineKind): SurveyResponse[] =>
  rows.filter((r) => (kind === 'nps' ? r.scale === '0-10' : r.scale === '1-5'))

export function headlineOf(rows: readonly SurveyResponse[], kind: HeadlineKind, min: number): HeadlineValue {
  const pick = headlineRows(rows, kind)
  const a = aggregate(pick, { min })
  return {
    kind,
    value: kind === 'nps' ? a.nps : a.mean,
    respondents: a.respondents,
    suppressed: a.suppressed && pick.length > 0,
    empty: pick.length === 0,
  }
}

/** Watch margin for a headline kind. */
export const marginOf = (kind: HeadlineKind, s: ListeningSettings): number =>
  kind === 'nps' ? s.watchNps : s.watchMean

/** Material change for a headline kind. */
export const materialOf = (kind: HeadlineKind, s: ListeningSettings): number =>
  kind === 'nps' ? s.materialNps : s.material

/* ───────────── waves ───────────── */

/** The survey's waves that started on or before the as-of date, oldest first. */
export function wavesUpTo(rows: readonly SurveyResponse[], survey: SurveyType, asOf: ISODate): WaveInfo[] {
  return wavesOf(rows, survey).filter((w) => w.start <= asOf)
}

export const inWave = (rows: readonly SurveyResponse[], w: WaveInfo | null): SurveyResponse[] =>
  w ? rows.filter((r) => r.wave === w.wave) : []

/* ───────────── response rate ───────────── */

export interface RateResult {
  invited: number
  /** Invited people who answered; null while the rate is hidden. */
  responded: number | null
  rate: number | null
  /** The invited population can't be worked out for this program. */
  unknown: boolean
  /**
   * Hidden to protect anonymity: fewer invited than the minimum, or only a handful who answered
   * or didn't (`rateHidden` in `@/lib/surveys`), since the invited people can be listed by name.
   */
  suppressed: boolean
  /** The invited people (respondent keys), for the pooled rate. */
  keys: ReadonlySet<string>
}

const inside = (d: string | null | undefined, w: { start: ISODate; end: ISODate }): d is string =>
  !!d && d >= w.start && d <= w.end

/** The date a candidate reached their furthest stage or offer decision (the trigger of the survey). */
export function candidateTrigger(c: {
  status: string
  screenDate?: string | null
  hmDate?: string | null
  onsiteDate?: string | null
  hiredDate?: string | null
  rejectedDate?: string | null
}): string | null {
  if (!c.screenDate) return null
  if (c.status === 'Hired') return c.hiredDate ?? null
  if (c.status === 'Declined') return c.rejectedDate ?? null
  return c.onsiteDate ?? c.hmDate ?? c.screenDate
}

/**
 * Who was invited in the window, when Census can tell: candidates who reached a stage, hiring
 * managers of filled reqs, starters at day 30 or 90, people who left by choice, people whose case
 * was resolved (never employee relations) and people back from leave. Null otherwise.
 */
export function invitedOf(ctx: AnalyticsContext, survey: SurveyType, w: Window): Set<string> | null {
  const d = ctx.data
  const asOf = ctx.asOf
  const end = w.end < asOf ? w.end : asOf
  const win = { start: w.start, end }
  const out = new Set<string>()
  switch (survey) {
    case 'Candidate experience':
      for (const c of d.candidates) if (inside(candidateTrigger(c), win)) out.add(c.applicationId)
      return out
    case 'Hiring manager satisfaction':
      for (const r of d.requisitions)
        if (r.status === 'Filled' && r.hiringManagerId && inside(r.filledDate, win))
          out.add(r.hiringManagerId)
      return out
    case 'Onboarding pulse day 30':
    case 'Onboarding pulse day 90': {
      const days = survey === 'Onboarding pulse day 30' ? 30 : 90
      for (const e of d.employees) {
        if (e.employmentType !== 'Employee') continue
        const at = addDays(e.hireDate, days)
        if (inside(at, win) && isActiveAt(e, at)) out.add(e.employeeId)
      }
      return out
    }
    case 'Exit survey':
      for (const e of d.employees)
        if (
          e.employmentType === 'Employee' &&
          e.terminationType === 'Voluntary' &&
          inside(e.terminationDate, win)
        )
          out.add(e.employeeId)
      return out
    case 'HR service survey':
      for (const c of d.cases)
        if (c.requesterId && c.category !== 'Employee relations' && inside(c.resolvedAt?.slice(0, 10), win))
          out.add(c.requesterId)
      return out
    case 'Return to work':
      for (const t of d.transactions)
        if (t.type === 'Return from leave' && inside(t.effectiveDate, win)) out.add(t.employeeId)
      return out
    default:
      return null
  }
}

/**
 * The records behind a response rate's denominator: the people (or reqs, cases, returns) the
 * survey was sent after in the window. Who answered is never listed.
 */
export function invitedDrill(
  ctx: AnalyticsContext,
  survey: SurveyType,
  w: Window,
  uses?: readonly FieldRef[],
): DrillSpec | null {
  const keys = invitedOf(ctx, survey, w)
  if (!keys) return null
  const end = w.end < ctx.asOf ? w.end : ctx.asOf
  const win = { start: w.start, end }
  const title = `Invited to the ${survey.toLowerCase()}`
  const subtitle = `${w.label} · ${ctx.scopeLabel}`
  const note = 'Everyone the survey was sent after in the period. Who answered is never listed.'
  // The invited count is people; these lists are records, one or more per person.
  const per = (people: string, records: number, one: string, many: string) =>
    `${plural(keys.size, people)} invited, across ${plural(records, one, many)}.`
  const d = ctx.data
  switch (survey) {
    case 'Candidate experience':
      return drillSpec({
        kind: 'candidates',
        title,
        subtitle,
        note,
        uses,
        rows: d.candidates.filter((c) => inside(candidateTrigger(c), win)),
      })
    case 'Hiring manager satisfaction': {
      const rows = d.requisitions.filter(
        (r) => r.status === 'Filled' && !!r.hiringManagerId && inside(r.filledDate, win),
      )
      return drillSpec({
        kind: 'requisitions',
        title: 'Filled reqs whose hiring manager was invited',
        subtitle,
        note: `${per('hiring manager', rows.length, 'filled req', 'filled reqs')} ${note}`,
        uses,
        rows,
      })
    }
    case 'HR service survey': {
      const rows = d.cases.filter(
        (c) =>
          !!c.requesterId && c.category !== 'Employee relations' && inside(c.resolvedAt?.slice(0, 10), win),
      )
      return drillSpec({
        kind: 'cases',
        title: 'Resolved cases whose requester was invited',
        subtitle,
        note: `${per('requester', rows.length, 'resolved case', 'resolved cases')} ${note} Employee relations cases are never surveyed.`,
        uses,
        rows,
      })
    }
    case 'Return to work': {
      const rows = d.transactions.filter(
        (t) => t.type === 'Return from leave' && inside(t.effectiveDate, win),
      )
      return drillSpec({
        kind: 'transactions',
        title: 'Returns from leave invited',
        subtitle,
        note: `${per('returner', rows.length, 'return from leave', 'returns from leave')} ${note}`,
        uses,
        rows,
      })
    }
    default:
      return drillSpec({
        kind: 'employees',
        title,
        subtitle,
        note,
        uses,
        rows: d.employees.filter((e) => keys.has(e.employeeId)),
      })
  }
}

/** How far back an answer may come before its trigger (an exit survey at notice). */
const LEAD_DAYS = 120

/**
 * The response rate over the period: invited people who answered the survey at least once (on
 * or before the as-of date, from a few months before the period so an exit survey at notice
 * counts) ÷ everyone invited. Hidden (null, `suppressed`) under the survey's minimum `min`.
 */
export function rateOf(
  ctx: AnalyticsContext,
  p: Prepared,
  survey: SurveyType,
  w: Window,
  min: number,
): RateResult {
  const invited = invitedOf(ctx, survey, w)
  if (!invited)
    return { invited: 0, responded: 0, rate: null, unknown: true, suppressed: false, keys: new Set() }
  const from = addDays(w.start, -LEAD_DAYS)
  const rows = answersOf(p, survey).filter((r) => r.responseDate >= from)
  const r = responseRate(rows, invited, { min })
  return {
    invited: r.invited,
    responded: r.responded,
    rate: r.rate,
    unknown: false,
    suppressed: r.suppressed,
    keys: invited,
  }
}

/* ───────────── drivers ───────────── */

export interface DriverRow {
  survey: SurveyType
  driver: string
  /** Mean on 1-5 in the latest wave; null when hidden. */
  value: number | null
  respondents: number
  suppressed: boolean
  target: number
  /** Where the target comes from. */
  targetFrom: 'items' | 'default'
  status: Status
  /** The wave before: its mean (null when hidden or missing) and the change. */
  prior: number | null
  delta: number | null
  /** The change clears the material threshold. */
  material: boolean
}

/** Drivers in the order the Survey items sheet lists them for the survey, then by first answer. */
export function driverOrder(p: Prepared, survey: SurveyType, rows: readonly SurveyResponse[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const add = (d: string | null | undefined) => {
    if (d && !seen.has(d)) {
      seen.add(d)
      out.push(d)
    }
  }
  for (const it of p.itemRows) if (!it.survey || it.survey === survey) add(it.driver)
  for (const r of rows) add(r.driver)
  return out.filter((d) => rows.some((r) => r.driver === d))
}

/** A driver's target: the mean of its items' targets in the Survey items sheet, else the default. */
export function driverTarget(
  p: Prepared,
  survey: SurveyType,
  driver: string,
  fallback: number,
): { target: number; from: 'items' | 'default' } {
  const targets = p.itemRows
    .filter(
      (it) =>
        (!it.survey || it.survey === survey) &&
        it.driver === driver &&
        (it.scale ?? '1-5') === '1-5' &&
        typeof it.target === 'number' &&
        Number.isFinite(it.target),
    )
    .map((it) => it.target as number)
  if (!targets.length) return { target: fallback, from: 'default' }
  return { target: targets.reduce((a, b) => a + b, 0) / targets.length, from: 'items' }
}

/**
 * Score by driver in the latest wave against target, with the change since the wave before
 * (none when `compare` is false: a survey about managers in a narrowed scope).
 */
export function driverRows(
  p: Prepared,
  survey: SurveyType,
  latest: readonly SurveyResponse[],
  prior: readonly SurveyResponse[],
  s: ListeningSettings,
  compare = true,
): DriverRow[] {
  const min = s.minOf[survey]
  const cur = latest.filter((r) => r.scale === '1-5')
  const old = prior.filter((r) => r.scale === '1-5')
  const order = driverOrder(p, survey, [...cur, ...old])
  const now = new Map(
    breakdown(cur, (r) => r.driver ?? r.item, { min, keepSmall: true }).groups.map((g) => [g.group, g]),
  )
  const before = new Map(
    breakdown(old, (r) => r.driver ?? r.item, { min, keepSmall: true }).groups.map((g) => [g.group, g]),
  )
  return order
    .filter((d) => now.has(d))
    .map((driver) => {
      const g = now.get(driver) as SurveyAggregate
      const b = before.get(driver)
      const { target, from } = driverTarget(p, survey, driver, s.defaultTarget)
      const t: MetricTarget = { value: target, comparator: '>=' }
      const priorValue = compare && b && !b.suppressed ? b.mean : null
      const delta = g.mean != null && priorValue != null ? g.mean - priorValue : null
      return {
        survey,
        driver,
        value: g.mean,
        respondents: g.respondents,
        suppressed: g.suppressed,
        target,
        targetFrom: from,
        status: statusOf(g.mean, t, s.watchMean),
        prior: priorValue,
        delta,
        material: delta != null && Math.abs(delta) >= s.material - 1e-9,
      }
    })
}

/* ───────────── heat table ───────────── */

export interface HeatCell {
  survey: SurveyType
  driver: string
  group: string
  value: number | null
  respondents: number
  suppressed: boolean
}

export interface Heat {
  cut: CutKey
  drivers: string[]
  groups: string[]
  cells: HeatCell[]
  /** Answers whose respondent could not be joined to a group. */
  unassigned: number
  /** Groups folded into "Other (k)" because they are under the minimum. */
  folded: number
  /** The "Other (k)" column's label, when there is one. */
  other: string | null
}

/** Whether an answer's group label falls in a heat column (its own group, or "Other (k)"). */
export function inHeatColumn(heat: Heat, label: string | null, column: string): boolean {
  if (label == null || label === '') return false
  if (column === heat.other) return !heat.groups.includes(label)
  return label === column
}

const STAGE_ORDER: readonly string[] = STAGES

/**
 * Mean per driver and group over the given answers. Groups are the respondents' groups with at
 * least the minimum; smaller ones fold into "Other (k)". A cell with fewer respondents than the
 * minimum is blank (suppressed).
 */
export function heatOf(
  p: Prepared,
  survey: SurveyType,
  rows: readonly SurveyResponse[],
  cut: CutKey,
  min: number,
): Heat {
  const scored = rows.filter((r) => r.scale === '1-5')
  const key = cutOf(p, cut)
  const overall = breakdown(scored, key, { min })
  const big = new Set(overall.groups.map((g) => g.group))
  const otherLabel = overall.other?.group ?? null
  const groupOf = (r: SurveyResponse): string | null => {
    const g = key(r)
    if (g == null || g === '') return null
    return big.has(g) ? g : otherLabel
  }
  const fixed = cut === 'tenure' ? (TENURE_BANDS as readonly string[]) : cut === 'stage' ? STAGE_ORDER : null
  const groups = [...big]
  if (fixed) groups.sort((a, b) => rank(fixed, a) - rank(fixed, b))
  if (otherLabel) groups.push(otherLabel)
  const drivers = driverOrder(p, survey, scored)
  const by = new Map<string, SurveyResponse[]>()
  for (const r of scored) {
    const g = groupOf(r)
    if (!g) continue
    const k = `${r.driver ?? r.item}\u0001${g}`
    const list = by.get(k)
    if (list) list.push(r)
    else by.set(k, [r])
  }
  const cells: HeatCell[] = []
  for (const driver of drivers)
    for (const group of groups) {
      const a = aggregate(by.get(`${driver}\u0001${group}`) ?? [], { min })
      cells.push({
        survey,
        driver,
        group,
        value: a.mean,
        respondents: a.respondents,
        suppressed: a.suppressed,
      })
    }
  return {
    cut,
    drivers,
    groups,
    cells,
    unassigned: overall.unassigned,
    folded: overall.other?.folded ?? 0,
    other: otherLabel,
  }
}

function rank(order: readonly string[], v: string): number {
  const i = order.indexOf(v)
  return i < 0 ? order.length : i
}

/** The cuts a survey's heat table offers: stage for candidates, tenure for employees. */
export function cutsFor(survey: SurveyType): CutKey[] {
  return programOf.get(survey)?.tab === 'candidates' && survey === 'Candidate experience'
    ? ['businessUnit', 'location', 'stage']
    : ['businessUnit', 'location', 'tenure']
}

/* ───────────── one survey ───────────── */

export interface SurveyModel {
  program: ProgramMeta
  survey: SurveyType
  /** Every answer on or before the as-of date (not shown; feeds the measures). */
  all: readonly SurveyResponse[]
  /** Answers in the period. */
  period: readonly SurveyResponse[]
  waves: WaveInfo[]
  latest: WaveInfo | null
  prior: WaveInfo | null
  latestRows: readonly SurveyResponse[]
  priorRows: readonly SurveyResponse[]
  headline: HeadlineValue
  priorHeadline: HeadlineValue | null
  /** Headline change since the last wave; null when either side is hidden or missing. */
  change: number | null
  /**
   * Whether waves are compared: false for a survey about managers in a narrowed scope, where the
   * wave before could be a smaller cut of the same manager's team (`managerScoped`).
   */
  compare: boolean
  material: boolean
  target: MetricTarget | null
  status: Status
  rate: RateResult
  drivers: DriverRow[]
  /** Heat tables per cut, over the period. */
  heat: Partial<Record<CutKey, Heat>>
  /** Distinct respondents in the period. */
  periodRespondents: number
  min: number
}

export function surveyModel(
  ctx: AnalyticsContext,
  p: Prepared,
  program: ProgramMeta,
  s: ListeningSettings,
): SurveyModel {
  const { survey, headline: kind } = program
  const min = s.minOf[survey]
  const all = answersOf(p, survey)
  const period = all.filter((r) => r.responseDate >= ctx.window.start && r.responseDate <= ctx.window.end)
  const waves = wavesUpTo(all, survey, ctx.asOf)
  const latest = waves.at(-1) ?? null
  const prior = waves.at(-2) ?? null
  const latestRows = inWave(all, latest)
  const priorRows = inWave(all, prior)
  const headline = headlineOf(latestRows, kind, min)
  const compare = !managerScoped(ctx, survey)
  const priorHeadline = prior && compare ? headlineOf(priorRows, kind, min) : null
  const change =
    headline.value != null && priorHeadline?.value != null ? headline.value - priorHeadline.value : null
  const target = s.targetOf[survey]
  const heat: Partial<Record<CutKey, Heat>> = {}
  for (const cut of cutsFor(survey)) heat[cut] = heatOf(p, survey, period, cut, min)
  return {
    program,
    survey,
    all,
    period,
    waves,
    latest,
    prior,
    latestRows,
    priorRows,
    headline,
    priorHeadline,
    change,
    compare,
    material: change != null && Math.abs(change) >= materialOf(kind, s) - 1e-9,
    target,
    status: statusOf(headline.value, target, marginOf(kind, s)),
    rate: rateOf(ctx, p, survey, ctx.window, min),
    drivers: driverRows(p, survey, latestRows, priorRows, s, compare),
    heat,
    periodRespondents: new Set(period.map((r) => r.respondentKey)).size,
    min,
  }
}
