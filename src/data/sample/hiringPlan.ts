/**
 * The FY2026-27 hiring plan (April 2026 to March 2027), version "FY27 v2": the reforecast
 * approved in July that released the second-half hiring, which is why open requisitions surged
 * in Q3 (Recruiting story 7) and most of the plan's starts fall in Q4 2026.
 *
 * Two shapes in one sheet, as planning tools export them:
 *  - April to September (the months already worked): one row per month, business unit,
 *    department and site with a count, set against the starts that happened. Silicon Engineering
 *    is behind its plan, Go-to-Market ahead of it, everyone else within 10%;
 *  - October to March: one row per planned role (a position ID, title, level and site), linked
 *    to its requisition when there is one: the accepted offers that start then, and every opening
 *    of the open reqs except a few backfills and new reqs opened outside the plan. Silicon
 *    Engineering also has 14 Q4 roles with no open req (9 not opened, 5 on hold), and the other
 *    units plan a few Q1 roles they have not opened yet (count rows).
 */
import {
  type Candidate,
  type Employee,
  type HiringPlanLine,
  type Requisition,
  siteByLocation,
} from '../schema'
import { AS_OF, iso } from './calendar'
import { CORP, deptSpec, GTM, type IcLevel, OPS, SE, SS } from './departments'
import type { Rng } from './prng'
import { roleFor, titleFor } from './titles'

export const PLAN_VERSION = 'FY27 v2'
export const PLAN_YEAR = { from: '2026-04-01', to: '2027-03-31' } as const
/** Q4 2026: the quarter the plan ramps in. */
export const PLAN_Q4 = { from: '2026-10-01', to: '2026-12-31' } as const

/** Year-to-date plan as a multiple of the starts that happened, by business unit. */
export const YTD_PLAN_FACTOR: Readonly<Record<string, number>> = {
  [SE]: 1.16,
  [SS]: 1.03,
  [OPS]: 0.97,
  [GTM]: 0.84,
  [CORP]: 1.04,
}

/**
 * Silicon Engineering's Q4 roles with no open requisition: not opened yet ([department, site,
 * level, month]) and on hold. With the accepted offers and open reqs on its other Q4 lines, it is
 * 14 starts behind its Q4 plan.
 */
export const SE_NOT_OPENED: readonly (readonly [string, string, IcLevel, string])[] = [
  ['Design Verification', 'Bengaluru', 'L3', '2026-11-01'],
  ['Design Verification', 'Bengaluru', 'L4', '2026-11-01'],
  ['Design Verification', 'San Jose', 'L4', '2026-12-01'],
  ['Design Verification', 'Hsinchu', 'L3', '2026-12-01'],
  ['Physical Design', 'Austin', 'L4', '2026-11-01'],
  ['Physical Design', 'Bengaluru', 'L3', '2026-12-01'],
  ['Architecture', 'San Jose', 'L5', '2026-12-01'],
  ['DFT', 'Bengaluru', 'L3', '2026-10-01'],
  ['Digital Design', 'Haifa', 'L4', '2026-12-01'],
]
export const SE_ON_HOLD_LINES = 5

/** Open reqs left off the plan: backfills (listed on their own) and new reqs opened outside it. */
export const OFF_PLAN = { backfills: 9, newReqs: 3 } as const

/** Q1 2027 roles the other business units plan but have not opened: [department, site, count, month]. */
export const Q1_NOT_OPENED: readonly (readonly [string, string, number, string])[] = [
  ['Software', 'Seattle', 2, '2027-01-01'],
  ['Software', 'Bengaluru', 3, '2027-02-01'],
  ['Firmware', 'Toronto', 1, '2027-02-01'],
  ['Systems Validation', 'Shanghai', 2, '2027-03-01'],
  ['Test & Product Engineering', 'Ho Chi Minh City', 2, '2027-01-01'],
  ['Quality & Reliability', 'Shanghai', 1, '2027-03-01'],
  ['Sales', 'Munich', 2, '2027-01-01'],
  ['Field Applications', 'Bengaluru', 1, '2027-02-01'],
  ['Product Marketing', 'San Jose', 1, '2027-03-01'],
  ['Finance', 'San Jose', 1, '2027-01-01'],
  ['People', 'Bengaluru', 1, '2027-02-01'],
]

const monthOf = (d: string): string => `${d.slice(0, 7)}-01`
const clampMonth = (d: string): string =>
  monthOf(d < PLAN_Q4.from ? PLAN_Q4.from : d > PLAN_YEAR.to ? PLAN_YEAR.to : d)

interface Cell {
  period: string
  businessUnit: string
  department: string
  location: string
  n: number
}

