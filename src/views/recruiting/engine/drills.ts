/**
 * The records behind every recruiting number, as specs for the shared drill panel: applications
 * (kind `candidates`, with the measure that matters as extra columns) and requisitions. Pure; the
 * UI and the KPI/finding builders pass these as thunks, so rows are only gathered on click.
 *
 * Hidden numbers stay hidden: a bucket whose rate or median is suppressed (n < 5) carries no
 * records, and every builder returns null for an empty list, so nothing opens.
 *
 * Candidates are not employees, so their rows only open a person card when the application links
 * to the roster: a hire who has started (same name, start date on or after the offer was
 * accepted), or an internal applicant (same name, employed when they applied).
 */
import type { Column } from '@/charts/types'
import type { Candidate, Employee, ISODate, Requisition } from '@/data/schema'
import { STAGES } from '@/data/schema'
import type { Window } from '@/data/scope'
import { isActiveAt } from '@/data/scope'
import { PERSON_KEY } from '@/drill/records'
import { type DrillSpec, drillSpec } from '@/drill/types'
import { daysBetween, formatDate, formatMonth, quarterStart } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import { median } from '@/lib/stats'
import type { RecruitingBase } from './base'
import {
  type FlowKind,
  flowMembers,
  leftProcess,
  measuredTransitions,
  TRANSITIONS,
  type TransitionEvent,
} from './flow'
import { TIER_WORD } from './pipeline'
import { isOpenAt } from './prepare'
import { type OpenReqRow, reqAge, ttfDays } from './reqs'
import { acceptance, daysToHire } from './sources'
import { type ActiveItem, type App, HIRED, LAST_OPEN_STAGE, type Outcome } from './types'

type Span = Pick<Window, 'start' | 'end'>

/* ───────── wording ───────── */

const lower = (s: string) => s.toLowerCase()
const stageWord = (i: number) => lower(STAGES[i] ?? 'Applied')
const days = (v: number | null) => fmt(v != null ? Math.round(v) : null, 'days')

/** "1 Oct 2025 to 30 Sep 2026" */
export const rangeText = (w: Span): string => `${formatDate(w.start)} to ${formatDate(w.end)}`
/** "1 Oct 2025 to 30 Sep 2026 · Whole company" */
export const windowSub = (b: RecruitingBase, w: Span = b.window): string =>
  `${rangeText(w)} · ${b.scopeLabel}`
/** "On 30 Sep 2026 · Whole company" */
export const asOfSub = (b: RecruitingBase): string => `On ${formatDate(b.asOf)} · ${b.scopeLabel}`
/** "Applications received 1 Oct 2025 to 30 Sep 2026 · Whole company" */
export const cohortSub = (b: RecruitingBase, w: Span = b.window): string =>
  `Applications received ${rangeText(w)} · ${b.scopeLabel}`

/* ───────── roster links ───────── */

/** A hire starts at most this many days after accepting (the longest notice periods are ~95 d). */
export const LINK_MAX_DAYS = 200

const normName = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()
const nameIndex = new WeakMap<readonly Employee[], Map<string, Employee[]>>()

function rosterByName(roster: readonly Employee[]): Map<string, Employee[]> {
  let m = nameIndex.get(roster)
  if (!m) {
    m = new Map()
    for (const e of roster) {
      if (!e.name) continue
      const k = normName(e.name)
      const arr = m.get(k)
      if (arr) arr.push(e)
      else m.set(k, [e])
    }
    nameIndex.set(roster, m)
  }
  return m
}

/**
 * The roster employee an application became or already was: a hire who started within
 * LINK_MAX_DAYS of accepting (the nearest start date wins; the req's department breaks a tie), or
 * an internal applicant employed on the day they applied. Null otherwise: an external candidate
 * who was not hired never matches an employee by name alone.
 */
export function rosterLink(a: App, roster: readonly Employee[]): Employee | null {
  const list = rosterByName(roster).get(normName(a.name))
  if (!list) return null
  if (a.outcome === 'Hired' && a.exitDate) {
    let best: Employee | null = null
    let bestGap = Number.POSITIVE_INFINITY
    for (const e of list) {
      if (!e.hireDate || e.hireDate < a.exitDate) continue
      const gap = daysBetween(a.exitDate, e.hireDate)
      if (gap > LINK_MAX_DAYS) continue
      const better =
        gap < bestGap ||
        (gap === bestGap && e.department === a.department && best?.department !== a.department)
      if (better) {
        best = e
        bestGap = gap
      }
    }
    if (best) return best
  }
  if (a.source === 'Internal') return list.find((e) => isActiveAt(e, a.appliedDate)) ?? null
  return null
}

/* ───────── extra columns ───────── */

interface Extra<R> {
  columns: Column[]
  values: (r: R) => Record<string, unknown>
}
type AppExtra = Extra<App>
type ReqExtra = Extra<Requisition>

const OUTCOME_WORD: Record<Outcome, string> = {
  Active: 'Still active',
  Rejected: 'Rejected',
  Withdrawn: 'Withdrew',
  Declined: 'Declined the offer',
  Hired: 'Hired',
}

