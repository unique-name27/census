/**
 * Required training and policy acknowledgments, as a summary that links to where they live:
 *  - required training on time comes from the Talent engine (Talent > Learning owns the figures);
 *  - policy acknowledgments within the allowed business days of the start (5 by default, Atlas
 *    ON-04) come from the onboarding tasks (Onboarding owns the checklist).
 * Compliance shows the two numbers and links; it never copies their charts. Pure.
 */
import type { AnalyticsContext } from '@/data/context'
import type { Employee, ISODate, LearningRecord, OnboardingTask } from '@/data/schema'
import type { Window } from '@/data/scope'
import { addBusinessDays } from '@/lib/dates'
import { buildBase as talentBase } from '@/views/talent/engine/base'
import { computeLearning } from '@/views/talent/engine/learning'
import { rateOf } from './base'
import type { ComplianceSettings } from './settings'

export const POLICY_TASK = 'Policy acknowledgments'

export interface RequiredTraining {
  /** Learning is loaded. */
  loaded: boolean
  /** Learning is loaded with required assignments that carry due dates. */
  available: boolean
  rate: number | null
  due: number
  onTime: number
  /** The required assignments due in the period (the rate's base), for the drill. */
  records: LearningRecord[]
}

export interface PolicyRow {
  task: OnboardingTask
  person: Employee | undefined
  start: ISODate | null
  deadline: ISODate
  onTime: boolean
}

export interface PolicyAcks {
  available: boolean
  judged: PolicyRow[]
  onTime: PolicyRow[]
  rate: number | null
}

export interface TrainingModel {
  required: RequiredTraining
  policy: PolicyAcks
}

export function requiredTraining(ctx: AnalyticsContext): RequiredTraining {
  if (!ctx.data.learning.length)
    return { loaded: false, available: false, rate: null, due: 0, onTime: 0, records: [] }
  const learning = computeLearning(talentBase(ctx))
  return {
    loaded: true,
    available: learning.hasDueDates,
    rate: learning.current.rate,
    due: learning.current.due,
    onTime: learning.current.onTime,
    records: learning.records.due,
  }
}

export function policyAcks(
  ctx: Pick<AnalyticsContext, 'asOf' | 'data' | 'all' | 'org'>,
  window: Pick<Window, 'start' | 'end'>,
  s: Pick<ComplianceSettings, 'policyDays' | 'minGroup'>,
): PolicyAcks {
  const asOf = ctx.asOf
  const tasks = ctx.data.onboardingTasks.filter((t) => t.task === POLICY_TASK && t.status !== 'Not needed')
  if (!tasks.length) return { available: false, judged: [], onTime: [], rate: null }
  const starts = new Map<string, ISODate>()
  for (const c of ctx.all.candidates) if (c.startDate) starts.set(c.applicationId, c.startDate)
  const end = window.end < asOf ? window.end : asOf
  const judged: PolicyRow[] = []
  for (const t of tasks) {
    const person = t.employeeId ? ctx.org.byId.get(t.employeeId) : undefined
    const start = person?.hireDate ?? (t.applicationId ? (starts.get(t.applicationId) ?? null) : null)
    const deadline = start ? addBusinessDays(start, s.policyDays) : (t.dueDate ?? null)
    if (!deadline || deadline < window.start || deadline > end) continue
    judged.push({
      task: t,
      person,
      start,
      deadline,
      onTime: !!t.completedDate && t.completedDate <= deadline,
    })
  }
  judged.sort((a, b) => Number(a.onTime) - Number(b.onTime) || a.deadline.localeCompare(b.deadline))
  const onTime = judged.filter((x) => x.onTime)
  return { available: true, judged, onTime, rate: rateOf(onTime.length, judged.length, s.minGroup) }
}

export function computeTraining(ctx: AnalyticsContext, s: ComplianceSettings): TrainingModel {
  return { required: requiredTraining(ctx), policy: policyAcks(ctx, ctx.window, s) }
}
