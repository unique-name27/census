/**
 * The Scorecard's two chart sections (docs/DESIGN-REFRESH.md 4.1, docs/ROLES.md 2.1): how the
 * workforce is moving (headcount over time, hires and exits, voluntary and regretted attrition by
 * quarter) and where the pressure is (voluntary attrition by business unit, Recruiting's pipeline
 * today, and where open items wait). Each figure reads its producing view's model for this
 * context, already computed by the summaries, and opens the same records as on that view.
 */
import {
  BarList,
  byGroup,
  type ChartNote,
  type Column,
  Columns,
  Figure,
  HBars,
  Lines,
  useChartTheme,
  withFilter,
} from '@/charts'
import { Pending, RouteLink, Section } from '@/components'
import { useAnalytics } from '@/data/context'
import { drill } from '@/drill/Drill'
import { periodFilter } from '@/drill/filter'
import type { DrillSpec } from '@/drill/types'
import { addDays, formatDate, formatRange } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import {
  DUE_BUCKETS,
  type DueBucket,
  dueBucket,
  dueBucketLabel,
  groupByOwner,
  itemsDrill,
  type OpenAction,
  type OwnerDueRow,
  ownerDueRows,
  ownerTableRows,
  settingsOf,
  usesOf,
} from '@/views/actions/engine'
import { M as ACTIONS } from '@/views/actions/metrics'
import { hrbpModel } from '@/views/hrbp/engine'
import { NO_HISTORY } from '@/views/hrbp/engine/base'
import { flowMonthSpec, flowSpec } from '@/views/hrbp/engine/buckets'
import { employeesOnSpec, leaversSpec, rateNote } from '@/views/hrbp/engine/drill'
import { all, BUSINESS_UNIT, FIGURE, VOLUNTARY as VOLUNTARY_LINEAGE } from '@/views/hrbp/engine/lineage'
import { LAST_YEAR, YEAR_BEFORE } from '@/views/hrbp/engine/workforce'
import { ID } from '@/views/hrbp/metrics'
import { drillWhen } from '@/views/hrbp/ui/drill'
import { computeRecruiting } from '@/views/recruiting/engine'
import {
  lackingKpiDrill,
  nextStateDrill,
  pipelineCellDrill,
  pipelineStageDrill,
} from '@/views/recruiting/engine/drills'
import { FIGURE_USES } from '@/views/recruiting/engine/lineage'
import { FIGURE_METRICS } from '@/views/recruiting/engine/metricLinks'
import { STATE_NAME } from '@/views/recruiting/engine/nextStep'
import type { PipelineCell } from '@/views/recruiting/engine/pipeline'
import { NEXT_STATES } from '@/views/recruiting/engine/types'
import { PipelineBars } from '@/views/recruiting/ui/PipelineBars'
import {
  attritionByQuarter,
  type QuarterRateRow,
  REGRETTED,
  type UnitRateRow,
  VOLUNTARY,
  voluntaryByUnit,
} from '../engine/band'
import type { ScorecardItems } from './useScorecardItems'

const LINK = 'text-meta font-medium text-link underline-offset-2 hover:underline'

const signed = (v: number) => (v > 0 ? `+${fmt(v, 'int')}` : fmt(v, 'int'))

/* ───────── how the workforce is moving ───────── */

