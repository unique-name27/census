/**
 * The Recruiting view for the Scorecard and the Action center (docs/VIEWS.md, view contract):
 *
 *  - `recruitingSummary(ctx)`: median time to fill, offer acceptance and hires vs plan (Onboarding's
 *    plan number, `../plan.ts`), with the readout. Read from the memoized models, so a visit to
 *    the view and the Scorecard share them.
 *  - `recruitingActions(ctx)`: the action queue's next steps, one item per candidate (interview
 *    decisions owned by the hiring manager first, scheduling by the coordinator, reviews and
 *    offers by the recruiter, the recruiter as the fallback), plus empty-funnel reqs and reqs past
 *    their time-to-fill target for their recruiter. No candidate item sits on a req that is on
 *    hold, cancelled, filled or closed on the as-of date, or is about an application with no
 *    activity for longer than the `staleDays` setting (docs/ACTION-CENTER-AUDIT.md 4.2): a record
 *    nobody closed, which the action queue on Pipeline still lists.
 *
 * Wording follows the recruiting tone rules: `what` describes the state ("Scorecards and a
 * decision are not in for the onsite on 12 Sep"), `note` is a polite ask ("Could you ask the
 * panel to submit scorecards ..."), never chase, push, nag or similar. A date in `what` keeps its
 * year unless it is in the as-of year. Pure: no React.
 */
import type { AnalyticsContext } from '@/data/context'
import type { ISODate } from '@/data/schema'
import { addDays, dateWords, daysBetween, isCalendarDate } from '@/lib/dates'
import { median } from '@/lib/stats'
import { type OwnerLookup, ownerLookup } from '../../hrbp/engine/owners'
import { placeOf, TEAM_OWNER } from '../../hrbp/engine/places'
import type { ActionItem, ActionOwnerRole, ViewSummary } from '../../types'
import { RM } from '../metrics'
import { HIRES_VS_PLAN, overviewKpis } from '../plan'
import type { RecruitingBase } from './base'
import { activeDrill, candidateDrill, openReqsDrill, reqRowDrill } from './drills'
import { computeRecruiting } from './index'
import { FILLED_REQ, NEXT_STEP, OPEN_REQ, OWNER, REQ_JOIN, STAGE_REACHED, uses } from './lineage'
import { inQueue } from './nextStep'
import { tierSeverity } from './pipeline'
import { isOpenAt } from './prepare'
import { filledIn, type OpenReqRow } from './reqs'
import { type ActiveItem, LAST_OPEN_STAGE, type OwnerRole } from './types'

/** The three measures the Scorecard judges Recruiting on, in order. */
export const SUMMARY_KPIS = ['time-to-fill', 'offer-acceptance', HIRES_VS_PLAN] as const

export function recruitingSummary(ctx: AnalyticsContext): ViewSummary {
  // The Overview strip's tiles: the engine's, then Hires vs plan from Onboarding's plan engine.
  const kpis = overviewKpis(ctx)
  return {
    kpis: SUMMARY_KPIS.flatMap((id) => kpis.filter((k) => k.id === id)),
    findings: computeRecruiting(ctx).findings,
  }
}

/* ───────── action items ───────── */

const ROLE: Record<OwnerRole, ActionOwnerRole> = {
  Recruiter: 'recruiter',
  Coordinator: 'coordinator',
  'Hiring manager': 'manager',
  Unassigned: 'recruiter',
}

/** Who an item waits on when nobody is named on the req or the application. */
export const UNASSIGNED_OWNER = TEAM_OWNER.recruiting

/** The step each stage waits for, in lower case for sentences. */
const STEP_NOUN = ['application review', 'screen', 'hiring manager interview', 'onsite', 'offer']
/** Stage keys for item ids, so scheduling the screen and the onsite are separate items. */
const STAGE_KEY = ['applied', 'screen', 'hiring-manager', 'onsite', 'offer']

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const days = (n: number) => `${n} d`

/** The fields every candidate item reads: its next-step state, who owns it and when it last moved. */
const QUEUE_USES = uses(NEXT_STEP, OWNER, ['candidates.lastActivityDate'])
/** An empty funnel: an open req, how long it has been open, and how far its candidates got. */
const FUNNEL_USES = uses(OPEN_REQ, REQ_JOIN, STAGE_REACHED, ['requisitions.recruiter'])
/** A req past target: the open req's age, its level, and the fills it is measured against. */
const PAST_TARGET_USES = uses(OPEN_REQ, FILLED_REQ, ['requisitions.level', 'requisitions.recruiter'])

/** The kind of next step, for the item id and its wording. */
function stepKind(x: ActiveItem): string {
  if (x.state === 'awaiting-feedback') return 'decision'
  if (x.state === 'offer-out') return 'offer-answer'
  if (x.stage === 0) return 'review'
  if (x.stage === LAST_OPEN_STAGE) return 'offer'
  return `schedule-${STAGE_KEY[x.stage]}`
}

/** The kind of work, for the Action center's "What is waiting, by kind". */
const KIND: Record<string, string> = {
  decision: 'Interview decision',
  'offer-answer': 'Offer awaiting an answer',
  review: 'Application to review',
  offer: 'Offer to send',
}

