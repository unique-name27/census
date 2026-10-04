/**
 * Workforce shape at asOf and how headcount moved: breakdowns, tenure, worker mix, growth,
 * the 24-month headcount line, hires and exits by month, and the headcount bridge. Every bucket
 * carries the records it counts, so each number can open the people behind it.
 */
import { EMPLOYMENT_TYPES, type Employee, type ISODate, LEVELS } from '@/data/schema'
import { addDays, addMonths, formatDate, monthEnd, monthKey, monthsBetween } from '@/lib/dates'
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
  /** The employees counted in `headcount`. */
  records: Employee[]
}

export interface MixRow {
  /** Location or business unit. */
  group: string
  workerType: string
  people: number
  /** Share of the group's active workers. */
  share: number
  /** The workers counted in `people`. */
  records: Employee[]
}

/** Active workers of every type by location and by business unit (contractors cluster by site). */
export interface WorkerMix {
  location: MixRow[]
  businessUnit: MixRow[]
}

export interface GrowthRecords {
  /** Employees 12 months ago (`yearAgo`). */
  before: Employee[]
  /** Employees today (`now`). */
  now: Employee[]
  /** Active today and not 12 months ago; empty when growth is hidden (base under 5). */
  joined: Employee[]
  /** Active 12 months ago and not today; empty when growth is hidden. */
  left: Employee[]
}

export interface GrowthRow {
  group: string
  yearAgo: number
  now: number
  change: number
  /** Fractional change; null when the base is under 5 people. */
  growth: number | null
  records: GrowthRecords
}

export interface HeadcountPoint {
  date: string
  headcount: number
  period: string
}

/** A point of the year-over-year chart: the year before is drawn on the same months, a year on. */
export interface OverlayPoint {
  /** Where the point sits on the month axis (the year-earlier line is moved forward 12 months). */
  x: ISODate
  date: ISODate
  headcount: number
  period: string
}

export interface FlowRow {
  month: string
  series: 'Hires' | 'Exits'
  people: number
  /** The employees hired (or who left) in the month. */
  records: Employee[]
}

export type BridgeStep = 'start' | 'hires' | 'exits' | 'other' | 'end'

export interface BridgeRow {
  step: string
  people: number
  key: BridgeStep
  /**
   * The employees behind the step. For "other changes" these are the people on one roster date
   * and not the other without a hire or exit in between (their count need not equal the net).
   */
  records: Employee[]
}

export interface EngineeringShare {
  share: number | null
  engineering: number
  total: number
  /** Engineering and the other functions; no records when the share is hidden (under 5 people). */
  rows: { group: string; headcount: number; share: number; records: Employee[] }[]
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
  mix: WorkerMix
  growth: GrowthRow[]
  engineering: EngineeringShare
  series: HeadcountPoint[]
  overlay: OverlayPoint[]
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
export const YEAR_BEFORE = 'A year earlier'
export const CONTINGENT = ['Contractors', 'Interns'] as const
export const NO_LEVEL = 'Not recorded'

/** Engineering disciplines for a fabless chip company, matched on department (or business unit) names. */
const ENGINEERING =
  /engineer|design|verification|validation|firmware|software|silicon|analog|mixed-signal|architecture|\bdft\b|hardware|physical|test & product/i

export const isEngineering = (e: Employee): boolean =>
  ENGINEERING.test(e.department ?? '') || ENGINEERING.test(e.businessUnit ?? '')

function push<K, V>(m: Map<K, V[]>, k: K, v: V): void {
  const arr = m.get(k)
  if (arr) arr.push(v)
  else m.set(k, [v])
}

/** Worker types per group, all types for every group, groups with the most contractors and interns first. */
function mixBy(workers: readonly Employee[], key: (e: Employee) => string): MixRow[] {
  const totals = new Map<string, number>()
  const contingent = new Map<string, number>()
  const cells = new Map<string, Employee[]>()
  for (const w of workers) {
    const g = key(w) || 'Not recorded'
    const type = w.employmentType ?? 'Not recorded'
    totals.set(g, (totals.get(g) ?? 0) + 1)
    if (type !== 'Employee') contingent.set(g, (contingent.get(g) ?? 0) + 1)
    push(cells, `${g}\u0000${type}`, w)
  }
  const groups = [...totals.keys()].sort(
    (a, b) =>
      (contingent.get(b) ?? 0) - (contingent.get(a) ?? 0) ||
      (totals.get(b) ?? 0) - (totals.get(a) ?? 0) ||
      a.localeCompare(b),
  )
  const types = [...EMPLOYMENT_TYPES, 'Not recorded']
  const out: MixRow[] = []
  for (const g of groups) {
    for (const t of types) {
      const records = cells.get(`${g}\u0000${t}`) ?? []
      const n = records.length
      if (!n && t === 'Not recorded') continue
      out.push({
        group: g,
        workerType: WORKER_LABEL[t] ?? t,
        people: n,
        share: n / (totals.get(g) ?? 1),
        records,
      })
    }
  }
  return out
}

/** The 24-month series as two lines on one 12-month axis: the year before moved forward a year. */
export function yearOverlay(series: readonly HeadcountPoint[]): OverlayPoint[] {
  const ahead = (d: ISODate) => (monthEnd(d) === d ? monthEnd(addMonths(d, 12)) : addMonths(d, 12))
  const before = series.filter((r) => r.period === YEAR_BEFORE)
  const last = series.filter((r) => r.period === LAST_YEAR)
  // The last point of the year before is also where the last 12 months start, so both lines span 12 months.
  const start = before.at(-1)
  return [
    ...before.map((r) => ({ x: ahead(r.date), date: r.date, headcount: r.headcount, period: YEAR_BEFORE })),
    ...(start ? [{ x: start.date, date: start.date, headcount: start.headcount, period: LAST_YEAR }] : []),
    ...last.map((r) => ({ x: r.date, date: r.date, headcount: r.headcount, period: LAST_YEAR })),
  ]
}

function counts(list: readonly Employee[], key: (e: Employee) => string): CountRow[] {
  const m = new Map<string, Employee[]>()
  for (const e of list) push(m, key(e), e)
  const total = list.length
  return [...m.entries()]
    .map(([label, records]) => ({
      label,
      headcount: records.length,
      share: total ? records.length / total : 0,
      records,
    }))
    .sort((a, b) => b.headcount - a.headcount || a.label.localeCompare(b.label))
}

/**
 * People behind the bridge's "other changes": on today's roster without being there a year ago
 * or hired since, or there a year ago (or hired since) and gone today without an exit.
 */
export function otherChanges(
  start: readonly Employee[],
  hired: readonly Employee[],
  exits: readonly Employee[],
  end: readonly Employee[],
): Employee[] {
  const ids = (list: readonly Employee[]) => new Set(list.map((e) => e.employeeId))
  const before = ids([...start, ...hired])
  const after = ids(end)
  const left = ids(exits)
  const seen = new Set<string>()
  const out: Employee[] = []
  for (const e of [...end, ...start, ...hired]) {
    if (seen.has(e.employeeId)) continue
    seen.add(e.employeeId)
    const movedIn = after.has(e.employeeId) && !before.has(e.employeeId)
    const movedOut = before.has(e.employeeId) && !after.has(e.employeeId) && !left.has(e.employeeId)
    if (movedIn || movedOut) out.push(e)
  }
  return out
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
    (b) => bands.find((r) => r.label === b) ?? { label: b, headcount: 0, share: 0, records: [] },
  )

