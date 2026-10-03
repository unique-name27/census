/**
 * Workforce shape at asOf and how headcount moved: breakdowns, tenure, worker mix, growth,
 * the 24-month headcount line, hires and exits by month, and the headcount bridge.
 */
import { EMPLOYMENT_TYPES, type Employee, LEVELS } from '@/data/schema'
import { addDays, formatDate, monthKey, monthsBetween } from '@/lib/dates'
import {
  activeAt,
  exitsIn,
  headcountAt,
  hiresIn,
  isActiveAt,
  TENURE_BANDS,
  tenureBand,
  tenureYears,
} from '@/lib/people'
import { mean } from '@/lib/stats'
import { activeWorkers, monthEnds, type Prep } from './base'

export interface CountRow {
  label: string
  headcount: number
  share: number
}

export interface MixRow {
  businessUnit: string
  workerType: string
  people: number
  share: number
}

export interface GrowthRow {
  group: string
  yearAgo: number
  now: number
  change: number
  /** Fractional change; null when the base is under 5 people. */
  growth: number | null
}

export interface HeadcountPoint {
  date: string
  headcount: number
  period: string
}

export interface FlowRow {
  month: string
  series: 'Hires' | 'Exits'
  people: number
}

export interface BridgeRow {
  step: string
  people: number
}

export interface EngineeringShare {
  share: number | null
  engineering: number
  total: number
  rows: { group: string; headcount: number; share: number }[]
}

export interface WorkforceModel {
  headcount: number
  contingent: number
  byDepartment: CountRow[]
  byLocation: CountRow[]
  byBusinessUnit: CountRow[]
  byLevel: CountRow[]
  tenure: CountRow[]
  avgTenure: number | null
  mix: MixRow[]
  growth: GrowthRow[]
  engineering: EngineeringShare
  series: HeadcountPoint[]
  flows: FlowRow[]
  bridge: BridgeRow[]
}

export const WORKER_LABEL: Record<string, string> = {
  Employee: 'Employees',
  Contractor: 'Contractors',
  Intern: 'Interns',
  'Not recorded': 'Type not recorded',
}
export const WORKER_ORDER = ['Employees', 'Contractors', 'Interns', 'Type not recorded']

export const LAST_YEAR = 'Last 12 months'
export const YEAR_BEFORE = '12 months before'
export const NO_LEVEL = 'Not recorded'

/** Engineering disciplines for a fabless chip company, matched on department (or business unit) names. */
const ENGINEERING =
  /engineer|design|verification|validation|firmware|software|silicon|analog|mixed-signal|architecture|\bdft\b|hardware|physical|test & product/i

export const isEngineering = (e: Employee): boolean =>
  ENGINEERING.test(e.department ?? '') || ENGINEERING.test(e.businessUnit ?? '')