/** The day an item turns overdue (red): past it, it is overdue. */
function dueOf(b: RecruitingBase, x: ActiveItem): ISODate {
  const r = b.settings.aging
  switch (x.state) {
    case 'awaiting-feedback':
      return addDays(x.since, r.decisionOverdueDays)
    case 'offer-out':
      return addDays(x.since, r.offerOverdueDays)
    default: {
      const norm = b.norms.days[x.stage] ?? b.settings.norms.fallbackDays
      return addDays(x.since, Math.floor(r.overdue * norm))
    }
  }
}

function describe(x: ActiveItem, asOf: ISODate): { what: string; note: string } {
  const name = x.app.name
  const noun = STEP_NOUN[x.stage] ?? 'next step'
  const when = (d: string) => dateWords(d, asOf)
  switch (stepKind(x)) {
    case 'decision':
      return {
        what: `Scorecards and a decision are not in for the ${noun} on ${when(x.since)}`,
        note: `Could you ask the panel to submit scorecards for ${name} and make a decision this week?`,
      }
    case 'offer-answer':
      return {
        what: `Offer out since ${when(x.since)} with no answer yet, ${days(x.days)}`,
        note: `Would a follow-up call with ${name} about the offer help this week?`,
      }
    case 'review':
      return {
        what: `Application waiting for a first review, ${days(x.daysInStage)} since it arrived`,
        note: `Could you review ${name}'s application this week?`,
      }
    case 'offer':
      return {
        what: `At the offer stage with no offer sent yet, ${days(x.daysInStage)}`,
        note: `Can we get the offer for ${name} out this week?`,
      }
    default:
      return {
        what: `${cap(noun)} not yet scheduled, ${days(x.daysInStage)} waiting`,
        note: `Can we get the ${noun} with ${name} on the calendar this week?`,
      }
  }
}

function candidateItem(
  ctx: AnalyticsContext,
  b: RecruitingBase,
  x: ActiveItem,
  look: OwnerLookup,
): ActionItem {
  const a = x.app
  const { what, note } = describe(x, b.asOf)
  const named = x.owner != null
  return {
    id: `recruiting:${stepKind(x)}:${a.id}`,
    kind: KIND[stepKind(x)] ?? 'Interview to schedule',
    ownerRole: ROLE[named ? x.ownerRole : 'Unassigned'],
    // The hiring manager by the req's ID; a recruiter or coordinator by name when on the roster.
    ownerId: !named ? null : x.ownerRole === 'Hiring manager' ? (a.hiringManagerId ?? null) : look(x.owner),
    ownerName: x.owner ?? UNASSIGNED_OWNER,
    due: dueOf(b, x),
    severity: tierSeverity(x.tier) ?? 'info',
    what,
    subject: {
      kind: 'candidates',
      id: a.id,
      label: `${a.name}${a.title ? `, ${a.title}` : ''} (${a.reqId})`,
    },
    view: 'recruiting',
    tab: 'pipeline',
    drill: () => candidateDrill(b, x),
    note,
    uses: QUEUE_USES,
    place: placeOf(ctx, a),
  }
}

function funnelItem(
  ctx: AnalyticsContext,
  b: RecruitingBase,
  row: OpenReqRow,
  look: OwnerLookup,
): ActionItem {
  const label = row.title ? `${row.reqId} ${row.title}` : row.reqId
  const manager = row.hiringManager ?? 'the hiring manager'
  return {
    id: `recruiting:empty-funnel:${row.reqId}`,
    kind: 'Empty funnel',
    ownerRole: 'recruiter',
    ownerId: look(row.recruiter),
    ownerName: row.recruiter ?? UNASSIGNED_OWNER,
    due: row.req.openedDate ? addDays(row.req.openedDate, b.settings.emptyFunnelDays) : null,
    severity: 'critical',
    what: `No candidate past the screen after ${days(row.daysOpen)} open`,
    subject: { kind: 'requisitions', id: row.reqId, label },
    view: 'recruiting',
    tab: 'requisitions',
    drill: () => reqRowDrill(b, row, 'health'),
    note: `Could we review the sourcing plan for ${label} with ${manager} this week?`,
    uses: FUNNEL_USES,
    place: placeOf(ctx, row.req),
  }
}

/* ───────── reqs past their time-to-fill target ───────── */

/** What a req's age is measured against: the target in force, else its level's median time to fill. */
export interface AgeBar {
  /** Past target once open longer than this many days. */
  past: number
  /** Critical from this many days open. */
  critical: number
  /** The words for the bar in `what`: "the target is 45 d". */
  words: string
}

/**
 * The bar for each level (docs/ROLES-V2.md 5.14): the time-to-fill target in force when there is
 * one (every level), else `agingMultiple` times the median time to fill for the level over the
 * last 12 months (company-wide, 5 or more fills). A level with neither has no bar. Critical past
 * `agingCritical` times the target (or the level's median).
 */