  // Worker mix: every worker type, active today, by site and by business unit.
  const workers = activeWorkers(people, asOf)
  const mix: WorkerMix = {
    location: mixBy(workers, (w) => w.location),
    businessUnit: mixBy(workers, (w) => w.businessUnit),
  }

  // Growth by business unit (or department when the scope sits inside one unit).
  const buCount = new Set(active.map((e) => e.businessUnit)).size
  const growthKey = (e: Employee) => (buCount > 1 ? e.businessUnit : e.department)
  const growthBy = new Map<string, GrowthRecords>()
  for (const e of emps) {
    const isNow = isActiveAt(e, asOf)
    // Today's org attributes at both dates, like the scope itself and the scorecard's net change.
    const wasThen = isActiveAt(e, yearAgo)
    if (!isNow && !wasThen) continue
    const k = growthKey(e)
    let g = growthBy.get(k)
    if (!g) {
      g = { before: [], now: [], joined: [], left: [] }
      growthBy.set(k, g)
    }
    if (isNow) g.now.push(e)
    if (wasThen) g.before.push(e)
    if (isNow && !wasThen) g.joined.push(e)
    if (wasThen && !isNow) g.left.push(e)
  }
  const growth: GrowthRow[] = [...growthBy.entries()]
    .map(([group, records]) => {
      const now = records.now.length
      const before = records.before.length
      const shown = before >= 5
      return {
        group,
        yearAgo: before,
        now,
        change: now - before,
        growth: shown ? (now - before) / before : null,
        // A hidden growth rate has no records behind it.
        records: shown ? records : { ...records, joined: [], left: [] },
      }
    })
    .sort((a, b) => (b.growth ?? -9) - (a.growth ?? -9))

  const engineers = active.filter(isEngineering)
  const eng = engineers.length
  const shareShown = active.length >= 5
  const engineering: EngineeringShare = {
    share: shareShown ? eng / active.length : null,
    engineering: eng,
    total: active.length,
    rows: [
      {
        group: 'Engineering',
        headcount: eng,
        share: active.length ? eng / active.length : 0,
        records: shareShown ? engineers : [],
      },
      {
        group: 'Other functions',
        headcount: active.length - eng,
        share: active.length ? (active.length - eng) / active.length : 0,
        records: shareShown ? active.filter((e) => !isEngineering(e)) : [],
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
  const hiredList = hiresIn(emps, t12)
  const exitList = exitsIn(emps, t12)
  const hires = new Map<string, Employee[]>()
  const exits = new Map<string, Employee[]>()
  for (const e of hiredList) push(hires, monthKey(e.hireDate), e)
  for (const e of exitList) push(exits, monthKey(e.terminationDate as string), e)
  const flows: FlowRow[] = months.flatMap((m) => {
    const h = hires.get(m) ?? []
    const x = exits.get(m) ?? []
    return [
      { month: m, series: 'Hires' as const, people: h.length, records: h },
      { month: m, series: 'Exits' as const, people: x.length, records: x },
    ]
  })

  const startList = activeAt(emps, yearAgo)
  const start = startList.length
  const hired = hiredList.length
  const left = exitList.length
  const end = active.length
  const other = end - start - hired + left
  const bridge: BridgeRow[] = [
    { step: `Headcount on ${formatDate(yearAgo)}`, people: start, key: 'start', records: startList },
    { step: 'Hires', people: hired, key: 'hires', records: hiredList },
    { step: 'Exits', people: -left, key: 'exits', records: exitList },
    ...(other !== 0
      ? [
          {
            step: 'Other changes (conversions, rehires, moves in or out)',
            people: other,
            key: 'other' as const,
            records: otherChanges(startList, hiredList, exitList, active),
          },
        ]
      : []),
    { step: `Headcount on ${formatDate(asOf)}`, people: end, key: 'end', records: active },
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
    overlay: yearOverlay(series),
    flows,
    bridge,
  }
}
