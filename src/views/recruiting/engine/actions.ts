/**
 * The Recruiting view for the Scorecard and the Action center (docs/VIEWS.md, view contract):
 *
 *  - `recruitingSummary(ctx)`: median time to fill, offer acceptance and hires vs plan (Onboarding's
 *    plan number, `../plan.ts`), with the readout. Read from the memoized models, so a visit to
 *    the view and the Scorecard share them.
 *  - `recruitingActions(ctx)`: the action queue's next steps, one item per candidate (interview
 *    decisions owned by the hiring manager first, scheduling by the coordinator, reviews and
 *    offers by the recruiter, the recruiter as the fallback), plus empty-funnel reqs for their
 *    recruiter.
 *
 * Wording follows the recruiting tone rules: `what` describes the state ("Scorecards and a
 * decision are not in for the onsite on 12 Sep"), `note` is a polite ask ("Could you ask the
 * panel to submit scorecards ..."), never chase, push, nag or similar. Pure: no React.
 */
import type { AnalyticsContext } from '@/data/context'
import type { ISODate } from '@/data/schema'
import { addDays, formatDate } from '@/lib/dates'
import { type OwnerLookup, ownerLookup } from '../../hrbp/engine/owners'
import type { ActionItem, ActionOwnerRole, ViewSummary } from '../../types'
import { HIRES_VS_PLAN, overviewKpis } from '../plan'
import type { RecruitingBase } from './base'
import { candidateDrill, reqRowDrill } from './drills'
import { computeRecruiting } from './index'
import { NEXT_STEP, OPEN_REQ, OWNER, REQ_JOIN, STAGE_REACHED, uses } from './lineage'
import { inQueue } from './nextStep'
import { tierSeverity } from './pipeline'
import type { OpenReqRow } from './reqs'
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
export const UNASSIGNED_OWNER = 'Recruiting team'

/** The step each stage waits for, in lower case for sentences. */
const STEP_NOUN = ['application review', 'screen', 'hiring manager interview', 'onsite', 'offer']
/** Stage keys for item ids, so scheduling the screen and the onsite are separate items. */
const STAGE_KEY = ['applied', 'screen', 'hiring-manager', 'onsite', 'offer']

const short = (d: string) => formatDate(d).replace(/ \d{4}$/, '')
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const days = (n: number) => `${n} d`

/** The fields every candidate item reads: its next-step state and who owns it. */
const QUEUE_USES = uses(NEXT_STEP, OWNER)
/** An empty funnel: an open req, how long it has been open, and how far its candidates got. */
const FUNNEL_USES = uses(OPEN_REQ, REQ_JOIN, STAGE_REACHED, ['requisitions.recruiter'])

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

function describe(x: ActiveItem): { what: string; note: string } {
  const name = x.app.name
  const noun = STEP_NOUN[x.stage] ?? 'next step'
  switch (stepKind(x)) {
    case 'decision':
      return {
        what: `Scorecards and a decision are not in for the ${noun} on ${short(x.since)}`,
        note: `Could you ask the panel to submit scorecards for ${name} and make a decision this week?`,
      }
    case 'offer-answer':
      return {
        what: `Offer out since ${short(x.since)} with no answer yet, ${days(x.days)}`,
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

function candidateItem(b: RecruitingBase, x: ActiveItem, look: OwnerLookup): ActionItem {
  const a = x.app
  const { what, note } = describe(x)
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
  }
}

function funnelItem(b: RecruitingBase, row: OpenReqRow, look: OwnerLookup): ActionItem {
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
  }
}

/**
 * Open items: every candidate in the action queue (lacking a timely next step, scheduled ones
 * left out because they are in motion) and every empty-funnel req. Overdue first, then by due date.
 */
export function recruitingActions(ctx: AnalyticsContext): ActionItem[] {
  const b = computeRecruiting(ctx).base
  const look = ownerLookup(ctx.all.employees, b.asOf)
  const items = [
    ...b.actives.filter(inQueue).map((x) => candidateItem(b, x, look)),
    ...b.req.emptyFunnel.map((r) => funnelItem(b, r, look)),
  ]
  const rank = { critical: 0, warning: 1, info: 2, good: 3 } as const
  return items.sort(
    (x, y) =>
      rank[x.severity] - rank[y.severity] ||
      (x.due ?? '').localeCompare(y.due ?? '') ||
      x.id.localeCompare(y.id),
  )
}