export function ageBars(b: RecruitingBase): (level: string | null) => AgeBar | null {
  const { multiple, critical } = b.settings.pastTarget
  const t = b.metrics.target(RM.timeToFill)
  if (t && Number.isFinite(t.value) && t.value > 0) {
    const bar: AgeBar = {
      past: t.value,
      critical: critical * t.value,
      words: `the target is ${days(Math.round(t.value))}`,
    }
    return () => bar
  }
  const year = { start: addDays(b.asOf, -364), end: b.asOf }
  const byLevel = new Map<string, number[]>()
  for (const r of filledIn(b.companyReqs, year)) {
    if (!r.level) continue
    const arr = byLevel.get(r.level)
    if (arr) arr.push(b.ttf(r))
    else byLevel.set(r.level, [b.ttf(r)])
  }
  const bars = new Map<string, AgeBar>()
  for (const [level, list] of byLevel) {
    if (list.length < b.settings.minGroup) continue
    const m = median(list)
    if (m == null || m <= 0) continue
    bars.set(level, {
      past: multiple * m,
      critical: critical * m,
      words: `the median time to fill for ${level} is ${days(Math.round(m))}`,
    })
  }
  return (level) => (level ? (bars.get(level) ?? null) : null)
}

function pastTargetItem(
  ctx: AnalyticsContext,
  b: RecruitingBase,
  row: OpenReqRow,
  bar: AgeBar,
  look: OwnerLookup,
): ActionItem {
  const label = row.title ? `${row.reqId} ${row.title}` : row.reqId
  const manager = row.hiringManager ?? 'the hiring manager'
  const why = `Open ${days(row.daysOpen)}; ${bar.words}.`
  return {
    id: `recruiting:past-target:${row.reqId}`,
    kind: 'Req past its time-to-fill target',
    ownerRole: 'recruiter',
    ownerId: look(row.recruiter),
    ownerName: row.recruiter ?? UNASSIGNED_OWNER,
    due: addDays(row.req.openedDate, Math.ceil(bar.past)),
    severity: row.daysOpen >= bar.critical ? 'critical' : 'warning',
    what: `Req ${label} has been open ${days(row.daysOpen)}; ${bar.words}`,
    subject: { kind: 'requisitions', id: row.reqId, label },
    view: 'recruiting',
    tab: 'requisitions',
    drill: () =>
      row.items.length
        ? activeDrill(b, row.items, { title: `${label}: active candidates`, note: why })
        : openReqsDrill(b, [row.req], label, `No active candidates. ${why}`),
    note: `Could we review the req with ${manager} this week?`,
    uses: PAST_TARGET_USES,
    closesWhen: 'A filled, closed or on hold status on the req',
    place: placeOf(ctx, row.req),
  }
}

/**
 * Open reqs (not on hold) open longer than their bar; an empty funnel is its own item, so a req
 * is never listed twice.
 */
function pastTargetItems(ctx: AnalyticsContext, b: RecruitingBase, look: OwnerLookup): ActionItem[] {
  const barOf = ageBars(b)
  const empty = new Set(b.req.emptyFunnel.map((r) => r.reqId))
  const out: ActionItem[] = []
  for (const row of b.req.rows) {
    if (empty.has(row.reqId) || row.req.status === 'On hold' || !row.req.openedDate) continue
    const bar = barOf(row.level)
    if (bar && row.daysOpen > bar.past) out.push(pastTargetItem(ctx, b, row, bar, look))
  }
  return out
}

/** The candidate's req is open on the as-of date (an unknown req is kept: nothing says it closed). */
const onOpenReq = (x: ActiveItem, asOf: ISODate): boolean => !x.app.req || isOpenAt(x.app.req, asOf)

/**
 * An application with no activity for more than `staleDays` before the as-of date, by its last
 * activity date. Without one (the column is optional) an application is never stale.
 */
export function isStale(x: Pick<ActiveItem, 'app'>, asOf: ISODate, staleDays: number): boolean {
  const last = x.app.raw.lastActivityDate
  return !!last && isCalendarDate(last) && daysBetween(last, asOf) > staleDays
}

/**
 * Open items: every candidate in the action queue (lacking a timely next step, scheduled ones
 * left out because they are in motion) on a req open on the as-of date, every empty-funnel req,
 * and every req past its time-to-fill target. Overdue first, then by due date.
 */
export function recruitingActions(ctx: AnalyticsContext): ActionItem[] {
  const b = computeRecruiting(ctx).base
  const look = ownerLookup(ctx.all.employees, b.asOf)
  const items = [
    ...b.actives
      .filter((x) => inQueue(x) && onOpenReq(x, b.asOf) && !isStale(x, b.asOf, b.settings.staleDays))
      .map((x) => candidateItem(ctx, b, x, look)),
    ...b.req.emptyFunnel.map((r) => funnelItem(ctx, b, r, look)),
    ...pastTargetItems(ctx, b, look),
  ]
  const rank = { critical: 0, warning: 1, info: 2, good: 3 } as const
  return items.sort(
    (x, y) =>
      rank[x.severity] - rank[y.severity] ||
      (x.due ?? '').localeCompare(y.due ?? '') ||
      x.id.localeCompare(y.id),
  )
}
