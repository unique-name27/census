/**
 * Small hand-built fixtures for the HRBP engine tests. Not imported by the app.
 */
import { type AnalyticsContext, buildContext } from '@/data/context'
import { generateSample } from '@/data/sample'
import {
  DATASET_KEYS,
  type DatasetKey,
  type Datasets,
  type Employee,
  type ISODate,
  type JobChange,
  type Review,
} from '@/data/schema'
import { DEFAULT_FILTERS, type Filters } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import { type Prep, prepare } from './base'

export const AS_OF: ISODate = '2026-09-30'

let seq = 0
export function emp(patch: Partial<Employee> & { employeeId?: string } = {}): Employee {
  seq++
  return {
    employeeId: patch.employeeId ?? `T${String(seq).padStart(5, '0')}`,
    name: patch.name ?? `Person ${seq}`,
    jobTitle: 'Engineer',
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
    ...patch,
  }
}

/** n identical employees (fresh ids) with the same patch. */
export const many = (n: number, patch: Partial<Employee> = {}): Employee[] =>
  Array.from({ length: n }, () => emp(patch))

export function leaver(
  date: ISODate,
  kind: 'Voluntary' | 'Involuntary' | null,
  patch: Partial<Employee> = {},
): Employee {
  return emp({
    terminationDate: date,
    terminationType: kind,
    regrettable: kind === 'Voluntary' ? false : null,
    terminationReason: kind === 'Voluntary' ? 'Career growth or promotion' : kind ? 'Performance' : null,
    ...patch,
  })
}

export const change = (
  patch: Partial<JobChange> & Pick<JobChange, 'employeeId' | 'effectiveDate' | 'changeType'>,
): JobChange => ({
  fromLevel: null,
  toLevel: null,
  fromDepartment: null,
  toDepartment: null,
  ...patch,
})

export const review = (employeeId: string, cycleDate: ISODate, rating: number): Review => ({
  employeeId,
  cycle: `Cycle ${cycleDate}`,
  cycleDate,
  rating,
})

export function datasets(partial: Partial<Datasets>): Datasets {
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
    ...partial,
  }
}

const sources = (kind: 'sample' | 'upload', data: Datasets) =>
  Object.fromEntries(DATASET_KEYS.map((k) => [k, { kind, rowCount: data[k].length }])) as Record<
    DatasetKey,
    SourceMeta
  >

export function ctxOf(
  partial: Partial<Datasets>,
  filters: Partial<Filters> = {},
  asOf = AS_OF,
): AnalyticsContext {
  const data = datasets(partial)
  return buildContext({
    data,
    sources: sources('upload', data),
    filters: { ...DEFAULT_FILTERS, ...filters },
    asOfOverride: asOf,
    showPay: false,
  })
}

export const prepOf = (partial: Partial<Datasets>, filters: Partial<Filters> = {}, asOf = AS_OF): Prep =>
  prepare(ctxOf(partial, filters, asOf))

let sample: Datasets | null = null
/** The generated sample company, built once per test file. */
export function sampleCtx(filters: Partial<Filters> = {}): AnalyticsContext {
  sample ??= generateSample()
  return buildContext({
    data: sample,
    sources: sources('sample', sample),
    filters: { ...DEFAULT_FILTERS, ...filters },
    asOfOverride: null,
    showPay: false,
  })
}