export function MovingSection() {
  const ctx = useAnalytics()
  const m = hrbpModel(ctx)
  const p = m.prep
  const wf = m.workforce
  const asOf = formatDate(ctx.asOf)
  const yearAgo = formatDate(addDays(p.t12.start, -1))

  /* Headcount. */
  const thisYear = wf.overlay.filter((o) => o.period === LAST_YEAR)
  const first = thisYear[0]
  const end = thisYear.at(-1)
  const change = first && end ? end.headcount - first.headcount : 0
  const notes: ChartNote[] =
    first && end && first.headcount > 0 && Math.abs(change) / first.headcount >= 0.02
      ? [
          {
            at: end.x,
            series: LAST_YEAR,
            text: `${change > 0 ? 'Up' : 'Down'} ${fmt(Math.abs(change), 'int')} in 12 months`,
          },
        ]
      : []

  /* Hires and exits. */
  const hires = wf.flows.filter((r) => r.series === 'Hires').reduce((n, r) => n + r.people, 0)
  const exits = wf.flows.filter((r) => r.series === 'Exits').reduce((n, r) => n + r.people, 0)

  /* Attrition by quarter. */
  const quarters = attritionByQuarter(m)
  // A quarter's leavers, with the quarter's own dates and "Filter to" that quarter.
  const quarterSpec = (r: QuarterRateRow): DrillSpec | null =>
    r.rate == null || !r.records.length
      ? null
      : withFilter(
          leaversSpec(
            p,
            `${r.series === VOLUNTARY ? 'Voluntary' : 'Regretted'} leavers, ${r.quarter}`,
            r.records,
            {
              when: formatRange(r.quarterStart, r.quarterEnd),
              note: rateNote(
                r.records.length,
                r.series === VOLUNTARY
                  ? ['voluntary exit', 'voluntary exits']
                  : ['regretted exit', 'regretted exits'],
                r.avgHeadcount,
                3,
                p.set.annualize,
              ),
            },
          ),
          periodFilter(r.quarterStart, r.quarterEnd),
          r.quarter,
        )
  const qRange = quarters.length ? `${quarters[0].quarter} to ${quarters.at(-1)?.quarter}` : ''

  return (
    <Section
      title="How the workforce is moving"
      dek="Headcount at each month end, who joined and left, and the attrition rates the scorecard judges People stats on."
    >
      <Figure
        id="scorecard-headcount"
        metric={ID.headcount}
        uses={p.uses(FIGURE.headcountTrend)}
        title="Headcount over time"
        subtitle={`Employees at each month end, ${yearAgo} to ${asOf}, the year before as a dashed gray line`}
        data={wf.overlay}
        columns={[
          { key: 'date', label: 'Month end', format: 'date' },
          {
            key: 'headcount',
            label: 'Headcount',
            format: 'int',
            drill: (r) => drillWhen(r.headcount > 0, () => employeesOnSpec(p, r.date)),
          },
          { key: 'period', label: 'Period', format: 'text' },
        ]}
        definitions={p.defs(ID.headcount)}
        note={`${fmt(wf.series.at(-1)?.headcount ?? 0, 'int')} employees on ${asOf}`}
        span={4}
        empty={
          !p.has.terminationDate
            ? `${NO_HISTORY}.`
            : wf.series.some((r) => r.headcount > 0)
              ? null
              : 'No employees in this scope over the last 24 months.'
        }
      >
        <Lines
          data={wf.overlay}
          x="x"
          y="headcount"
          series="period"
          seriesOrder={[YEAR_BEFORE, LAST_YEAR]}
          emphasize={LAST_YEAR}
          format="int"
          notes={notes}
          onSelect={(d) => drill(() => employeesOnSpec(p, d.date))}
          ariaLabel="Headcount at each month end, this year and the year before"
        />
      </Figure>
      <Figure
        id="scorecard-flow"
        metric={ID.hires}
        uses={p.uses(FIGURE.hiresExits)}
        title="Hires and exits by month"
        subtitle={`Employees hired and employees who left, the last 12 months to ${asOf}`}
        data={wf.flows}
        columns={[
          { key: 'month', label: 'Month', format: 'text' },
          { key: 'series', label: 'Movement', format: 'text' },
          {
            key: 'people',
            label: 'Employees',
            format: 'int',
            drill: (r) => drillWhen(r.records.length > 0, () => flowSpec(p, r)),
          },
        ]}
        definitions={p.defs(ID.hires, ID.exits)}
        note={`${fmt(hires, 'int')} hires, ${fmt(exits, 'int')} exits, net ${signed(hires - exits)}`}
        span={4}
        empty={hires + exits ? null : 'No hires or exits in the last 12 months.'}
      >
        <Columns
          data={wf.flows}
          x="month"
          y="people"
          series="series"
          seriesOrder={['Hires', 'Exits']}
          xType="month"
          onSelect={(d) => drill(() => flowMonthSpec(p, wf.flows, d.month))}
          onSelectSegment={(d) => drill(() => flowSpec(p, d))}
          ariaLabel="Hires and exits by month"
        />
      </Figure>
      <Figure
        id="scorecard-attrition-trend"
        metric={ID.voluntary}
        uses={[
          ...new Set([
            ...p.uses(FIGURE.attritionByQuarter),
            ...p.uses(FIGURE.regrettedByQuarter(p.set.regretted)),
          ]),
        ]}
        title="Voluntary and regretted attrition by quarter"
        subtitle={`${p.set.annualize ? 'Annualized rates' : 'Rates, not annualized,'} per quarter, ${qRange}`}
        data={quarters}
        columns={[
          { key: 'quarter', label: 'Quarter', format: 'text' },
          { key: 'quarterEnd', label: 'Quarter end', format: 'date' },
          { key: 'series', label: 'Attrition', format: 'text' },
          { key: 'exits', label: 'Exits', format: 'int', drill: (r) => () => quarterSpec(r) },
          { key: 'avgHeadcount', label: 'Average headcount', format: 'num1' },
          { key: 'rate', label: 'Rate', format: 'pct', drill: (r) => () => quarterSpec(r) },
        ]}
        definitions={p.defs(ID.voluntary, ID.regretted)}
        note={`8 quarters to ${asOf} · quarters under ${p.set.minGroup} people are hidden`}
        span={4}
        empty={
          !p.has.terminationDate
            ? `${NO_HISTORY}.`
            : quarters.some((q) => q.rate != null)
              ? null
              : 'No attrition to show for the last 8 quarters.'
        }
      >
        <Lines<QuarterRateRow>
          data={quarters}
          x="quarterEnd"
          y="rate"
          series="series"
          seriesOrder={[VOLUNTARY, REGRETTED]}
          xTicks="quarter"
          format="pct"
          zero
          selectable={(d) => d.rate != null && d.records.length > 0}
          onSelect={(d) => drill(() => quarterSpec(d))}
          ariaLabel="Voluntary and regretted attrition by quarter"
        />
      </Figure>
    </Section>
  )
}

