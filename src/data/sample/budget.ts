/**
 * The FY2026-27 headcount and cost budget (April 2026 to March 2027), version "FY27 budget":
 * one line per month and cost center, approved in March, before the July reforecast of the hiring
 * plan. It is built last, from its own stream, on top of the finished company, so no other number
 * in the sample moves.
 *
 * Each cost center's budgeted headcount runs in a straight line from its headcount on 31 Mar 2026
 * to its September target, and on at the same pace to March 2027. Its monthly cost is that
 * headcount at the cost center's target cash per head today (within 0.3%), plus the contractors
 * the budget pays for, at the range midpoint of their level and location (`midpointRates`, the
 * estimate actual against budget uses).
 *
 * Planted (README, "Finance"):
 *  - Silicon Engineering is under its headcount budget in every month, 10 under at 30 Sep 2026:
 *    the open seats are in Bengaluru, where it is behind its hiring plan. Yet it is over its cost
 *    budget: the budget pays for no contractors in Silicon Engineering, and its 29 contractors cost
 *    more than the 10 open seats save.
 *  - Go-to-Market was budgeted to hold flat and absorb attrition, 4 fewer heads in September than
 *    in March, but it backfilled and hired ahead of its plan: over its headcount budget in every
 *    month, 8 over at 30 Sep 2026, and over on cost with it.
 *  - Everyone else is within 1% on headcount and 0.5% on cost at 30 Sep 2026: Systems & Software
 *    1 under, Corporate 1 over, Operations and the Executive Office on it, with a few cost centers
 *    a head above or below.
 */
import { annualTargetCashUsd, midpointRates } from '@/lib/budget'
import { monthEnd } from '@/lib/dates'
import type { BudgetLine, CompRecord, Employee } from '../schema'
import { isActiveAt, isEmployee } from '../scope'
import { AS_OF, iso } from './calendar'
import { CORP, GTM, SE, SS } from './departments'
import type { Rng } from './prng'

const AS_OF_ISO = iso(AS_OF)

export const BUDGET_VERSION = 'FY27 budget'
/** The budget's months: April 2026 to March 2027. */
export const BUDGET_MONTHS: readonly string[] = [
  '2026-04',
  '2026-05',
  '2026-06',
  '2026-07',
  '2026-08',
  '2026-09',
  '2026-10',
  '2026-11',
  '2026-12',
  '2027-01',
  '2027-02',
  '2027-03',
]
/** The headcount the budget starts from: the day before the fiscal year. */
export const BUDGET_BASE_DATE = '2026-03-31'
/** September, the month of the as-of date: the sixth budget month. */
const TARGET_MONTH = 6

/** Silicon Engineering's open seats at 30 Sep 2026, by cost center (Bengaluru, behind its plan). */
export const SE_OPEN_SEATS: Readonly<Record<string, number>> = {
  '1130-BLR': 5,
  '1140-BLR': 3,
  '1160-BLR': 2,
}
/** Go-to-Market's budget: its March headcount, less 4 by September (attrition not backfilled). */
export const GTM_DRIFT = -4
/** Headcount budgeted beside today's at the business unit level, for the units with no story. */
export const UNIT_NET: Readonly<Record<string, number>> = { [SS]: 1, [CORP]: -1 }

const MONTH_ENDS = ['2026-03', ...BUDGET_MONTHS.slice(0, TARGET_MONTH)].map((m) => monthEnd(`${m}-01`))

interface Center {
  costCenter: string
  businessUnit: string
  department: string
  /** Employees on 31 Mar 2026 and on 30 Sep 2026. */
  start: number
  now: number
  /** Target cash per head today, USD a year; null when nobody in it is costed. */
  perHead: number | null
  /** Contractors active today at the midpoint estimate, USD a year. */
  contractors: number
}

const majority = (votes: Map<string, number>): string =>
  [...votes].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]

function centersOf(employees: readonly Employee[], comp: readonly CompRecord[]): Center[] {
  const compById = new Map(comp.map((c) => [c.employeeId, c]))
  const rate = midpointRates({ employees, comp }, AS_OF_ISO)
  const units = new Map<string, Map<string, number>>()
  const depts = new Map<string, Map<string, number>>()
  const vote = (m: Map<string, Map<string, number>>, k: string, v: string) => {
    const c = m.get(k) ?? new Map<string, number>()
    c.set(v, (c.get(v) ?? 0) + 1)
    m.set(k, c)
  }
  const inYear = new Set<string>()
  for (const e of employees) {
    if (!e.costCenter) continue
    vote(units, e.costCenter, e.businessUnit)
    vote(depts, e.costCenter, e.department)
    if (MONTH_ENDS.some((d) => isActiveAt(e, d))) inYear.add(e.costCenter)
  }
  const out = new Map<string, Center>()
  for (const cc of [...inYear].sort()) {
    out.set(cc, {
      costCenter: cc,
      businessUnit: majority(units.get(cc) as Map<string, number>),
      department: majority(depts.get(cc) as Map<string, number>),
      start: 0,
      now: 0,
      perHead: null,
      contractors: 0,
    })
  }
  const cash = new Map<string, { sum: number; n: number }>()
  for (const e of employees) {
    const c = e.costCenter ? out.get(e.costCenter) : undefined
    if (!c) continue
    if (isEmployee(e)) {
      if (isActiveAt(e, BUDGET_BASE_DATE)) c.start++
      if (isActiveAt(e, AS_OF_ISO)) {
        c.now++
        const r = compById.get(e.employeeId)
        const usd = r ? annualTargetCashUsd(r) : null
        if (usd != null) {
          const t = cash.get(c.costCenter) ?? { sum: 0, n: 0 }
          t.sum += usd
          t.n++
          cash.set(c.costCenter, t)
        }
      }
    } else if (e.employmentType === 'Contractor' && isActiveAt(e, AS_OF_ISO)) {
      c.contractors += rate(e.level, e.location) ?? 0
    }
  }
  for (const c of out.values()) {
    const t = cash.get(c.costCenter)
    c.perHead = t?.n ? t.sum / t.n : null
  }
  return [...out.values()]
}