/** Furthest stage, outcome on the as-of date and when it happened. */
export const flowExtra: AppExtra = {
  columns: [
    { key: 'furthestStage', label: 'Furthest stage' },
    { key: 'outcome', label: 'Outcome' },
    { key: 'outcomeDate', label: 'Outcome date', format: 'date' },
  ],
  values: (a) => ({
    furthestStage: STAGES[a.furthest] ?? null,
    outcome: OUTCOME_WORD[a.outcome],
    outcomeDate: a.exitDate,
  }),
}

/** Days waiting, next-step state, aging, owner and next step, for active candidates. */
export function waitingExtra(items: readonly ActiveItem[]): AppExtra {
  const by = new Map<App, ActiveItem>()
  for (const x of items) by.set(x.app, x)
  return {
    columns: [
      { key: 'waitingAt', label: 'Waiting at' },
      { key: 'daysWaiting', label: 'Days waiting', format: 'days' },
      { key: 'nextState', label: 'Next-step state' },
      { key: 'aging', label: 'Aging' },
      { key: 'owner', label: 'Owner' },
      { key: 'ownerRole', label: 'Owner role' },
      { key: 'nextStep', label: 'Next step' },
    ],
    values: (a) => {
      const x = by.get(a)
      if (!x) return {}
      return {
        waitingAt: STAGES[x.stage],
        daysWaiting: x.days,
        nextState: x.label,
        aging: x.tier ? TIER_WORD[x.tier] : 'On time',
        owner: x.owner ?? 'Unassigned',
        ownerRole: x.ownerRole,
        nextStep: x.nextStep,
      }
    },
  }
}

/** Where the offer was, whether it was accepted, and when. */
export const offerExtra: AppExtra = {
  columns: [
    { key: 'location', label: 'Location' },
    { key: 'offerOutcome', label: 'Offer outcome' },
    { key: 'resolved', label: 'Resolved', format: 'date' },
  ],
  values: (a) => ({
    location: a.location,
    offerOutcome: a.outcome === 'Hired' ? 'Accepted' : a.outcome === 'Declined' ? 'Declined' : null,
    resolved: a.exitDate,
  }),
}

/** When the offer was accepted and how long the hire took. */
export const hireExtra: AppExtra = {
  columns: [
    { key: 'accepted', label: 'Offer accepted', format: 'date' },
    { key: 'daysToHire', label: 'Days to hire', format: 'days' },
  ],
  values: (a) => ({ accepted: a.exitDate, daysToHire: daysToHire(a) }),
}

/** The stage a candidate left from, and when. */
export const exitExtra: AppExtra = {
  columns: [
    { key: 'leftAt', label: 'Left at' },
    { key: 'leftOn', label: 'Left on', format: 'date' },
  ],
  values: (a) => ({ leftAt: STAGES[a.furthest] ?? null, leftOn: a.exitDate }),
}

/** The days one step took, and the day it was completed. */
export function stepExtra(steps: readonly { app: App; days: number; end?: string }[], i: number): AppExtra {
  const by = new Map<App, { days: number; end?: string }>()
  for (const s of steps) by.set(s.app, s)
  return {
    columns: [
      { key: 'stepDays', label: `Days, ${lower(TRANSITIONS[i])}`, format: 'days' },
      { key: 'stepDone', label: `Reached ${stageWord(i + 1)}`, format: 'date' },
    ],
    values: (a) => {
      const s = by.get(a)
      return s ? { stepDays: s.days, stepDone: s.end ?? a.dates[i + 1] ?? null } : {}
    },
  }
}

/** Which period an application belongs to, for figures that compare two windows. */
function periodExtra(label: (a: App) => string): AppExtra {
  return { columns: [{ key: 'period', label: 'Period' }], values: (a) => ({ period: label(a) }) }
}

function employeeExtra(links: ReadonlyMap<App, string>): AppExtra {
  return {
    columns: [{ key: 'employeeId', label: 'Employee ID' }],
    // The hidden person key makes the row open the employee's card.
    values: (a) => {
      const id = links.get(a)
      return id ? { employeeId: id, [PERSON_KEY]: id } : { employeeId: null }
    },
  }
}

/** Days to fill, replacing the standard "Days open" (the same number for a filled req). */
export const ttfExtra: ReqExtra = {
  columns: [{ key: 'daysToFill', label: 'Days to fill', format: 'days' }],
  values: (r) => ({ daysToFill: r.filledDate ? ttfDays(r) : null }),
}

/** Active candidates, those lacking a next step and the health of each open req. */
export function reqPipelineExtra(b: RecruitingBase): ReqExtra {
  const by = new Map<string, OpenReqRow>()
  for (const r of b.req.rows) by.set(r.reqId, r)
  return {
    columns: [
      { key: 'activeCandidates', label: 'Active candidates', format: 'int' },
      { key: 'lackingNextStep', label: 'Lacking a next step', format: 'int' },
      { key: 'health', label: 'Health' },
    ],
    values: (r) => {
      const row = by.get(r.reqId)
      return row
        ? { activeCandidates: row.active, lackingNextStep: row.lacking, health: row.health }
        : { activeCandidates: null, lackingNextStep: null, health: null }
    },
  }
}

/* ───────── spec builders ───────── */

/** Standard candidate columns that say nothing about a closed application. */
const HIDE_CLOSED = ['nextEventDate', 'stageEnteredDate']
/** Standard candidate columns that say nothing about an active one. */
const HIDE_ACTIVE = ['rejectionReason']

