/** Hand-built rosters for the org engine tests. Not imported by the app. */
import { type AnalyticsContext, buildContext } from '@/data/context'
import { generateSample } from '@/data/sample'
import { DATASET_KEYS, type DatasetKey, type Datasets, type Employee, type ISODate } from '@/data/schema'
import { DEFAULT_FILTERS, type Filters } from '@/data/scope'
import type { SourceMeta } from '@/data/store'

export const AS_OF: ISODate = '2026-09-30'

/** An active employee with sensible defaults. */
export function person(id: string, managerId: string | null, patch: Partial<Employee> = {}): Employee {
  return {
    employeeId: id,
    name: `Name ${id}`,
    jobTitle: 'Engineer',
    businessUnit: 'Silicon Engineering',
    department: 'Design Verification',
    location: 'San Jose',
    country: 'United States',
    level: 'L3',
    managerId,
    hireDate: '2020-01-06',
    terminationDate: null,
    terminationType: null,
    terminationReason: null,
    regrettable: null,
    employmentType: 'Employee',
    ...patch,
  }
}

/**
 * A small company:
 *
 *   CEO (E3)
 *   ├── VP-A (E1)
 *   │   ├── MGR-1 (M1) ── IC-1, IC-2, IC-3, IC-4, IC-5
 *   │   └── MGR-2 (M1) ── IC-6
 *   └── VP-B (E1) ── DIR-1 (M2) ── MGR-3 (M1) ── IC-7, IC-8, IC-9, IC-10, IC-11
 */
export function smallCompany(): Employee[] {
  const rows: Employee[] = [
    person('CEO', null, { level: 'E3', jobTitle: 'Chief Executive Officer' }),
    person('VP-A', 'CEO', { level: 'E1', department: 'Digital Design' }),
    person('VP-B', 'CEO', { level: 'E1', department: 'Software', businessUnit: 'Systems & Software' }),
    person('MGR-1', 'VP-A', { level: 'M1', department: 'Digital Design' }),
    person('MGR-2', 'VP-A', { level: 'M1', department: 'Digital Design' }),
    person('DIR-1', 'VP-B', { level: 'M2', department: 'Software', businessUnit: 'Systems & Software' }),
    person('MGR-3', 'DIR-1', { level: 'M1', department: 'Software', businessUnit: 'Systems & Software' }),
  ]
  for (let i = 1; i <= 5; i++) rows.push(person(`IC-${i}`, 'MGR-1', { department: 'Digital Design' }))
  rows.push(person('IC-6', 'MGR-2', { department: 'Digital Design' }))
  for (let i = 7; i <= 11; i++)
    rows.push(person(`IC-${i}`, 'MGR-3', { department: 'Software', businessUnit: 'Systems & Software' }))
  return rows
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
  hiringPlan: [],
  onboardingTasks: [],
  rightToWork: [],
  surveyResponses: [],
  surveyItems: [],
  budget: [],
})

const sources = (kind: SourceMeta['kind']) =>
  Object.fromEntries(DATASET_KEYS.map((k) => [k, { kind, rowCount: 0 }])) as Record<DatasetKey, SourceMeta>

export function ctxFor(data: Partial<Datasets>, filters: Partial<Filters> = {}): AnalyticsContext {
  return buildContext({
    data: { ...emptyData(), ...data },
    sources: sources('upload'),
    filters: { ...DEFAULT_FILTERS, ...filters },
    asOfOverride: AS_OF,
    showPay: false,
  })
}

let sample: Datasets | null = null
export function sampleCtx(filters: Partial<Filters> = {}): AnalyticsContext {
  sample ??= generateSample()
  return buildContext({
    data: sample,
    sources: sources('sample'),
    filters: { ...DEFAULT_FILTERS, ...filters },
    asOfOverride: null,
    showPay: false,
  })
}
