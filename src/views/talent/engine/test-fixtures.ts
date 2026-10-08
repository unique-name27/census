/**
 * Test fixtures: tiny hand-built datasets wrapped in a real analytics context.
 * Used only by the Talent engine tests.
 */
import { type AnalyticsContext, buildContext } from '@/data/context'
import {
  DATASET_KEYS,
  type DatasetKey,
  type Datasets,
  type Employee,
  type LearningRecord,
  type Review,
} from '@/data/schema'
import { DEFAULT_FILTERS, type Filters } from '@/data/scope'
import type { SourceMeta } from '@/data/store'

export const AS_OF = '2026-09-30'

export function emp(id: string, o: Partial<Employee> = {}): Employee {
  return {
    employeeId: id,
    name: `Person ${id}`,
    jobTitle: 'Engineer',
    businessUnit: 'Engineering',
    department: 'Design',
    location: 'San Jose',
    country: 'United States',
    level: 'L3',
    managerId: null,
    hireDate: '2020-01-06',
    employmentType: 'Employee',
    ...o,
  }
}

export function review(
  employeeId: string,
  cycle: string,
  cycleDate: string,
  rating: number,
  o: Partial<Review> = {},
): Review {
  return { employeeId, cycle, cycleDate, rating, ...o }
}

export function course(employeeId: string, name: string, o: Partial<LearningRecord> = {}): LearningRecord {
  return {
    employeeId,
    course: name,
    category: 'Compliance',
    required: true,
    assignedDate: '2026-07-13',
    dueDate: '2026-08-26',
    completedDate: null,
    hours: 1,
    ...o,
  }
}

export function datasets(partial: Partial<Datasets> = {}): Datasets {
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
    hiringPlan: [],
    onboardingTasks: [],
    rightToWork: [],
    surveyResponses: [],
    surveyItems: [],
    budget: [],
    ...partial,
  }
}

export function sourcesFor(data: Datasets, kind: SourceMeta['kind']): Record<DatasetKey, SourceMeta> {
  return Object.fromEntries(DATASET_KEYS.map((k) => [k, { kind, rowCount: data[k].length }])) as Record<
    DatasetKey,
    SourceMeta
  >
}

export function ctxFor(
  partial: Partial<Datasets>,
  opts: { asOf?: string; filters?: Partial<Filters> } = {},
): AnalyticsContext {
  const data = datasets(partial)
  return buildContext({
    data,
    sources: sourcesFor(data, 'upload'),
    filters: { ...DEFAULT_FILTERS, ...opts.filters },
    asOfOverride: opts.asOf ?? AS_OF,
    showPay: false,
  })
}