export interface AppDrillOptions {
  title: string
  subtitle: string
  note?: string
  extras?: readonly AppExtra[]
  hide?: string[]
}

/** Applications as a drill: their candidate rows, extra columns, and links to the roster. */
export function appDrill(
  b: RecruitingBase,
  apps: readonly App[],
  o: AppDrillOptions,
): DrillSpec<'candidates'> | null {
  if (!apps.length) return null
  const byRaw = new Map<Candidate, App>()
  const links = new Map<App, string>()
  for (const a of apps) {
    byRaw.set(a.raw, a)
    const e = rosterLink(a, b.roster)
    if (e) links.set(a, e.employeeId)
  }
  const extras = [...(o.extras ?? []), ...(links.size ? [employeeExtra(links)] : [])]
  return drillSpec({
    kind: 'candidates',
    title: o.title,
    subtitle: o.subtitle,
    note: o.note,
    hide: o.hide,
    rows: apps.map((a) => a.raw),
    extra: extras.length
      ? {
          columns: extras.flatMap((e) => e.columns),
          values: (row: Candidate) => {
            const a = byRaw.get(row)
            return a ? Object.assign({}, ...extras.map((e) => e.values(a))) : {}
          },
        }
      : undefined,
  })
}

/** Active candidates with their wait, state and owner, longest wait first. */
export function activeDrill(
  b: RecruitingBase,
  items: readonly ActiveItem[],
  o: { title: string; subtitle?: string; note?: string },
): DrillSpec<'candidates'> | null {
  const sorted = items.slice().sort((x, y) => y.days - x.days || x.app.name.localeCompare(y.app.name))
  return appDrill(
    b,
    sorted.map((x) => x.app),
    {
      title: o.title,
      subtitle: o.subtitle ?? asOfSub(b),
      note: o.note,
      extras: [waitingExtra(sorted)],
      hide: HIDE_ACTIVE,
    },
  )
}

export interface ReqDrillOptions {
  title: string
  subtitle: string
  note?: string
  extras?: readonly ReqExtra[]
  hide?: string[]
}

/** Requisitions as a drill; each row opens the hiring manager. */
export function reqDrill(reqs: readonly Requisition[], o: ReqDrillOptions): DrillSpec<'requisitions'> | null {
  if (!reqs.length) return null
  const extras = o.extras ?? []
  return drillSpec({
    kind: 'requisitions',
    title: o.title,
    subtitle: o.subtitle,
    note: o.note,
    hide: o.hide,
    rows: reqs,
    extra: extras.length
      ? {
          columns: extras.flatMap((e) => e.columns),
          values: (r: Requisition) => Object.assign({}, ...extras.map((e) => e.values(r))),
        }
      : undefined,
  })
}

const byAge = (asOf: ISODate) => (x: Requisition, y: Requisition) => reqAge(y, asOf) - reqAge(x, asOf)
const byDateDesc = (x: App, y: App) =>
  (y.exitDate ?? '').localeCompare(x.exitDate ?? '') || x.name.localeCompare(y.name)

/** Open reqs, oldest first, with their pipeline. */
export function openReqsDrill(
  b: RecruitingBase,
  reqs: readonly Requisition[],
  title: string,
  note?: string,
): DrillSpec<'requisitions'> | null {
  return reqDrill(reqs.slice().sort(byAge(b.asOf)), {
    title,
    subtitle: asOfSub(b),
    note,
    extras: [reqPipelineExtra(b)],
  })
}

/** Filled reqs with their days to fill (the median is over these). */
export function filledReqsDrill(
  b: RecruitingBase,
  reqs: readonly Requisition[],
  title: string,
  w: Span = b.window,
): DrillSpec<'requisitions'> | null {
  const sorted = reqs.slice().sort((x, y) => ttfDays(y) - ttfDays(x))
  return reqDrill(sorted, {
    title,
    subtitle: windowSub(b, w),
    note: `Median ${days(median(sorted.map(ttfDays)))} to fill over ${plural(sorted.length, 'req')}, from the opened date to the date the offer was accepted.`,
    extras: [ttfExtra],
    hide: ['daysOpen'],
  })
}

/** Hires with the offer-accepted date and days to hire, latest first. */
export function hiresDrill(
  b: RecruitingBase,
  hires: readonly App[],
  title: string,
  o: { subtitle?: string; note?: string } = {},
): DrillSpec<'candidates'> | null {
  return appDrill(b, hires.slice().sort(byDateDesc), {
    title,
    subtitle: o.subtitle ?? windowSub(b),
    note: o.note ?? 'Offers accepted. A hire who has started opens their employee card.',
    extras: [hireExtra],
    hide: HIDE_CLOSED,
  })
}

/** Resolved offers with the outcome; the note names the rate's numerator and denominator. */
export function offersDrill(
  b: RecruitingBase,
  offers: readonly App[],
  title: string,
  subtitle: string,
  only?: 'Hired' | 'Declined',
): DrillSpec<'candidates'> | null {
  const acc = acceptance(offers)
  const n = acc.hired + acc.declined
  const list = (only ? offers.filter((a) => a.outcome === only) : offers).slice().sort(byDateDesc)
  const rate = `Offer acceptance = ${fmt(acc.hired, 'int')} accepted ÷ ${plural(n, 'offer')} resolved (accepted or declined)${acc.rate != null ? `, ${fmt(acc.rate, 'pct')}` : ''}.`
  return appDrill(b, list, {
    title,
    subtitle,
    note: rate,
    extras: [offerExtra],
    hide: HIDE_CLOSED,
  })
}