function counts(list: readonly Employee[], key: (e: Employee) => string): CountRow[] {
  const m = new Map<string, number>()
  for (const e of list) {
    const k = key(e)
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  const total = list.length
  return [...m.entries()]
    .map(([label, headcount]) => ({ label, headcount, share: total ? headcount / total : 0 }))
    .sort((a, b) => b.headcount - a.headcount || a.label.localeCompare(b.label))
}

export function computeWorkforce(p: Prep): WorkforceModel {
  const { asOf, emps, people, t12 } = p
  const active = activeAt(emps, asOf)
  const yearAgo = addDays(t12.start, -1)

  const levelOrder = new Map<string, number>(LEVELS.map((l, i) => [l, i]))
  const byLevel = counts(active, (e) => e.level ?? NO_LEVEL).sort(
    (a, b) => (levelOrder.get(a.label) ?? 99) - (levelOrder.get(b.label) ?? 99),
  )

  const bands = counts(active, (e) => tenureBand(tenureYears(e, asOf)))
  const tenure = TENURE_BANDS.map(
    (b) => bands.find((r) => r.label === b) ?? { label: b, headcount: 0, share: 0 },
  )

  // Worker mix: every worker type, active today, by business unit.
  const workers = activeWorkers(people, asOf)
  const buTotals = new Map<string, number>()
  const mixCounts = new Map<string, number>()
  for (const w of workers) {
    const type = w.employmentType ?? 'Not recorded'
    buTotals.set(w.businessUnit, (buTotals.get(w.businessUnit) ?? 0) + 1)
    const k = `${w.businessUnit}\u0000${type}`
    mixCounts.set(k, (mixCounts.get(k) ?? 0) + 1)
  }
  const mix: MixRow[] = []
  const types = [...EMPLOYMENT_TYPES, 'Not recorded']
  const bus = [...buTotals.entries()].sort((a, b) => b[1] - a[1]).map(([bu]) => bu)
  for (const bu of bus) {
    for (const t of types) {
      const n = mixCounts.get(`${bu}\u0000${t}`) ?? 0
      if (!n && t === 'Not recorded') continue
      mix.push({
        businessUnit: bu,
        workerType: WORKER_LABEL[t] ?? t,
        people: n,
        share: n / (buTotals.get(bu) ?? 1),
      })
    }
  }

  // Growth by business unit (or department when the scope sits inside one unit).
  const buCount = new Set(active.map((e) => e.businessUnit)).size
  const growthKey = (e: Employee) => (buCount > 1 ? e.businessUnit : e.department)
  const nowBy = new Map<string, number>()
  const thenBy = new Map<string, number>()
  for (const e of emps) {
    if (isActiveAt(e, asOf)) nowBy.set(growthKey(e), (nowBy.get(growthKey(e)) ?? 0) + 1)
    // Today's org attributes at both dates, like the scope itself and the scorecard's net change.
    if (isActiveAt(e, yearAgo)) thenBy.set(growthKey(e), (thenBy.get(growthKey(e)) ?? 0) + 1)
  }
  const growth: GrowthRow[] = [...new Set([...nowBy.keys(), ...thenBy.keys()])]
    .map((group) => {
      const now = nowBy.get(group) ?? 0
      const before = thenBy.get(group) ?? 0
      return {
        group,
        yearAgo: before,
        now,
        change: now - before,
        growth: before >= 5 ? (now - before) / before : null,
      }
    })
    .sort((a, b) => (b.growth ?? -9) - (a.growth ?? -9))

  const eng = active.filter(isEngineering).length
  const engineering: EngineeringShare = {
    share: active.length >= 5 ? eng / active.length : null,
    engineering: eng,
    total: active.length,
    rows: [
      { group: 'Engineering', headcount: eng, share: active.length ? eng / active.length : 0 },
      {
        group: 'Other functions',
        headcount: active.length - eng,
        share: active.length ? (active.length - eng) / active.length : 0,
      },
    ],
  }

  // 25 month-end points: the 12 months before last year, then the last 12 months.
  const pts = monthEnds(asOf, 25)
  const series: HeadcountPoint[] = pts.map((d) => ({
    date: d,
    headcount: headcountAt(emps, d),
    period: d > yearAgo ? LAST_YEAR : YEAR_BEFORE,
  }))

  const months = monthsBetween(t12.start, t12.end)
  const hires = new Map<string, number>()
  const exits = new Map<string, number>()
  for (const e of hiresIn(emps, t12))
    hires.set(monthKey(e.hireDate), (hires.get(monthKey(e.hireDate)) ?? 0) + 1)
  for (const e of exitsIn(emps, t12)) {
    const m = monthKey(e.terminationDate as string)
    exits.set(m, (exits.get(m) ?? 0) + 1)
  }
  const flows: FlowRow[] = months.flatMap((m) => [
    { month: m, series: 'Hires' as const, people: hires.get(m) ?? 0 },
    { month: m, series: 'Exits' as const, people: exits.get(m) ?? 0 },
  ])

  const start = headcountAt(emps, yearAgo)
  const hired = hiresIn(emps, t12).length
  const left = exitsIn(emps, t12).length
  const end = active.length
  const other = end - start - hired + left
  const bridge: BridgeRow[] = [
    { step: `Headcount on ${formatDate(yearAgo)}`, people: start },
    { step: 'Hires', people: hired },
    { step: 'Exits', people: -left },
    ...(other !== 0
      ? [{ step: 'Other changes (conversions, rehires, moves in or out)', people: other }]
      : []),
    { step: `Headcount on ${formatDate(asOf)}`, people: end },
  ]

  return {
    headcount: active.length,
    contingent: workers.length - active.length,
    byDepartment: counts(active, (e) => e.department || 'Not recorded'),
    byLocation: counts(active, (e) => e.location || 'Not recorded'),
    byBusinessUnit: counts(active, (e) => e.businessUnit || 'Not recorded'),
    byLevel,
    tenure,
    avgTenure: active.length >= 5 ? mean(active.map((e) => tenureYears(e, asOf))) : null,
    mix,
    growth,
    engineering,
    series,
    flows,
    bridge,
  }
}
