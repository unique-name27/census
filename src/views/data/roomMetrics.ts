/**
 * The Data room's own metric dictionary entries (docs/METRICS.md), registered with
 * `defineMetrics('data', [...])`: the numbers its charts show about the data itself. The data
 * quality rules are registered apart (`@/metrics/quality`), under the `quality.` prefix.
 *
 * The catalog imports this file, so keep it to plain data: never React, '@/data/context',
 * '@/data/store', the '@/metrics' barrel, '@/metrics/catalog', '@/metrics/api' or
 * '@/metrics/testing'.
 */
import { defineMetrics } from '@/metrics/define'
import type { MetricDef } from '@/metrics/types'

/** Metric ids, by what the Data room calls them. */
export const DATA_METRIC = {
  byMonth: 'data.coverage.byMonth',
  metricTiers: 'data.quality.metricTiers',
} as const

const OWNER = 'People analytics'

export const metrics: MetricDef[] = defineMetrics('data', [
  {
    id: DATA_METRIC.byMonth,
    name: 'Records by month',
    definition:
      'How many rows of each dataset are dated in each month, by the dataset’s own event date: hires and exits, the effective date of a job change, the opened date of a req or case, the applied date of a candidate, and so on. A month with far fewer rows than the rest is a gap to check.',
    formula: 'rows with an event date in the month · share = rows ÷ rows in the dataset’s busiest month',
    population:
      'Every loaded row of the datasets that carry an event date, whatever the filters. Comp, Right to work, Succession and Survey items are snapshots with no event date and are not shown.',
    window: 'The 24 months to the as-of date.',
    unit: 'int',
    goodDirection: null,
    uses: [
      'employees.hireDate',
      'employees.terminationDate',
      'jobChanges.effectiveDate',
      'requisitions.openedDate',
      'candidates.appliedDate',
      'cases.openedAt',
      'transactions.submittedDate',
      'reviews.cycleDate',
      'learning.assignedDate',
      'hiringPlan.period',
      'onboardingTasks.dueDate',
      'surveyResponses.responseDate',
      'budget.period',
    ],
    owner: OWNER,
  },
  {
    id: DATA_METRIC.metricTiers,
    name: 'Metrics by view and tier',
    definition:
      'How many of each view’s metrics stand at each tier. A metric takes the lowest tier of the fields it reads; one that names no fields takes the lowest tier of its view’s datasets.',
    formula: 'count of registered metrics per home view and tier',
    population:
      'Every registered metric that reads data. Privacy rules, data quality rules and calculation settings read none and are not counted.',
    window: 'The data loaded now, judged against the data quality rules in force.',
    unit: 'int',
    goodDirection: null,
    uses: [],
    owner: OWNER,
  },
])
