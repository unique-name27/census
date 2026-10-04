/** Fixture builders for the Listening engine tests. Not used by the app. */
import { buildContext, type Features } from '@/data/context'
import { generateSample } from '@/data/sample'
import {
  DATASET_KEYS,
  type DatasetKey,
  type Datasets,
  type Employee,
  type SurveyResponse,
  withAllDatasets,
} from '@/data/schema'
import { DEFAULT_FILTERS, type Filters } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import type { MetricsApi } from '@/metrics/types'

const sources = (data: Datasets, kind: SourceMeta['kind']) =>
  Object.fromEntries(DATASET_KEYS.map((k) => [k, { kind, rowCount: data[k].length }])) as Record<
    DatasetKey,
    SourceMeta
  >

let sample: Datasets | null = null
export const sampleData = (): Datasets => {
  sample ??= generateSample()
  return sample
}

/** The analytics context over the generated sample, whole company, last 12 months. */
export function sampleContext(
  opts: { filters?: Partial<Filters>; metrics?: MetricsApi; features?: Features } = {},
) {
  const data = sampleData()
  return buildContext({
    data,
    sources: sources(data, 'sample'),
    filters: { ...DEFAULT_FILTERS, ...opts.filters },
    asOfOverride: null,
    showPay: false,
    metrics: opts.metrics,
    features: opts.features,
  })
}

/** A context over hand-built rows (uploaded data, as of 30 Sep 2026). */
export function fixtureContext(
  partial: Partial<Datasets>,
  opts: { metrics?: MetricsApi; features?: Features; asOf?: string } = {},
) {
  const data = withAllDatasets(partial)
  return buildContext({
    data,
    sources: sources(data, 'upload'),
    filters: DEFAULT_FILTERS,
    asOfOverride: opts.asOf ?? '2026-09-30',
    showPay: false,
    metrics: opts.metrics,
    features: opts.features,
  })
}

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
    hireDate: '2022-01-10',
    employmentType: 'Employee',
    ...p,
  }
}

/** One answer; defaults to a 1-5 hiring manager item in 2026 Q3. */
export function answer(p: Partial<SurveyResponse> = {}): SurveyResponse {
  return {
    survey: 'Hiring manager satisfaction',
    wave: '2026 Q3',
    responseDate: '2026-08-10',
    respondentKey: 'E1',
    item: 'HM_SPEED',
    driver: 'Speed',
    score: 4,
    scale: '1-5',
    ...p,
  }
}

/** n people answering the same item with the given scores (cycled). */
export function answers(
  n: number,
  scores: readonly number[],
  p: Partial<SurveyResponse> & { keyPrefix?: string } = {},
): SurveyResponse[] {
  const { keyPrefix = 'R', ...rest } = p
  return Array.from({ length: n }, (_, i) =>
    answer({ respondentKey: `${keyPrefix}${i + 1}`, score: scores[i % scores.length], ...rest }),
  )
}