/* ───────── KPI tiles ───────── */

export function openReqsKpiDrill(b: RecruitingBase): DrillSpec<'requisitions'> | null {
  return openReqsDrill(
    b,
    b.req.open,
    'Open reqs',
    b.req.onHold.length ? `${plural(b.req.onHold.length, 'req')} on hold are not counted.` : undefined,
  )
}

export function hiresKpiDrill(b: RecruitingBase): DrillSpec<'candidates'> | null {
  return hiresDrill(b, b.hires, `Offers accepted, ${b.windowWords}`)
}

export function timeToHireKpiDrill(b: RecruitingBase): DrillSpec<'candidates'> | null {
  return hiresDrill(b, b.hires, `Offers accepted, ${b.windowWords}`, {
    note: `Median ${days(median(b.hires.map(daysToHire)))} from application to offer accepted over ${plural(b.hires.length, 'offer accepted', 'offers accepted')}.`,
  })
}

export function offerAcceptanceKpiDrill(b: RecruitingBase): DrillSpec<'candidates'> | null {
  return offersDrill(b, b.offers, `Offers resolved, ${b.windowWords}`, windowSub(b))
}

export function lackingKpiDrill(b: RecruitingBase): DrillSpec<'candidates'> | null {
  return activeDrill(
    b,
    b.actives.filter((x) => x.tier),
    {
      title: 'Candidates lacking a next step',
      note: `Of ${plural(b.actives.length, 'active candidate')}: no step booked past 1.5× the usual days for the stage, a decision pending more than 2 days, or an offer out more than 5 days.`,
    },
  )
}

/* ───────── KPI comparisons and notes ───────── */

/** The prior period in a title: "in the prior period" (its dates go in the subtitle). */
const PRIOR = 'in the prior period'

/** Reqs open on the comparison date of the open reqs tile, with how long each had been open then. */
export function priorOpenReqsKpiDrill(b: RecruitingBase): DrillSpec<'requisitions'> | null {
  const on = b.prior.end
  const list = b.reqs.filter((r) => isOpenAt(r, on)).sort(byAge(on))
  const change = b.req.open.length - list.length
  return reqDrill(list, {
    title: `Reqs open on ${formatDate(on)}`,
    subtitle: `On ${formatDate(on)} · ${b.scopeLabel}`,
    note: `The comparison for the ${plural(b.req.open.length, 'req')} open on ${formatDate(b.asOf)}: ${change > 0 ? `${fmt(change, 'int')} more` : change < 0 ? `${fmt(-change, 'int')} fewer` : 'the same number'} now.`,
    extras: [
      {
        columns: [{ key: 'daysOpenThen', label: `Days open on ${formatDate(on)}`, format: 'days' }],
        values: (r) => ({ daysOpenThen: reqAge(r, on) }),
      },
    ],
    hide: ['daysOpen'],
  })
}

/** Reqs on hold on the as-of date (the open reqs tile's note: not counted as open). */
export function onHoldKpiDrill(b: RecruitingBase): DrillSpec<'requisitions'> | null {
  return openReqsDrill(b, b.req.onHold, 'Reqs on hold', 'On hold: not counted as open reqs.')
}

export function priorHiresKpiDrill(b: RecruitingBase): DrillSpec<'candidates'> | null {
  return hiresDrill(b, b.hiresPrior, `Offers accepted ${PRIOR}`, {
    subtitle: windowSub(b, b.prior),
    note: `The comparison for the ${plural(b.hires.length, 'offer accepted', 'offers accepted')} ${b.windowWords}.`,
  })
}

export function priorFilledKpiDrill(b: RecruitingBase): DrillSpec<'requisitions'> | null {
  return filledReqsDrill(b, b.filledPrior, `Reqs filled ${PRIOR}`, b.prior)
}

export function priorTimeToHireKpiDrill(b: RecruitingBase): DrillSpec<'candidates'> | null {
  return hiresDrill(b, b.hiresPrior, `Offers accepted ${PRIOR}`, {
    subtitle: windowSub(b, b.prior),
    note: `Median ${days(median(b.hiresPrior.map(daysToHire)))} from application to offer accepted over ${plural(b.hiresPrior.length, 'offer accepted', 'offers accepted')}.`,
  })
}

export function priorOffersKpiDrill(b: RecruitingBase): DrillSpec<'candidates'> | null {
  return offersDrill(b, b.offersPrior, `Offers resolved ${PRIOR}`, windowSub(b, b.prior))
}

/** The accepted offers in the offer acceptance note ("264 of 329 offers accepted"). */
export function acceptedOffersKpiDrill(b: RecruitingBase): DrillSpec<'candidates'> | null {
  return offersDrill(b, b.offers, `Offers accepted, ${b.windowWords}`, windowSub(b), 'Hired')
}

/** Every active candidate (the denominator in the lacking-a-next-step note). */
export function activeKpiDrill(b: RecruitingBase): DrillSpec<'candidates'> | null {
  const lacking = b.actives.filter((x) => x.tier).length
  return activeDrill(b, b.actives, {
    title: 'Active candidates',
    note: `${fmt(lacking, 'int')} of the ${plural(b.actives.length, 'active candidate')} lack a next step. Longest wait first.`,
  })
}

