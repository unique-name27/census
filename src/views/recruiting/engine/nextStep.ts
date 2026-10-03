/**
 * The next-step engine, ported from the user's pipeline review tool. "Overdue" means the
 * candidate LACKS A PENDING NEXT STEP, not just a long time in stage:
 *
 *  1. offer-out          the offer is out (Offer stage, offer date on or before the as-of date);
 *  2. scheduled          an interview or event is booked after the as-of date (in motion);
 *  3. awaiting-feedback  the event happened and the stage has not moved since (decision owed);
 *  4. needs-step         nothing is pending: the real alarm.
 *
 * One definition feeds the KPI, the findings, the pipeline bars, the waiting-time dots, the
 * action queue and the copied notes.
 */
import type { ISODate } from '@/data/schema'
import { daysBetween, formatDate } from '@/lib/dates'
import type { ActiveItem, App, NextState, Norms, OwnerRole, Tier } from './types'
import { LAST_OPEN_STAGE } from './types'

/** What the next event at each stage is called, for "{event} scheduled". */
const EVENT_NAME = ['Screen', 'Screen', 'Hiring manager interview', 'Onsite', 'Offer call']
const SCHEDULE_STEP = [
  'Review the application',
  'Schedule the screen',
  'Schedule the hiring manager interview',
  'Schedule the onsite',
  'Send the offer',
]

export interface StepInfo {
  state: NextState
  since: string
}

export function nextStepState(a: App, stage: number, asOf: ISODate): StepInfo {
  const offer = a.dates[LAST_OPEN_STAGE]
  if (stage === LAST_OPEN_STAGE && offer && offer <= asOf) return { state: 'offer-out', since: offer }
  const next = a.nextEventDate
  if (next) {
    if (next > asOf) return { state: 'scheduled', since: a.enteredDate }
    if (a.enteredDate <= next) return { state: 'awaiting-feedback', since: next }
  }
  return { state: 'needs-step', since: a.enteredDate }
}

/** State-appropriate aging tier; any tier means the candidate lacks a timely next step. */
export function agingTier(a: App, stage: number, step: StepInfo, asOf: ISODate, norms: Norms): Tier | null {
  const norm = norms.days[stage] ?? 14
  switch (step.state) {
    case 'scheduled': {
      const away = a.nextEventDate ? daysBetween(asOf, a.nextEventDate) : 0
      return away > 1.5 * norm ? 'amber' : null
    }
    case 'awaiting-feedback': {
      const d = daysBetween(step.since, asOf)
      return d > 5 ? 'red' : d > 2 ? 'amber' : null
    }
    case 'offer-out': {
      const d = daysBetween(step.since, asOf)
      return d > 10 ? 'red' : d > 5 ? 'amber' : null
    }
    case 'needs-step': {
      const d = daysBetween(step.since, asOf)
      return d > 2.5 * norm ? 'red' : d > 1.5 * norm ? 'amber' : null
    }
  }
}

/** The user's sub-state words. */
export function stateLabel(stage: number, state: NextState): string {
  switch (state) {
    case 'scheduled':
      return `${EVENT_NAME[stage] ?? 'Event'} scheduled`
    case 'awaiting-feedback':
      return 'Needs decision'
    case 'offer-out':
      return 'Offer extended'
    case 'needs-step':
      return stage === 0 ? 'Needs review' : stage === LAST_OPEN_STAGE ? 'Offer pending' : 'Needs scheduling'
  }
}

/** Short legend names for the four states. */
export const STATE_NAME: Record<NextState, string> = {
  'needs-step': 'Needs action',
  'awaiting-feedback': 'Needs decision',
  'offer-out': 'Offer extended',
  scheduled: 'Scheduled',
}

/** The next step in neutral, professional words. */
export function nextStepText(a: App, stage: number, state: NextState): string {
  switch (state) {
    case 'scheduled':
      return `${EVENT_NAME[stage] ?? 'Event'} on ${formatDate(a.nextEventDate)}`
    case 'awaiting-feedback':
      return 'Ask the panel for scorecards and a decision'
    case 'offer-out':
      return 'Follow up on the offer'
    case 'needs-step':
      return SCHEDULE_STEP[stage] ?? 'Decide the next step'
  }
}

/**
 * Who owns the next action. Interview decisions belong to the hiring manager (a leader ask),
 * offers and new applications to the recruiter, scheduling to the coordinator; the recruiter is
 * always the fallback.
 */
export function ownerFor(a: App, stage: number, state: NextState): { name: string | null; role: OwnerRole } {
  const recruiter = a.recruiter ? { name: a.recruiter, role: 'Recruiter' as const } : null
  const fallback = recruiter ?? { name: null, role: 'Unassigned' as const }
  if (state === 'awaiting-feedback') {
    return a.hiringManager ? { name: a.hiringManager, role: 'Hiring manager' } : fallback
  }
  if (state === 'offer-out' || stage === 0 || stage === LAST_OPEN_STAGE) return fallback
  return a.coordinator ? { name: a.coordinator, role: 'Coordinator' } : fallback
}

/**
 * Every active application on the as-of date with its state, clock, tier and owner. Without a
 * next-event column every candidate is "needs a next step", as in the original tool.
 */
export function activeItems(apps: readonly App[], asOf: ISODate, norms: Norms): ActiveItem[] {
  const out: ActiveItem[] = []
  for (const a of apps) {
    if (a.outcome !== 'Active') continue
    const stage = Math.min(a.furthest, LAST_OPEN_STAGE)
    const step = nextStepState(a, stage, asOf)
    const tier = agingTier(a, stage, step, asOf, norms)
    const owner = ownerFor(a, stage, step.state)
    out.push({
      app: a,
      stage,
      state: step.state,
      since: step.since,
      days: Math.max(0, daysBetween(step.since, asOf)),
      daysInStage: Math.max(0, daysBetween(a.enteredDate, asOf)),
      tier,
      owner: owner.name,
      ownerRole: owner.role,
      label: stateLabel(stage, step.state),
      nextStep: nextStepText(a, stage, step.state),
    })
  }
  return out
}

/** Candidates in the action queue: lacking a timely next step, minus scheduled ones (in motion). */
export const inQueue = (x: ActiveItem): boolean => x.tier != null && x.state !== 'scheduled'

/** "86 need review, 42 need scheduling, 39 need a decision and 5 offers wait on an answer". */
export function breakdownParts(items: readonly ActiveItem[]): string[] {
  let review = 0
  let sched = 0
  let pending = 0
  let decision = 0
  let offers = 0
  let far = 0
  for (const x of items) {
    if (x.state === 'awaiting-feedback') decision++
    else if (x.state === 'offer-out') offers++
    else if (x.state === 'scheduled') far++
    else if (x.stage === 0) review++
    else if (x.stage === LAST_OPEN_STAGE) pending++
    else sched++
  }
  const parts: string[] = []
  if (review) parts.push(`${review} need${review === 1 ? 's' : ''} review`)
  if (sched) parts.push(`${sched} need${sched === 1 ? 's' : ''} scheduling`)
  if (decision) parts.push(`${decision} need${decision === 1 ? 's' : ''} a decision`)
  if (pending) parts.push(`${pending} offer${pending === 1 ? ' is' : 's are'} not yet sent`)
  if (offers) parts.push(`${offers} offer${offers === 1 ? ' waits' : 's wait'} on an answer`)
  if (far) parts.push(`${far} ${far === 1 ? 'is' : 'are'} scheduled far out`)
  return parts
}

/** "a, b and c" */
export function joinAnd(parts: readonly string[]): string {
  if (parts.length <= 1) return parts.join('')
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}
