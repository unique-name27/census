/** Fixture builders for the Compliance engine tests. Not used by the app. */
import { buildContext } from '@/data/context'
import { generateSample } from '@/data/sample'
import {
  DATASET_KEYS,
  type DatasetKey,
  type Datasets,
  type Employee,
  emptyDatasets,
  type OnboardingTask,
  type RightToWork,
} from '@/data/schema'
import { DEFAULT_FILTERS, type Filters } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import type { MetricsApi } from '@/metrics/types'

let seq = 0

export function emp(p: Partial<Employee> = {}): Employee {
  seq++
  return {
    employeeId: `E${seq}`,
    name: `Person ${seq}`,
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

export function rtw(e: Employee, p: Partial<RightToWork> = {}): RightToWork {
  return {
    employeeId: e.employeeId,
    authorizationType: 'Permanent (no expiry)',
    expiryDate: null,
    reverificationStartedDate: null,
    i9Section1Date: null,
    i9Section2Date: null,
    exportLicenseRequired: false,
    exportLicenseStatus: 'Not needed',
    exportLicenseExpiry: null,
    ...p,
  }
}

export function task(p: Partial<OnboardingTask> = {}): OnboardingTask {
  return { task: 'Policy acknowledgments', status: 'Done', ...p }
}

const sources = (data: Datasets, kind: SourceMeta['kind']) =>
  Object.fromEntries(DATASET_KEYS.map((k) => [k, { kind, rowCount: data[k].length }])) as Record<
    DatasetKey,
    SourceMeta
  >

let sample: Datasets | null = null

/** The generated sample, whole company, last 12 months (as of 30 Sep 2026). */
export function sampleContext(
  o: { filters?: Partial<Filters>; metrics?: MetricsApi; showImmigration?: boolean } = {},
) {
  sample ??= generateSample()
  return buildContext({
    data: sample,
    sources: sources(sample, 'sample'),
    filters: { ...DEFAULT_FILTERS, ...o.filters },
    asOfOverride: null,
    showPay: false,
    showImmigration: o.showImmigration,
    metrics: o.metrics,
  })
}

/** A context over hand-built rows (uploaded data with a fixed as-of date, last 12 months). */
export function fixtureContext(
  partial: Partial<Datasets>,
  o: { asOf?: string; metrics?: MetricsApi; showImmigration?: boolean; filters?: Partial<Filters> } = {},
) {
  const data = { ...emptyDatasets(), ...partial }
  return buildContext({
    data,
    sources: sources(data, 'upload'),
    filters: { ...DEFAULT_FILTERS, ...o.filters },
    asOfOverride: o.asOf ?? '2026-09-30',
    showPay: false,
    showImmigration: o.showImmigration,
    metrics: o.metrics,
  })
}