/** Candidate rows whose req ID matches no requisition (the data-join finding). */
export function unmatchedDrill(b: RecruitingBase): DrillSpec<'candidates'> | null {
  if (!b.unmatched.length) return null
  return drillSpec({
    kind: 'candidates',
    title: 'Applications with no matching requisition',
    subtitle: 'All loaded candidates',
    note: `${fmt(b.join.matched, 'int')} of ${plural(b.join.candidates, 'application')} match a requisition ID; these ${fmt(b.unmatched.length, 'int')} do not.`,
    rows: b.unmatched,
  })
}

/* ───────── candidate flow (the river and the conversion table) ───────── */

const FLOW_TITLE: Record<Exclude<FlowKind, 'node' | 'advanced'>, string> = {
  active: 'Still active at',
  rejected: 'Rejected at',
  withdrawn: 'Withdrew at',
  declined: 'Declined the offer at',
  left: 'Left at',
}

/** Title for one part of the river: "Advanced from screen to hiring manager", "Rejected at onsite". */
export function flowTitle(kind: FlowKind, stage: number): string {
  if (kind === 'node')
    return stage === 0 ? 'Applications' : stage === HIRED ? 'Hired' : `Reached ${stageWord(stage)}`
  if (kind === 'advanced') return `Advanced from ${stageWord(stage)} to ${stageWord(stage + 1)}`
  // Offers are only declined at the offer stage, so the stage would repeat the word.
  if (kind === 'declined' && stage === LAST_OPEN_STAGE) return 'Declined the offer'
  return `${FLOW_TITLE[kind]} ${stageWord(stage)}`
}

/** The applications behind one part of the river (a ribbon, a node or a label). */
export function flowDrill(b: RecruitingBase, kind: FlowKind, stage: number): DrillSpec<'candidates'> | null {
  const apps = flowMembers(b.cohort, kind, stage)
  const s = b.flow.stages[stage]
  const note =
    kind === 'advanced' && s
      ? `Pass rate = ${fmt(s.advanced, 'int')} advanced ÷ ${fmt(s.resolved, 'int')} who advanced or left at ${stageWord(stage)}${s.pass != null ? `, ${fmt(s.pass, 'pct')}` : ''}.`
      : kind !== 'node' && kind !== 'advanced' && s
        ? `${fmt(apps.length, 'int')} of the ${plural(s.entered, 'application')} that reached ${stageWord(stage)}.`
        : undefined
  return appDrill(b, apps, {
    title: flowTitle(kind, stage),
    subtitle: cohortSub(b),
    note,
    extras: kind === 'active' ? [flowExtra, waitingExtra(b.actives)] : [flowExtra],
    hide: kind === 'active' ? HIDE_ACTIVE : undefined,
  })
}

/** Everyone in the cohort who left the process (the bottom band). */
export function leftDrill(b: RecruitingBase): DrillSpec<'candidates'> | null {
  return appDrill(b, leftProcess(b.cohort), {
    title: 'Left the process',
    subtitle: cohortSub(b),
    note: 'Rejected, withdrew, or declined an offer.',
    extras: [flowExtra],
    hide: HIDE_CLOSED,
  })
}

/** The candidates measured for a stage's median days to the next stage. */
export function stepDaysDrill(b: RecruitingBase, stage: number): DrillSpec<'candidates'> | null {
  const steps = measuredTransitions(b.cohort, stage).sort((x, y) => y.days - x.days)
  return appDrill(
    b,
    steps.map((s) => s.app),
    {
      title: `${TRANSITIONS[stage]}, applications received ${b.windowWords}`,
      subtitle: cohortSub(b),
      note: `Median ${days(median(steps.map((s) => s.days)))} over ${plural(steps.length, 'candidate')} with both dates.`,
      extras: [stepExtra(steps, stage), flowExtra],
    },
  )
}

/** Both cohorts behind the change in a stage's median days, labeled by period. */
export function stepChangeDrill(b: RecruitingBase, stage: number): DrillSpec<'candidates'> | null {
  const cur = measuredTransitions(b.cohort, stage)
  const prior = measuredTransitions(b.priorCohort, stage)
  const inCur = new Set(cur.map((s) => s.app))
  const all = [...cur, ...prior].sort((x, y) => y.days - x.days)
  return appDrill(
    b,
    all.map((s) => s.app),
    {
      title: `${TRANSITIONS[stage]}, this period and the prior one`,
      subtitle: `${rangeText(b.window)} and ${rangeText(b.prior)} · ${b.scopeLabel}`,
      note: `Median ${days(median(cur.map((s) => s.days)))} this period (${plural(cur.length, 'candidate')}) vs ${days(median(prior.map((s) => s.days)))} in the prior period (${plural(prior.length, 'candidate')}).`,
      extras: [periodExtra((a) => (inCur.has(a) ? 'This period' : 'Prior period')), stepExtra(all, stage)],
    },
  )
}

