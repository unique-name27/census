/**
 * Hand-built fixtures for the recruiting engine tests: requisition, candidate and employee
 * factories and a context builder over otherwise empty datasets, optionally with a metric
 * dictionary whose settings differ from the defaults. Imported by tests only.
 */
import { type AnalyticsContext, buildContext } from '@/data/context'
import type { Candidate, DatasetKey, Datasets, Employee, Requisition } from '@/data/schema'
import { DATASET_KEYS } from '@/data/schema'
import { DEFAULT_FILTERS, type Filters } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import type { MetricsApi } from '@/metrics/types'

export const AS_OF = '2026-09-30'

export function req(id: string, patch: Partial<Requisition> = {}): Requisition {
  return {
    reqId: id,
    jobTitle: `Engineer ${id}`,
    businessUnit: 'Silicon Engineering',
    department: 'Design Verification',
    location: 'San Jose',
    level: 'L4',
    hiringManagerId: 'E1',
    hiringManager: 'Hana Manager',
    recruiter: 'Rita Recruiter',
    openedDate: '2026-06-01',
    status: 'Open',
    reqType: 'New',
    priority: 'Standard',
    openings: 1,
    ...patch,
  }
}

let seq = 0
export function cand(reqId: string, patch: Partial<Candidate> = {}): Candidate {
  seq++
  return {
    applicationId: `APP-${seq}`,
    candidateName: `Candidate ${seq}`,
    reqId,
    source: 'Referral',
    recruiter: 'Rita Recruiter',
    coordinator: null,
    currentStage: 'Applied',
    status: 'Active',
    appliedDate: '2026-09-01',
    ...patch,
  }
}

export function emp(id: string, name: string, hireDate: string, patch: Partial<Employee> = {}): Employee {
  return {
    employeeId: id,
    name,
    jobTitle: 'Engineer',
    businessUnit: 'Silicon Engineering',
    department: 'Design Verification',
    location: 'San Jose',
    country: 'United States',
    level: 'L4',
    hireDate,
    employmentType: 'Employee',
    ...patch,
  }
}

const empty = (): Datasets => ({
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
})

export function ctxOf(
  data: Partial<Datasets>,
  opts: { asOf?: string; filters?: Partial<Filters>; metrics?: MetricsApi } = {},
): AnalyticsContext {
  const sources = Object.fromEntries(
    DATASET_KEYS.map((k) => [k, { kind: 'upload', rowCount: 0 } satisfies SourceMeta]),
  ) as Record<DatasetKey, SourceMeta>
  return buildContext({
    data: { ...empty(), ...data },
    sources,
    filters: { ...DEFAULT_FILTERS, ...opts.filters },
    asOfOverride: opts.asOf ?? AS_OF,
    showPay: false,
    metrics: opts.metrics,
  })
}
