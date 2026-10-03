/**
 * Hand-built rows for the Compensation engine tests. Each builder fills the required fields with
 * plain defaults so a test only states what it is about.
 */
import { buildContext } from '@/data/context'
import {
  type CompRecord,
  DATASET_KEYS,
  type Datasets,
  type Employee,
  type JobChange,
  type Review,
} from '@/data/schema'
import { DEFAULT_FILTERS, type Filters } from '@/data/scope'
import type { SourceMeta } from '@/data/store'

export const AS_OF = '2026-09-30'

let seq = 0
export function emp(over: Partial<Employee> = {}): Employee {
  seq++
  return {
    employeeId: `T${String(seq).padStart(4, '0')}`,
    name: `Person ${seq}`,
    jobTitle: 'Engineer',
    jobFamily: null,
    businessUnit: 'Silicon Engineering',
    department: 'Design Verification',
    location: 'San Jose',
    country: 'United States',
    level: 'L3',
    managerId: null,
    hireDate: '2020-01-06',
    terminationDate: null,
    terminationType: null,
    terminationReason: null,
    regrettable: null,
    employmentType: 'Employee',
    ...over,
  }
}

/** A comp row for `e`: range 80/100/120 thousand USD, base at `compa` × mid. */
export function comp(e: Employee, over: Partial<CompRecord> & { compa?: number } = {}): CompRecord {
  const { compa = 1, ...rest } = over
  return {
    employeeId: e.employeeId,
    currency: 'USD',
    baseSalary: Math.round(100_000 * compa),
    rangeMin: 80_000,
    rangeMid: 100_000,
    rangeMax: 120_000,
    fxToUsd: 1,
    targetBonusPct: 0.1,
    bonusPayoutPct: 1,
    annualEquityUsd: 10_000,
    marketP50: 100_000,
    meritPct: 0.03,
    promotionPct: null,
    ...rest,
  }
}

export function review(e: Employee, rating: number, over: Partial<Review> = {}): Review {
  return { employeeId: e.employeeId, cycle: '2026 Mid-year', cycleDate: '2026-06-30', rating, ...over }
}

export function promotion(e: Employee, effectiveDate: string): JobChange {
  return { employeeId: e.employeeId, effectiveDate, changeType: 'Promotion', fromLevel: 'L2', toLevel: 'L3' }
}

export function dataset(parts: Partial<Datasets>): Datasets {
  return {
    employees: [],
    jobChanges: [],
    requisitions: [],
    candidates: [],
    cases: [],
    transactions: [],
    reviews: [],
    succession: [],
    learning: [],
    comp: [],
    ...parts,
  }
}

export function sources(data: Datasets): Record<(typeof DATASET_KEYS)[number], SourceMeta> {
  return Object.fromEntries(
    DATASET_KEYS.map((k) => [k, { kind: 'upload', rowCount: data[k].length }]),
  ) as Record<(typeof DATASET_KEYS)[number], SourceMeta>
}

/** An analytics context over uploaded-looking data with a fixed as-of date. */
export function context(data: Datasets, opts: { filters?: Partial<Filters>; showPay?: boolean } = {}) {
  return buildContext({
    data,
    sources: sources(data),
    filters: { ...DEFAULT_FILTERS, ...opts.filters },
    asOfOverride: AS_OF,
    showPay: opts.showPay ?? false,
  })
}

/** `n` employees with comp rows built by `make`. */
export function team(
  n: number,
  e: Partial<Employee>,
  make: (emp: Employee, i: number) => Partial<CompRecord> & { compa?: number } = () => ({}),
): { employees: Employee[]; comp: CompRecord[] } {
  const employees = Array.from({ length: n }, () => emp(e))
  return { employees, comp: employees.map((x, i) => comp(x, make(x, i))) }
}