/** The steps completed in one month for one transition (a heat-map cell). */
export function speedCellDrill(
  b: RecruitingBase,
  cell: { month: string; transition: string; days: number | null; steps: readonly TransitionEvent[] },
): DrillSpec<'candidates'> | null {
  if (cell.days == null || !cell.steps.length) return null
  const i = cell.steps[0].i
  const steps = cell.steps.slice().sort((x, y) => y.days - x.days)
  return appDrill(
    b,
    steps.map((s) => s.app),
    {
      title: `${cell.transition}, completed in ${formatMonth(`${cell.month}-01`)}`,
      subtitle: b.scopeLabel,
      note: `Median ${days(cell.days)} over ${plural(steps.length, 'step')} completed that month.`,
      extras: [stepExtra(steps, i)],
    },
  )
}

/* ───────── sources and offers ───────── */

export type SourceMeasure =
  | 'applications'
  | 'hires'
  | 'hireRate'
  | 'offerAcceptance'
  | 'medianTimeToHire'
  | 'priorApplications'
  | 'change'

/** The applications behind one number of the source table. Hidden rates and medians don't drill. */
export function sourceDrill(
  b: RecruitingBase,
  row: {
    source: string
    applications: number
    hires: number
    hireRate: number | null
    offerAcceptance: number | null
    medianTimeToHire: number | null
    apps: readonly App[]
    priorApps: readonly App[]
  },
  measure: SourceMeasure,
): DrillSpec<'candidates'> | null {
  const s = row.source
  const hired = row.apps.filter((a) => a.furthest === HIRED)
  switch (measure) {
    case 'applications':
      return appDrill(b, row.apps, {
        title: `${s} applications, ${b.windowWords}`,
        subtitle: cohortSub(b),
        note: `${plural(row.applications, 'application')} of ${fmt(b.cohort.length, 'int')} in the period.`,
        extras: [flowExtra],
      })
    case 'priorApplications':
      return appDrill(b, row.priorApps, {
        title: `${s} applications, prior period`,
        subtitle: cohortSub(b, b.prior),
        extras: [flowExtra],
      })
    case 'change': {
      const cur = new Set(row.apps)
      return appDrill(b, [...row.apps, ...row.priorApps], {
        title: `${s} applications, this period and the prior one`,
        subtitle: `${rangeText(b.window)} and ${rangeText(b.prior)} · ${b.scopeLabel}`,
        note: `${fmt(row.apps.length, 'int')} this period vs ${fmt(row.priorApps.length, 'int')} in the prior period.`,
        extras: [periodExtra((a) => (cur.has(a) ? 'This period' : 'Prior period')), flowExtra],
      })
    }
    case 'hires':
    case 'hireRate':
      if (measure === 'hireRate' && row.hireRate == null) return null
      return hiresDrill(b, hired, `${s}: hired, applications received ${b.windowWords}`, {
        subtitle: cohortSub(b),
        note:
          measure === 'hireRate'
            ? `Hire rate = ${fmt(row.hires, 'int')} hired ÷ ${plural(row.applications, 'application')} from ${s}, ${fmt(row.hireRate, 'pct')}.`
            : 'Applications received in the period that ended in an accepted offer, whenever it was accepted.',
      })
    case 'medianTimeToHire':
      if (row.medianTimeToHire == null) return null
      return hiresDrill(b, hired, `${s}: hired, applications received ${b.windowWords}`, {
        subtitle: cohortSub(b),
        note: `Median ${days(row.medianTimeToHire)} from application to offer accepted over ${fmt(hired.length, 'int')} hired.`,
      })
    case 'offerAcceptance': {
      if (row.offerAcceptance == null) return null
      const offers = row.apps.filter((a) => a.outcome === 'Hired' || a.outcome === 'Declined')
      return offersDrill(b, offers, `${s} offers, applications received ${b.windowWords}`, cohortSub(b))
    }
  }
}

/** Applications from one source in one month (a point on the source lines). */
export function sourceMonthDrill(
  b: RecruitingBase,
  row: { month: string; source: string; apps: readonly App[] },
): DrillSpec<'candidates'> | null {
  return appDrill(b, row.apps, {
    title: `${row.source} applications, ${formatMonth(`${row.month}-01`)}`,
    subtitle: b.scopeLabel,
    extras: [flowExtra],
  })
}

/** Offers in one group (location or quarter); hidden groups carry no records and don't drill. */
export function groupOffersDrill(
  b: RecruitingBase,
  apps: readonly App[],
  title: string,
  subtitle: string,
  only?: 'Hired' | 'Declined',
): DrillSpec<'candidates'> | null {
  return apps.length ? offersDrill(b, apps, title, subtitle, only) : null
}

/** Declined offers for one reason. */
export function declineReasonDrill(
  b: RecruitingBase,
  row: { reason: string; apps: readonly App[] },
  total: number,
): DrillSpec<'candidates'> | null {
  return appDrill(b, row.apps.slice().sort(byDateDesc), {
    title: `Offers declined: ${lower(row.reason)}`,
    subtitle: windowSub(b),
    note: `${plural(row.apps.length, 'declined offer')} of ${fmt(total, 'int')} in the period.`,
    extras: [offerExtra],
    hide: HIDE_CLOSED,
  })
}