export function hiringPlanRows(
  employees: readonly Employee[],
  requisitions: readonly Requisition[],
  candidates: readonly Candidate[],
  rng: Rng,
): HiringPlanLine[] {
  const asOf = iso(AS_OF)
  const lines: HiringPlanLine[] = []

  /* April to September: counts against the starts that happened. */
  const cells = new Map<string, Cell>()
  const cellOf = (period: string, businessUnit: string, department: string, location: string) => {
    const k = `${period}|${businessUnit}|${department}|${location}`
    let c = cells.get(k)
    if (!c) {
      c = { period, businessUnit, department, location, n: 0 }
      cells.set(k, c)
    }
    return c
  }
  for (const e of employees) {
    if (e.employmentType !== 'Employee' || e.hireDate < PLAN_YEAR.from || e.hireDate > asOf) continue
    if (!(e.businessUnit in YTD_PLAN_FACTOR)) continue
    cellOf(monthOf(e.hireDate), e.businessUnit, e.department, e.location).n++
  }
  const months = ['2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01']
  for (const [unit, factor] of Object.entries(YTD_PLAN_FACTOR)) {
    const mine = [...cells.values()].filter((c) => c.businessUnit === unit)
    const actual = mine.reduce((a, c) => a + c.n, 0)
    let delta = Math.round(actual * factor) - actual
    // Behind: roles planned in the slowest-to-fill departments that did not start. Ahead: starts
    // that came earlier than planned, taken off the busiest cells.
    const slow =
      unit === SE
        ? ['Design Verification', 'Analog & Mixed-Signal', 'Architecture', 'Physical Design']
        : [...new Set(mine.map((c) => c.department))]
    while (delta > 0) {
      const dept = rng.pick(slow)
      const site = rng.pickPair(deptSpec(dept).sites)
      cellOf(rng.pick(months), unit, dept, site).n++
      delta--
    }
    while (delta < 0) {
      const busiest = mine
        .filter((c) => c.n > 0)
        .sort((a, b) => b.n - a.n || a.period.localeCompare(b.period))
      busiest[rng.int(0, Math.min(4, busiest.length - 1))].n--
      delta++
    }
  }
  for (const c of [...cells.values()].sort(
    (a, b) =>
      a.period.localeCompare(b.period) ||
      a.businessUnit.localeCompare(b.businessUnit) ||
      a.department.localeCompare(b.department) ||
      a.location.localeCompare(b.location),
  ))
    if (c.n > 0)
      lines.push({
        period: c.period,
        businessUnit: c.businessUnit,
        department: c.department,
        plannedHires: c.n,
        location: c.location,
        level: null,
        jobTitle: null,
        reqType: null,
        reqId: null,
        positionId: null,
        planVersion: PLAN_VERSION,
      })

  /* October to March: one line per planned role. */
  const roles: HiringPlanLine[] = []
  const role = (
    period: string,
    r: Pick<Requisition, 'businessUnit' | 'department' | 'location' | 'level' | 'jobTitle' | 'reqType'>,
    reqId: string | null,
  ) =>
    roles.push({
      period,
      businessUnit: r.businessUnit,
      department: r.department,
      plannedHires: 1,
      location: r.location,
      level: r.level,
      jobTitle: r.jobTitle,
      reqType: r.reqType,
      reqId,
      positionId: null,
      planVersion: PLAN_VERSION,
    })
  const reqs = new Map(requisitions.map((r) => [r.reqId, r]))
  // Accepted offers that start in the plan year after the as-of date.
  for (const c of candidates) {
    if (c.status !== 'Hired' || !c.startDate || c.startDate <= asOf || c.startDate > PLAN_YEAR.to) continue
    const r = reqs.get(c.reqId)!
    role(monthOf(c.startDate), r, r.reqId)
  }
  // Open reqs, one line per opening, in their target start month.
  const open = requisitions.filter((r) => r.status === 'Open')
  const offPlan = new Set<string>([
    ...rng
      .sample(
        open.filter((r) => r.businessUnit !== SE && r.reqType === 'Backfill'),
        OFF_PLAN.backfills,
      )
      .map((r) => r.reqId),
    ...rng
      .sample(
        open.filter((r) => (r.businessUnit === GTM || r.businessUnit === OPS) && r.reqType === 'New'),
        OFF_PLAN.newReqs,
      )
      .map((r) => r.reqId),
  ])
  for (const r of open) {
    if (offPlan.has(r.reqId)) continue
    const period = clampMonth(r.targetStartDate ?? r.openedDate)
    for (let k = 0; k < r.openings; k++) role(period, r, r.reqId)
  }
  // Silicon Engineering's Q4 roles with no open req.
  for (const [dept, site, level, period] of SE_NOT_OPENED) {
    const drawn = roleFor(deptSpec(dept), level, rng)
    role(
      period,
      {
        businessUnit: SE,
        department: dept,
        location: site,
        level: drawn.level,
        jobTitle: titleFor(drawn.track, drawn.level),
        reqType: 'New',
      },
      null,
    )
  }
  const onHold = requisitions
    .filter((r) => r.status === 'On hold' && r.businessUnit === SE)
    .slice(0, SE_ON_HOLD_LINES)
  onHold.forEach((r, i) => {
    role(['2026-10-01', '2026-11-01', '2026-12-01'][i % 3], r, r.reqId)
  })
  // Position IDs in period order, as the planning tool numbers its lines.
  roles.sort(
    (a, b) =>
      a.period.localeCompare(b.period) ||
      a.businessUnit.localeCompare(b.businessUnit) ||
      a.department.localeCompare(b.department) ||
      (a.reqId ?? '~').localeCompare(b.reqId ?? '~') ||
      (a.location ?? '').localeCompare(b.location ?? ''),
  )
  roles.forEach((r, i) => {
    r.positionId = `POS-${27001 + i}`
  })
  lines.push(...roles)

  // The other units' Q1 roles they have not opened yet, as counts.
  for (const [dept, site, n, period] of Q1_NOT_OPENED) {
    const spec = deptSpec(dept)
    if (!siteByLocation.has(site)) continue
    lines.push({
      period,
      businessUnit: spec.bu,
      department: dept,
      plannedHires: n,
      location: site,
      level: null,
      jobTitle: null,
      reqType: 'New',
      reqId: null,
      positionId: null,
      planVersion: PLAN_VERSION,
    })
  }
  return lines
}