/* ───────── where the pressure is ───────── */

type Bucket = DueBucket | 'all' | 'critical'

function ItemsFigure({ items }: { items: ScorecardItems }) {
  const ctx = useAnalytics()
  const theme = useChartTheme()
  const { dueSoonDays } = settingsOf(ctx.metrics)
  const open = items.open
  const groups = groupByOwner(open, ctx.asOf)
  const byLabel = new Map(groups.map((g) => [g.label, g]))
  const stacked = ownerDueRows(open, ctx)
  const table = ownerTableRows(open, ctx)
  const labels = DUE_BUCKETS.map((b) => dueBucketLabel(b, dueSoonDays))
  // Due state is the figure's subject, so the segments carry status colors (and the legend's words).
  const colors: Record<string, string> = {
    [labels[0]]: theme.status.critical,
    [labels[1]]: theme.status.warning,
    [labels[2]]: theme.series[0],
    [labels[3]]: theme.deemph,
  }
  const words = (b: Bucket) =>
    b === 'all'
      ? 'open items'
      : b === 'critical'
        ? 'critical items'
        : b === 'none'
          ? 'items with no due date'
          : `items ${dueBucketLabel(b, dueSoonDays).toLowerCase()}`
  const spec = (group: string, b: Bucket): DrillSpec | null => {
    const list = (byLabel.get(group)?.items ?? []).filter(
      (a: OpenAction) =>
        b === 'all' ||
        (b === 'critical'
          ? a.item.severity === 'critical'
          : dueBucket(a.item.due, ctx.asOf, dueSoonDays) === b),
    )
    return list.length ? itemsDrill(ctx, `${group}: ${words(b)}`, list) : null
  }
  const cell = (b: Bucket) => (r: { group: string }) => () => spec(r.group, b)
  const columns: Column<(typeof table)[number]>[] = [
    { key: 'group', label: 'Owner group' },
    { key: 'open', label: 'Items', format: 'int', drill: cell('all') },
    { key: 'overdue', label: 'Overdue', format: 'int', drill: cell('overdue') },
    { key: 'soon', label: dueBucketLabel('soon', dueSoonDays), format: 'int', drill: cell('soon') },
    { key: 'later', label: 'Due later', format: 'int', drill: cell('later') },
    { key: 'none', label: 'No due date', format: 'int', drill: cell('none') },
    { key: 'critical', label: 'Critical', format: 'int', drill: cell('critical') },
  ]
  return (
    <Figure
      id="scorecard-items"
      metric={ACTIONS.open}
      uses={usesOf(open)}
      title="Where open items wait"
      subtitle={`Open items by owner group and due date, as of ${formatDate(ctx.asOf)}`}
      data={table}
      columns={columns}
      note={`${plural(open.length, 'open item')} · due within ${dueSoonDays} d counts from the as-of date`}
      span={4}
      actions={
        <RouteLink view="actions" className={LINK}>
          Action center
        </RouteLink>
      }
      className={items.stale ? 'opacity-60 transition-opacity' : undefined}
      empty={open.length ? null : 'Nothing is open in this scope.'}
    >
      <HBars<OwnerDueRow>
        data={stacked}
        y="group"
        x="items"
        series="due"
        stack
        seriesOrder={labels}
        yOrder={groups.map((g) => g.label)}
        colors={colors}
        format="int"
        onSelect={(d) => drill(() => spec(d.group, 'all'))}
        onSelectSegment={(d) => drill(() => spec(d.group, d.bucket))}
        ariaLabel="Open items by owner group, stacked by due date"
      />
    </Figure>
  )
}

