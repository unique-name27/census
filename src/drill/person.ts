/**
 * Everything Census knows about one person, for the person card at the end of every drill.
 * Pure; reads the unscoped datasets so the card is complete whatever the filters are.
 */
import { personInLock } from '@/access/records'
import type { AnalyticsContext } from '@/data/context'
import { type Employee, type JobChange, LEVEL_LABELS, type Review } from '@/data/schema'
import { isActiveAt, isEmployee } from '@/data/scope'
import { tenureYears } from '@/lib/people'
import { activeDirects, activeOrg, openCases, overdueRequired } from './related'

export interface PersonSummary {
  employee: Employee
  status: 'Active' | 'Left' | 'Not started'
  levelLabel: string | null
  tenureYears: number
  /** Manager chain from the direct manager up to the top. */
  chain: Employee[]
  directs: Employee[]
  /** Everyone below them who is active at asOf (not counting themselves), contractors and interns included. */
  orgSize: number
  /** The contractors and interns among them (headcount elsewhere counts employees only). */
  orgContingent: number
  reviews: Review[]
  jobChanges: JobChange[]
  compaRatio: number | null
  /** Open HR cases they raised, employee relations left out (never tied to a named person). */
  openCases: number
  overdueTraining: number
  successorFor: string[]
  /**
   * Manager mode, someone outside the manager's org (a recruiter, the manager's own manager): the
   * card shows name, title, department and "Outside … org" only, and every list here is empty.
   */
  outside?: boolean
  /** Manager mode, someone in the org: no compa-ratio and no open HR cases count (docs/ROLES.md, 3.12). */
  limited?: boolean
}

export function personSummary(
  ctx: Pick<AnalyticsContext, 'org' | 'asOf' | 'all'> & Partial<Pick<AnalyticsContext, 'access'>>,
  employeeId: string,
): PersonSummary | null {
  const e = ctx.org.byId.get(employeeId)
  if (!e) return null
  const left = !!e.terminationDate && e.terminationDate <= ctx.asOf
  const status: PersonSummary['status'] = left ? 'Left' : isActiveAt(e, ctx.asOf) ? 'Active' : 'Not started'
  const levelLabel = e.level ? (LEVEL_LABELS[e.level] ?? e.level) : null
  if (!personInLock(employeeId, ctx.access))
    return {
      employee: e,
      status,
      levelLabel,
      tenureYears: tenureYears(e, ctx.asOf),
      chain: [],
      directs: [],
      orgSize: 0,
      orgContingent: 0,
      reviews: [],
      jobChanges: [],
      compaRatio: null,
      openCases: 0,
      overdueTraining: 0,
      successorFor: [],
      outside: true,
    }
  const limited = !!ctx.access?.lock
  const chain: Employee[] = []
  const seen = new Set([e.employeeId])
  let m = e.managerId ? ctx.org.byId.get(e.managerId) : undefined
  while (m && !seen.has(m.employeeId) && chain.length < 20) {
    chain.push(m)
    seen.add(m.employeeId)
    m = m.managerId ? ctx.org.byId.get(m.managerId) : undefined
  }
  const directs = activeDirects(ctx, e.employeeId)
  const org = activeOrg(ctx, e.employeeId)
  const orgSize = org.length
  const orgContingent = org.filter((p) => !isEmployee(p)).length
  // Manager mode: the manager's own potential, proposed ratings and succession status stay with HR
  // (docs/ROLES.md, 4.5); their final ratings show.
  const lock = ctx.access?.lock
  const self = !!lock && lock.managerId === employeeId
  const reviews = ctx.all.reviews
    .filter((r) => r.employeeId === employeeId)
    .map((r) => (self ? { ...r, potential: null, preCalibrationRating: null } : r))
    .sort((a, b) => (a.cycleDate < b.cycleDate ? 1 : -1))
  const jobChanges = ctx.all.jobChanges
    .filter((j) => j.employeeId === employeeId)
    .sort((a, b) => (a.effectiveDate < b.effectiveDate ? 1 : -1))
  const comp = limited ? undefined : ctx.all.comp.find((c) => c.employeeId === employeeId)
  return {
    employee: e,
    status,
    levelLabel,
    tenureYears: tenureYears(e, ctx.asOf),
    chain,
    directs,
    orgSize,
    orgContingent,
    reviews,
    jobChanges,
    compaRatio: comp && comp.rangeMid > 0 ? comp.baseSalary / comp.rangeMid : null,
    openCases: limited ? 0 : openCases(ctx, employeeId).length,
    overdueTraining: overdueRequired(ctx, employeeId).length,
    // In Manager mode, only roles inside the org other than the manager's own: a plan for a role
    // above the manager, or for theirs, is not the manager's to see.
    successorFor: self
      ? []
      : [
          ...new Set(
            ctx.all.succession
              .filter(
                (s) =>
                  s.successorId === employeeId &&
                  (!lock || (lock.orgIds.has(s.incumbentId) && s.incumbentId !== lock.managerId)),
              )
              .map((s) => s.roleTitle),
          ),
        ],
    ...(limited ? { limited: true } : {}),
  }
}

/**
 * The person card's job line: the job function in its family, "Design Verification, Silicon
 * Engineering family" (docs/TAXONOMY.md: a family contains functions). The word "family" keeps it
 * apart from the org line, where the same words often name the department and business unit.
 */
export function jobLine(e: { jobFunction?: string | null; jobFamily?: string | null }): string {
  const fn = e.jobFunction?.trim()
  const family = e.jobFamily?.trim()
  const fam = family ? `${family} family` : ''
  return fn && fam ? `${fn}, ${fam}` : fn || fam || ''
}