/** September targets: today's headcount, moved by each unit's story. */
function targetsOf(centers: readonly Center[], rng: Rng): Map<string, number> {
  const target = new Map<string, number>()
  const byUnit = new Map<string, Center[]>()
  for (const c of centers) {
    const list = byUnit.get(c.businessUnit) ?? []
    list.push(c)
    byUnit.set(c.businessUnit, list)
  }
  for (const [bu, list] of byUnit) {
    const big = [...list].sort((a, b) => b.now - a.now || a.costCenter.localeCompare(b.costCenter))
    if (bu === SE) {
      for (const c of list) target.set(c.costCenter, c.now + (SE_OPEN_SEATS[c.costCenter] ?? 0))
      continue
    }
    if (bu === GTM) {
      // Flat from March, less the attrition it planned not to backfill, in its largest cost centers.
      for (const c of list) target.set(c.costCenter, c.start)
      for (let i = 0; i < -GTM_DRIFT; i++) {
        const c = big[i % big.length]
        target.set(c.costCenter, (target.get(c.costCenter) ?? 0) - 1)
      }
      continue
    }
    for (const c of list) target.set(c.costCenter, c.now)
    // A head above in one cost center and below in another that pays about the same (within
    // 10%), so the unit's headcount and cost both hold.
    const swappable = big.filter((c) => c.now >= 10 && c.perHead != null)
    const used = new Set<string>()
    let pairs = 0
    for (const up of rng.shuffle([...swappable])) {
      if (pairs >= 2) break
      if (used.has(up.costCenter)) continue
      const down = swappable.find(
        (d) =>
          d !== up &&
          !used.has(d.costCenter) &&
          Math.abs((d.perHead as number) / (up.perHead as number) - 1) <= 0.1,
      )
      if (!down) continue
      used.add(up.costCenter)
      used.add(down.costCenter)
      target.set(up.costCenter, (target.get(up.costCenter) ?? 0) + 1)
      target.set(down.costCenter, (target.get(down.costCenter) ?? 0) - 1)
      pairs++
    }
    // The unit's own difference sits in its lowest-paid large cost center, so its cost holds.
    const net = UNIT_NET[bu] ?? 0
    const cheapest = [...swappable].sort((a, b) => (a.perHead as number) - (b.perHead as number))[0]
    if (net && cheapest) target.set(cheapest.costCenter, (target.get(cheapest.costCenter) ?? 0) + net)
  }
  return target
}

const round100 = (n: number) => Math.round(n / 100) * 100

/** The budget lines, by month, then cost center. */
export function budgetRows(
  employees: readonly Employee[],
  comp: readonly CompRecord[],
  rng: Rng,
): BudgetLine[] {
  const centers = centersOf(employees, comp)
  const target = targetsOf(centers, rng)
  const unitCash = new Map<string, { sum: number; n: number }>()
  for (const c of centers) {
    if (c.perHead == null) continue
    const t = unitCash.get(c.businessUnit) ?? { sum: 0, n: 0 }
    t.sum += c.perHead * c.now
    t.n += c.now
    unitCash.set(c.businessUnit, t)
  }
  const plan = centers.map((c) => {
    const unit = unitCash.get(c.businessUnit)
    const perHead = c.perHead ?? (unit?.n ? unit.sum / unit.n : 0)
    return {
      c,
      to: target.get(c.costCenter) ?? c.now,
      perHead: perHead * (1 + rng.float(-0.003, 0.003)),
      // Silicon Engineering's budget pays for no contractors; every other unit budgets today's.
      contractors: c.businessUnit === SE ? 0 : c.contractors,
    }
  })
  const out: BudgetLine[] = []
  BUDGET_MONTHS.forEach((month, i) => {
    const k = i + 1
    for (const p of plan) {
      const headcount = Math.max(0, Math.round(p.c.start + ((p.to - p.c.start) * k) / TARGET_MONTH))
      out.push({
        period: `${month}-01`,
        businessUnit: p.c.businessUnit,
        department: p.c.department,
        costCenter: p.c.costCenter,
        budgetHeadcount: headcount,
        budgetCost: round100((headcount * p.perHead + p.contractors) / 12),
        currency: 'USD',
        planVersion: BUDGET_VERSION,
      })
    }
  })
  return out
}
