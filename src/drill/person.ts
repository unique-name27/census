/**
 * Everything Census knows about one person, for the person card at the end of every drill.
 * Pure; reads the unscoped datasets so the card is complete whatever the filters are.
 */
import type { AnalyticsContext } from '@/data/context'
import { CASE_OPEN_STATUSES, type Employee, type JobChange, LEVEL_LABELS, type Review } from '@/data/schema'
import { isActiveAt, subtreeIds } from '@/data/scope'
import { tenureYears } from '@/lib/people'

export interface PersonSummary {
  employee: Employee
  status: 'Active' | 'Left' | 'Not started'
  levelLabel: string | null
  tenureYears: number
  /** Manager chain from the direct manager up to the top. */
  chain: Employee[]
  directs: Employee[]
  /** Everyone below them who is active at asOf (not counting themselves). */
  orgSize: number
  reviews: Review[]
  jobChanges: JobChange[]
  compaRatio: number | null
  openCases: number
  overdueTraining: number
  successorFor: string[]
}

export function personSummary(
  ctx: Pick<AnalyticsContext, 'org' | 'asOf' | 'all'>,
  employeeId: string,
): PersonSummary | null {
  const e = ctx.org.byId.get(employeeId)
  if (!e) return null
  const chain: Employee[] = []
  const seen = new Set([e.employeeId])
  let m = e.managerId ? ctx.org.byId.get(e.managerId) : undefined
  while (m && !seen.has(m.employeeId) && chain.length < 20) {
    chain.push(m)
    seen.add(m.employeeId)
    m = m.managerId ? ctx.org.byId.get(m.managerId) : undefined
  }
  const directs = (ctx.org.children.get(e.employeeId) ?? []).filter((d) => isActiveAt(d, ctx.asOf))
  let orgSize = 0
  for (const id of subtreeIds(ctx.org, e.employeeId)) {
    const p = ctx.org.byId.get(id)
    if (id !== e.employeeId && p && isActiveAt(p, ctx.asOf)) orgSize++
  }
  const reviews = ctx.all.reviews
    .filter((r) => r.employeeId === employeeId)
    .sort((a, b) => (a.cycleDate < b.cycleDate ? 1 : -1))
  const jobChanges = ctx.all.jobChanges
    .filter((j) => j.employeeId === employeeId)
    .sort((a, b) => (a.effectiveDate < b.effectiveDate ? 1 : -1))
  const comp = ctx.all.comp.find((c) => c.employeeId === employeeId)
  const left = !!e.terminationDate && e.terminationDate <= ctx.asOf
  return {
    employee: e,
    status: left ? 'Left' : isActiveAt(e, ctx.asOf) ? 'Active' : 'Not started',
    levelLabel: e.level ? (LEVEL_LABELS[e.level] ?? e.level) : null,
    tenureYears: tenureYears(e, ctx.asOf),
    chain,
    directs,
    orgSize,
    reviews,
    jobChanges,
    compaRatio: comp && comp.rangeMid > 0 ? comp.baseSalary / comp.rangeMid : null,
    openCases: ctx.all.cases.filter(
      (c) => c.requesterId === employeeId && CASE_OPEN_STATUSES.includes(c.status),
    ).length,
    overdueTraining: ctx.all.learning.filter(
      (l) =>
        l.employeeId === employeeId && l.required && !l.completedDate && !!l.dueDate && l.dueDate < ctx.asOf,
    ).length,
    successorFor: [
      ...new Set(ctx.all.succession.filter((s) => s.successorId === employeeId).map((s) => s.roleTitle)),
    ],
  }
}
