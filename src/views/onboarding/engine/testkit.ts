/** Fixture builders for the onboarding engine tests. Not used by the app. */
import { buildContext } from '@/data/context'
import { generateSample } from '@/data/sample'
import {
  type Candidate,
  DATASET_KEYS,
  type DatasetKey,
  type Datasets,
  type Employee,
  emptyDatasets,
  type HiringPlanLine,
  type OnboardingTask,
  type Requisition,
} from '@/data/schema'
import { DEFAULT_FILTERS, type Filters } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import type { MetricsApi } from '@/metrics/types'

export const AS_OF = '2026-09-30'

export function emp(id: string, p: Partial<Employee> = {}): Employee {
  return {
    employeeId: id,
    name: `Person ${id}`,
    jobTitle: 'Engineer',
    businessUnit: 'Silicon Engineering',
    department: 'Digital Design',
    location: 'San Jose',
    country: 'United States',
    level: 'L3',
    managerId: 'M1',
    hireDate: '2026-03-02',
    employmentType: 'Employee',
    ...p,
  }
}

export function req(id: string, p: Partial<Requisition> = {}): Requisition {
  return {
    reqId: id,
    jobTitle: 'Engineer',
    businessUnit: 'Silicon Engineering',
    department: 'Digital Design',
    location: 'San Jose',
    level: 'L3',
    hiringManagerId: 'M1',
    hiringManager: 'Manager One',
    recruiter: 'Rae Cruz',
    openedDate: '2026-06-01',
    status: 'Open',
    reqType: 'New',
    priority: 'Standard',
    openings: 1,
    ...p,
  }
}

export function cand(id: string, reqId: string, p: Partial<Candidate> = {}): Candidate {
  return {
    applicationId: id,
    candidateName: `Candidate ${id}`,
    reqId,
    source: 'Referral',
    recruiter: 'Rae Cruz',
    currentStage: 'Hired',
    status: 'Hired',
    appliedDate: '2026-06-10',
    hiredDate: '2026-08-01',
    startDate: '2026-10-12',
    ...p,
  }
}

export function task(p: Partial<OnboardingTask> & { task: string }): OnboardingTask {
  return { status: 'Not started', ...p }
}

export function line(p: Partial<HiringPlanLine> = {}): HiringPlanLine {
  return {
    period: '2026-10-01',
    businessUnit: 'Silicon Engineering',
    department: 'Digital Design',
    plannedHires: 1,
    planVersion: 'FY27 v1',
    ...p,
  }
}

const sources = (data: Datasets, kind: SourceMeta['kind']) =>
  Object.fromEntries(DATASET_KEYS.map((k) => [k, { kind, rowCount: data[k].length }])) as Record<
    DatasetKey,
    SourceMeta
  >

/** A context over hand-built rows (treated as uploaded data with a fixed as-of date). */
export function fixtureContext(
  partial: Partial<Datasets>,
  o: { metrics?: MetricsApi; filters?: Partial<Filters>; asOf?: string } = {},
) {
  const data = { ...emptyDatasets(), ...partial }
  return buildContext({
    data,
    sources: sources(data, 'upload'),
    filters: { ...DEFAULT_FILTERS, ...o.filters },
    asOfOverride: o.asOf ?? AS_OF,
    showPay: false,
    metrics: o.metrics,
  })
}

let sample: Datasets | null = null

/** The analytics context over the generated sample: whole company, last 12 months by default. */
export function sampleContext(filters: Partial<Filters> = {}, metrics?: MetricsApi) {
  sample ??= generateSample()
  return buildContext({
    data: sample,
    sources: sources(sample, 'sample'),
    filters: { ...DEFAULT_FILTERS, ...filters },
    asOfOverride: null,
    showPay: false,
    metrics,
  })
}