/** Rejections or withdrawals for one reason, at one stage or all. */
export function exitReasonDrill(
  b: RecruitingBase,
  apps: readonly App[],
  outcome: 'Rejected' | 'Withdrawn',
  reason: string,
  stage?: string,
): DrillSpec<'candidates'> | null {
  const verb = outcome === 'Rejected' ? 'Rejected' : 'Withdrew'
  return appDrill(b, apps.slice().sort(byDateDesc), {
    title: `${verb}: ${lower(reason)}${stage ? `, at ${lower(stage)}` : ''}`,
    subtitle: windowSub(b),
    extras: [exitExtra],
    hide: HIDE_CLOSED,
  })
}

/** Hires in one month (a column of hires by month). */
export function hiresMonthDrill(
  b: RecruitingBase,
  row: { month: string; apps: readonly App[] },
): DrillSpec<'candidates'> | null {
  return hiresDrill(b, row.apps, `Offers accepted, ${formatMonth(`${row.month}-01`)}`, {
    subtitle: b.scopeLabel,
  })
}

/* ───────── requisitions ───────── */

/** Reqs opened or filled in one month; `series` limits it to one of the two. */
export function reqMonthDrill(
  b: RecruitingBase,
  month: string,
  opened: readonly Requisition[],
  filled: readonly Requisition[],
  series?: 'Opened' | 'Filled',
): DrillSpec<'requisitions'> | null {
  const o = new Set(opened)
  const f = new Set(filled)
  const list =
    series === 'Opened' ? opened : series === 'Filled' ? filled : [...new Set([...opened, ...filled])]
  const when = formatMonth(`${month}-01`)
  return reqDrill(list, {
    title: series ? `Reqs ${lower(series)}, ${when}` : `Reqs opened or filled, ${when}`,
    subtitle: b.scopeLabel,
    extras: [
      {
        columns: [{ key: 'inMonth', label: `In ${when}` }],
        values: (r) => ({
          inMonth: o.has(r) && f.has(r) ? 'Opened and filled' : o.has(r) ? 'Opened' : 'Filled',
        }),
      },
    ],
  })
}

/** Reqs whose age falls in a histogram bin [x0, x1). */
export function ageBinDrill(
  b: RecruitingBase,
  reqs: readonly Requisition[],
  x0: number,
  x1: number,
): DrillSpec<'requisitions'> | null {
  return openReqsDrill(b, reqs, `Open reqs open ${fmt(x0, 'int')} to ${fmt(x1, 'int')} days`)
}

export type ReqRowMeasure =
  | 'req'
  | 'applied'
  | 'screen'
  | 'hiringManagerStage'
  | 'onsite'
  | 'offer'
  | 'lacking'
  | 'health'
const STAGE_OF: Record<Exclude<ReqRowMeasure, 'req' | 'lacking' | 'health'>, number> = {
  applied: 0,
  screen: 1,
  hiringManagerStage: 2,
  onsite: 3,
  offer: 4,
}

/**
 * One open req, its active candidates at a stage, those lacking a next step, or what its health
 * says: an empty funnel lists the candidates still waiting (none past the screen, or the req
 * itself when nobody is active), "3 lack a next step" lists those three.
 */
export function reqRowDrill(
  b: RecruitingBase,
  row: OpenReqRow,
  measure: ReqRowMeasure,
): DrillSpec<'requisitions' | 'candidates'> | null {
  const name = row.title ? `${row.reqId} ${row.title}` : row.reqId
  if (measure === 'req') return openReqsDrill(b, [row.req], name)
  if (measure === 'health' && row.health === 'Empty funnel')
    return row.items.length
      ? activeDrill(b, row.items, {
          title: `${name}: active candidates, none past the screen`,
          note: `Open ${fmt(row.daysOpen, 'int')} days and no candidate has reached the hiring manager stage.`,
        })
      : openReqsDrill(
          b,
          [row.req],
          name,
          'No active candidates, and none has reached the hiring manager stage.',
        )
  if (measure === 'lacking' || measure === 'health')
    return activeDrill(
      b,
      row.items.filter((x) => x.tier),
      { title: `${name}: candidates lacking a next step` },
    )
  const stage = STAGE_OF[measure]
  return activeDrill(
    b,
    row.items.filter((x) => x.stage === stage),
    { title: `${name}: active at ${stageWord(stage)}` },
  )
}

export type RecruiterMeasure = 'openReqs' | 'active' | 'hires' | 'medianWait' | 'lacking'

/** The records behind one number of the recruiter load table. */
export function recruiterDrill(
  b: RecruitingBase,
  row: {
    recruiter: string
    medianWait: number | null
    openList: readonly Requisition[]
    activeList: readonly ActiveItem[]
    hireList: readonly App[]
  },
  measure: RecruiterMeasure,
): DrillSpec<'requisitions' | 'candidates'> | null {
  const who = row.recruiter
  switch (measure) {
    case 'openReqs':
      return openReqsDrill(b, row.openList, `Open reqs, ${who}`)
    case 'active':
      return activeDrill(b, row.activeList, { title: `Active candidates, ${who}` })
    case 'medianWait':
      return activeDrill(b, row.activeList, {
        title: `Active candidates, ${who}`,
        note: `Median ${days(row.medianWait)} in the current stage over ${plural(row.activeList.length, 'candidate')}.`,
      })
    case 'lacking':
      return activeDrill(
        b,
        row.activeList.filter((x) => x.tier),
        { title: `Candidates lacking a next step, ${who}` },
      )
    case 'hires':
      return hiresDrill(b, row.hireList, `Offers accepted, ${who}, ${b.windowWords}`)
  }
}

