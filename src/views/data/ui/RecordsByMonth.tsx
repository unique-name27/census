/**
 * Records by month, the lead of the Datasets tab (docs/CHARTS.md, Data room): each dated
 * dataset's rows by month over the last 24 months (12 on phones), shaded against the dataset's
 * busiest month so a gap reads at a glance; every cell opens its rows.
 */
import { useMemo } from 'react'
import { type Column, Figure, Heatmap } from '@/charts'
import { useNarrow } from '@/components/useNarrow'
import { useAnalytics } from '@/data/context'
import { datasetDef } from '@/data/schema'
import { drill } from '@/drill'
import { plural } from '@/lib/format'
import { minGroupOf } from '@/metrics/privacy'
import { byMonthDrill, type MonthCell, rowsByMonth, SNAPSHOT_DATASETS } from '../engine/byMonth'
import { DATA_METRIC } from '../roomMetrics'

const COLUMNS: Column<MonthCell>[] = [
  { key: 'dataset', label: 'Dataset' },
  { key: 'month', label: 'Month' },
  { key: 'rows', label: 'Rows dated in the month', format: 'int' },
  { key: 'share', label: 'Share of the busiest month', format: 'pct0' },
]

export function RecordsByMonthFigure() {
  const ctx = useAnalytics()
  const narrow = useNarrow()
  const r = useMemo(() => rowsByMonth(ctx.all, ctx.asOf, narrow ? 12 : 24), [ctx.all, ctx.asOf, narrow])
  const source = ctx.isSample ? 'Sample data' : undefined
  const open = (c: MonthCell) => () =>
    byMonthDrill(c, ctx.all, {
      source,
      min: minGroupOf(ctx.metrics),
      engagement: ctx.features.engagementSurveys,
    })
  const columns: Column<MonthCell>[] = COLUMNS.map((c) =>
    c.key === 'rows' ? { ...c, drill: (x: MonthCell) => (x.rows ? open(x) : null) } : c,
  )
  const snapshots = SNAPSHOT_DATASETS.map((k) => datasetDef(k).label)
  const months = r.months.length
  return (
    <Figure
      id="data-coverage-by-month"
      metric={DATA_METRIC.byMonth}
      uses={[
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
      ]}
      // About the data itself: the Data room never gates.
      gate={false}
      span={12}
      title="Records by month"
      subtitle={`Rows of each dataset dated in each of the last ${months} months, by its own event date, as a share of its busiest month`}
      data={r.cells}
      columns={columns}
      note={[
        `${plural(r.datasets.length, 'dataset')} with dates`,
        `${snapshots.join(', ')} are snapshots with no dates`,
        r.empty.length ? `nothing loaded in ${r.empty.map((k) => datasetDef(k).label).join(', ')}` : null,
      ]
        .filter(Boolean)
        .join(' · ')}
      empty={r.cells.length ? null : 'No dated dataset has rows loaded.'}
    >
      <Heatmap
        data={r.cells}
        x="monthLabel"
        y="dataset"
        value="share"
        n="rows"
        format="pct0"
        scheme="sequential"
        domain={[0, 1]}
        xOrder={[...new Set(r.cells.map((c) => c.monthLabel))]}
        yOrder={r.datasets.map((k) => datasetDef(k).label)}
        rowHeight={28}
        onSelect={(c) => drill(open(c))}
        selectable={(c) => c.rows > 0}
        lockedNote={(c) => (c.rows ? null : 'No rows dated in this month')}
      />
    </Figure>
  )
}