export function PressureSection({ items }: { items: ScorecardItems | null }) {
  const ctx = useAnalytics()
  const m = hrbpModel(ctx)
  const p = m.prep
  const r = computeRecruiting(ctx)
  const b = r.base

  /* Voluntary attrition by business unit. */
  const units = voluntaryByUnit(m)
  const unitSpec = (u: UnitRateRow): DrillSpec | null =>
    u.rate == null || !u.leavers.length
      ? null
      : leaversSpec(p, `Voluntary leavers, ${u.group}`, u.leavers, {
          note: rateNote(
            u.voluntary,
            ['voluntary exit', 'voluntary exits'],
            u.avgHeadcount,
            p.window.months,
            p.set.annualize,
          ),
        })
  // A unit is a filterable group: its leavers carry "Filter to" and "Leave out".
  const unitDrill = byGroup(
    'businessUnit',
    (u: UnitRateRow) => (u.group === 'Not recorded' ? null : u.group),
    (u) => (u.rate == null ? null : () => unitSpec(u)),
  )
  const above = units.rows.filter((u) => u.above)
  const gapPts = fmt(p.set.voluntaryAbove.gap * 100, 'num1')

  /* Pipeline today. */
  const pipelineRows = r.pipeline.flatMap((stage) =>
    NEXT_STATES.flatMap((state) => {
      const c = stage.cells.find((x) => x.state === state)
      return c
        ? [{ stage: c.stage, state: c.label, candidates: c.candidates, lacking: c.lacking, cell: c }]
        : []
    }),
  )
  const cellDrill = (c: PipelineCell) => () => pipelineCellDrill(b, c)

  return (
    <Section
      title="Where the pressure is"
      align="start"
      dek="Business units losing people faster than the company, candidates waiting on a step, and the open items each owner group holds."
    >
      <Figure
        id="scorecard-attrition-bu"
        metric={ID.voluntary}
        uses={p.uses(all(VOLUNTARY_LINEAGE, BUSINESS_UNIT))}
        title="Voluntary attrition by business unit"
        subtitle={`Annualized voluntary attrition, ${ctx.window.label}, against the company`}
        data={units.rows}
        columns={[
          { key: 'group', label: 'Business unit', format: 'text' },
          { key: 'avgHeadcount', label: 'Average headcount', format: 'num1' },
          { key: 'voluntary', label: 'Voluntary exits', format: 'int', drill: unitDrill },
          { key: 'rate', label: 'Voluntary attrition', format: 'pct', drill: unitDrill },
        ]}
        definitions={p.defs(ID.voluntary, ID.voluntaryAbove)}
        note={[
          // The company rate the bars are read against travels with the exports too.
          units.company != null ? `Company ${fmt(units.company, 'pct')}` : '',
          above.length ? `${plural(above.length, 'unit')} at least ${gapPts} pts above the company` : '',
          `units under ${p.set.minGroup} people are hidden`,
        ]
          .filter(Boolean)
          .join(' · ')}
        span={4}
        empty={
          units.rows.some((u) => u.rate != null) ? null : 'No voluntary attrition to compare in this scope.'
        }
      >
        <BarList<UnitRateRow>
          data={units.rows}
          label="group"
          value="rate"
          format="pct"
          sort="none"
          ref={
            units.company != null
              ? { value: units.company, label: `Company ${fmt(units.company, 'pct')}` }
              : undefined
          }
          glyphTone={(u) => (u.above ? 'warning' : 'default')}
          secondary={(u) => (u.rate == null ? '' : `${fmt(u.voluntary, 'int')} exits`)}
          selectable={(u) => u.rate != null && u.leavers.length > 0}
          onSelect={(u) => drill(unitDrill(u))}
          ariaLabel="Voluntary attrition by business unit, against the company"
        />
      </Figure>
      <Figure
        id="scorecard-pipeline"
        metric={FIGURE_METRICS['recruiting-pipeline-today']}
        uses={FIGURE_USES['recruiting-pipeline-today']}
        title="Pipeline today"
        subtitle={`Active candidates by stage and next step on ${formatDate(b.asOf)}`}
        data={pipelineRows}
        columns={[
          { key: 'stage', label: 'Stage' },
          { key: 'state', label: 'Next step state' },
          { key: 'candidates', label: 'Candidates', format: 'int', drill: (x) => cellDrill(x.cell) },
          {
            key: 'lacking',
            label: 'Lacking a next step',
            format: 'int',
            drill: (x) =>
              x.lacking
                ? () =>
                    pipelineCellDrill(b, {
                      ...x.cell,
                      label: `${x.cell.label}, lacking a next step`,
                      items: x.cell.items.filter((i) => i.tier),
                    })
                : null,
          },
        ]}
        note={`${plural(b.actives.length, 'active candidate')} · as of ${formatDate(b.asOf)}`}
        span={4}
        actions={
          <RouteLink view="recruiting" tab="pipeline" className={LINK}>
            Pipeline
          </RouteLink>
        }
        empty={b.actives.length ? null : 'No active candidates on the as-of date.'}
      >
        <PipelineBars
          stages={r.pipeline}
          cellDrill={cellDrill}
          stageDrill={(stage, lackingOnly) => () => pipelineStageDrill(b, stage, lackingOnly)}
          stateDrill={(state) => () => nextStateDrill(b, state, STATE_NAME[state])}
          lackingDrill={() => lackingKpiDrill(b)}
        />
      </Figure>
      {items ? (
        <ItemsFigure items={items} />
      ) : (
        <Pending
          title="Where open items wait"
          span={4}
          height={240}
          message="Collecting open items from each view."
        />
      )}
    </Section>
  )
}
