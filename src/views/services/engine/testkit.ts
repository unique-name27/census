/** Fixture builders for the employee services engine tests. Not used by the app. */
import { buildContext } from '@/data/context'
import { generateSample } from '@/data/sample'
import {
  DATASET_KEYS,
  type DatasetKey,
  type Datasets,
  type Employee,
  type HrCase,
  type HrTransaction,
} from '@/data/schema'
import { DEFAULT_FILTERS, type Filters, type Window } from '@/data/scope'
import type { SourceMeta } from '@/data/store'

let caseSeq = 0
let txSeq = 0

/** A case; without a `requesterId` it counts as its own person (unknown requester). */
export function kase(p: Partial<HrCase> = {}): HrCase {
  caseSeq++
  return {
    caseId: `HR-${caseSeq}`,
    openedAt: '2026-09-01T09:00',
    firstResponseAt: '2026-09-01T10:00',
    resolvedAt: '2026-09-01T12:00',
    status: 'Resolved',
    category: 'Payroll',
    channel: 'Portal',
    priority: 'P3',
    tier: 'Tier 1',
    team: 'Payroll',
    responseTargetHours: 8,
    resolutionTargetHours: 48,
    ...p,
  }
}

/** A transaction; each one is for a different employee unless `employeeId` is given. */
export function tx(p: Partial<HrTransaction> = {}): HrTransaction {
  txSeq++
  return {
    transactionId: `TX-${txSeq}`,
    type: 'New hire',
    employeeId: `TXE${txSeq}`,
    submittedDate: '2026-08-01',
    effectiveDate: '2026-09-07',
    dueDate: '2026-09-02',
    completedDate: '2026-09-01',
    retro: null,
    ...p,
  }
}

export function emp(p: Partial<Employee> = {}): Employee {
  return {
    employeeId: 'E1',
    name: 'Ada Park',
    jobTitle: 'Engineer',
    businessUnit: 'Silicon Engineering',
    department: 'Digital Design',
    location: 'San Jose',
    country: 'United States',
    level: 'L3',
    hireDate: '2020-01-06',
    employmentType: 'Employee',
    ...p,
  }
}

export function win(start: string, end: string): Window {
  return { start, end, months: 1, label: `${start} to ${end}` }
}

const emptyData = (): Datasets => ({
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
})

const sources = (data: Datasets, kind: SourceMeta['kind']) =>
  Object.fromEntries(DATASET_KEYS.map((k) => [k, { kind, rowCount: data[k].length }])) as Record<
    DatasetKey,
    SourceMeta
  >

let sample: Datasets | null = null

/** The analytics context over the generated sample, whole company, last 12 months. */
export function sampleContext(filters: Partial<Filters> = {}) {
  sample ??= generateSample()
  return buildContext({
    data: sample,
    sources: sources(sample, 'sample'),
    filters: { ...DEFAULT_FILTERS, ...filters },
    asOfOverride: null,
    showPay: false,
  })
}

/** A context over hand-built rows (treated as uploaded data with a fixed as-of date). */
export function fixtureContext(partial: Partial<Datasets>, asOf = '2026-09-30') {
  const data = { ...emptyData(), ...partial }
  return buildContext({
    data,
    sources: sources(data, 'upload'),
    filters: DEFAULT_FILTERS,
    asOfOverride: asOf,
    showPay: false,
  })
}