/** Filled reqs in one group of a time-to-fill chart; hidden medians carry no records. */
export function ttfGroupDrill(
  b: RecruitingBase,
  row: { group: string; filled: readonly Requisition[] },
): DrillSpec<'requisitions'> | null {
  return row.filled.length
    ? filledReqsDrill(b, row.filled, `Reqs filled, ${row.group}, ${b.windowWords}`)
    : null
}

/* ───────── live pipeline and the action queue ───────── */

/** One segment of "Pipeline today": the candidates at a stage in one next-step state. */
export function pipelineCellDrill(
  b: RecruitingBase,
  cell: { stage: string; label: string; items: readonly ActiveItem[]; lacking: number },
): DrillSpec<'candidates'> | null {
  return activeDrill(b, cell.items, {
    title: `${cell.stage}, ${lower(cell.label)}`,
    note: cell.lacking
      ? `${plural(cell.lacking, 'candidate')} of these ${cell.lacking === 1 ? 'lacks' : 'lack'} a next step (Aging: Watch or Overdue).`
      : 'None of these is past the usual time.',
  })
}

/** Every active candidate at a stage, or only those lacking a next step. */
export function pipelineStageDrill(
  b: RecruitingBase,
  s: { stage: string; items: readonly ActiveItem[]; medianDaysInStage: number | null },
  lackingOnly = false,
): DrillSpec<'candidates'> | null {
  if (lackingOnly)
    return activeDrill(
      b,
      s.items.filter((x) => x.tier),
      { title: `${s.stage}, lacking a next step` },
    )
  return activeDrill(b, s.items, {
    title: `Active at ${lower(s.stage)}`,
    note:
      s.medianDaysInStage != null
        ? `Median ${days(s.medianDaysInStage)} in stage over ${plural(s.items.length, 'candidate')}.`
        : undefined,
  })
}

/** Every active candidate in one next-step state, all stages (a legend count). */
export function nextStateDrill(
  b: RecruitingBase,
  state: ActiveItem['state'],
  name: string,
): DrillSpec<'candidates'> | null {
  return activeDrill(
    b,
    b.actives.filter((x) => x.state === state),
    { title: `${name}, all stages` },
  )
}

/** One owner's queue: everything they own, or only the overdue items. */
export function queueOwnerDrill(
  b: RecruitingBase,
  g: { owner: string; items: readonly ActiveItem[] },
  overdueOnly = false,
): DrillSpec<'candidates'> | null {
  return activeDrill(b, overdueOnly ? g.items.filter((x) => x.tier === 'red') : g.items, {
    title: overdueOnly ? `Overdue next steps owned by ${g.owner}` : `Next steps owned by ${g.owner}`,
  })
}

/** One active candidate (a queue row or a waiting-time dot). */
export function candidateDrill(b: RecruitingBase, x: ActiveItem): DrillSpec<'candidates'> | null {
  return activeDrill(b, [x], { title: `${x.app.name}, ${lower(STAGES[x.stage])}` })
}

/** Everyone in the cohort with one outcome, all stages (a river legend count). */
export function outcomeDrill(
  b: RecruitingBase,
  kind: 'active' | 'rejected' | 'withdrawn' | 'declined',
): DrillSpec<'candidates'> | null {
  const outcome: Outcome =
    kind === 'active'
      ? 'Active'
      : kind === 'rejected'
        ? 'Rejected'
        : kind === 'withdrawn'
          ? 'Withdrawn'
          : 'Declined'
  const apps = b.cohort.filter((a) => a.outcome === outcome && a.furthest < HIRED)
  const title: Record<typeof kind, string> = {
    active: 'Still active',
    rejected: 'Rejected',
    withdrawn: 'Withdrew',
    declined: 'Declined the offer',
  }
  return appDrill(b, apps, {
    title: title[kind],
    subtitle: cohortSub(b),
    extras: kind === 'active' ? [flowExtra, waitingExtra(b.actives)] : [flowExtra],
    hide: kind === 'active' ? HIDE_ACTIVE : HIDE_CLOSED,
  })
}

/** Offers resolved in one quarter (a point on offer acceptance by quarter). */
export function quarterOffersDrill(
  b: RecruitingBase,
  q: { label: string; end: string; apps: readonly App[] },
  only?: 'Hired' | 'Declined',
): DrillSpec<'candidates'> | null {
  const what =
    only === 'Hired' ? 'Offers accepted' : only === 'Declined' ? 'Offers declined' : 'Offers resolved'
  return groupOffersDrill(
    b,
    q.apps,
    `${what}, ${q.label}`,
    windowSub(b, { start: quarterStart(q.end), end: q.end }),
    only,
  )
}

/** Offers resolved at one location (a bar of offer acceptance by location). */
export function locationOffersDrill(
  b: RecruitingBase,
  row: { group: string; apps: readonly App[] },
  w: Span,
  only?: 'Hired' | 'Declined',
): DrillSpec<'candidates'> | null {
  const what =
    only === 'Hired' ? 'Offers accepted' : only === 'Declined' ? 'Offers declined' : 'Offers resolved'
  return groupOffersDrill(b, row.apps, `${what}, ${row.group}`, windowSub(b, w), only)
}
