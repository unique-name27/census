/**
 * Starts against plan by business unit and month (Hiring plan): actual starts minus planned
 * starts in each unit and month of the plan year to date, on the diverging ramp (behind plan red,
 * ahead blue, on plan gray). The cumulative line shows the year; this grid shows which months and
 * which units made it. A cell opens the people who started there (or, when nobody did, its plan
 * lines), with the unit as the filter. The plan year does not follow the period picker, so no
 * period is set. Hidden in Manager mode with the tab (plan versions are a finance and TA artifact).
 */
import { type Column, Figure, Heatmap } from '@/charts'
import { useAnalytics } from '@/data/context'
import { drill } from '@/drill'
import { formatMonth, formatMonthShort } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import { ACTUAL, PLAN, PLAN_REQ, union } from '../engine/lineage'
import { byUnitMonth, type PlanModel, type UnitMonthCell } from '../engine/plan'
import { M } from '../metrics'
import { planMonthCellDrill } from './drill'
import { asOfNote, defs, useOnboarding } from './shared'

interface GridRow extends UnitMonthCell {
  monthLabel: string
}

export function PlanGrid({ p }: { p: PlanModel }) {
  const ctx = useAnalytics()
  const m = useOnboarding()
  const b = m.base
  const g = byUnitMonth(p, b.asOf)
  const word = g.cut === 'department' ? 'department' : 'business unit'
  const rows: GridRow[] = g.cells.map((c) => ({ ...c, monthLabel: formatMonthShort(`${c.month}-01`, true) }))
  const cellDrill = planMonthCellDrill(b, p, g.cut, { actual: ACTUAL, plan: union(PLAN, PLAN_REQ) })
  const behind = rows.filter((r) => r.gap < 0).length
  const last = g.months.at(-1)
  const columns: Column<GridRow>[] = [
    { key: 'unit', label: g.cut === 'department' ? 'Department' : 'Business unit' },
    { key: 'month', label: 'Month' },
    { key: 'planned', label: 'Planned starts', format: 'int' },
    { key: 'actual', label: 'Actual starts', format: 'int', drill: (r) => (r.actual ? cellDrill(r) : null) },
    { key: 'gap', label: 'Actual minus plan', format: 'int', drill: cellDrill },
  ]
  return (
    <Figure
      id="onboarding-plan-gap-by-month"
      uses={union(PLAN, ACTUAL)}
      metric={M.vsPlanByMonth}
      title={`Starts against plan by ${word} and month`}
      subtitle={`Actual starts minus planned starts, ${p.version ?? 'the plan'}, ${formatMonth(p.start)} to ${last ? formatMonth(`${last}-01`) : formatMonth(p.toDate)}`}
      data={rows}
      columns={columns}
      definitions={defs(
        ctx.metrics,
        [M.vsPlanByMonth, M.vsPlan],
        [
          {
            term: 'Actual minus plan',
            text: 'Employees who started in the month (by hire date) minus the planned starts on the plan lines for that month. Below zero is behind plan.',
          },
          {
            term: 'The latest month',
            text: 'Counts starts to the as-of date against the whole month’s plan.',
          },
        ],
      )}
      note={asOfNote(
        b.asOf,
        `${plural(behind, 'cell')} behind plan`,
        `${fmt(g.units.length, 'int')} ${word}s`,
      )}
      span={12}
      empty={rows.length ? null : 'No month of the plan year has started yet.'}
    >
      <Heatmap
        data={rows}
        x="monthLabel"
        y="unit"
        value="gap"
        format="int"
        scheme="diverging"
        mid={0}
        xOrder={g.months.map((x) => formatMonthShort(`${x}-01`, true))}
        yOrder={g.units}
        detail={(d) => `${fmt(d.actual, 'int')} started of ${fmt(d.planned, 'int')} planned`}
        cellText={(d) => (d.gap > 0 ? `+${fmt(d.gap, 'int')}` : fmt(d.gap, 'int'))}
        selectable={(d) => d.actual > 0 || d.planned > 0}
        lockedNote={() => 'Nothing planned and nobody started'}
        onSelect={(d) => drill(cellDrill(d))}
        ariaLabel={`Starts against plan by ${word} and month`}
      />
    </Figure>
  )
}
