import { Columns, Figure, Lines } from '@/charts'
import { Grid, KpiStrip, Readout } from '@/components'
import { useAnalytics } from '@/data/context'
import { BELOW_STANDARD_TEXT } from '@/data/quality'
import { drill } from '@/drill/Drill'
import { addDays, formatDate } from '@/lib/dates'
import { fmt } from '@/lib/format'
import type { HrbpModel } from '../engine'
import { NO_HISTORY } from '../engine/base'
import { bridgeSpec, flowMonthSpec, flowSpec, type ScoreCell, scoreSpec } from '../engine/buckets'
import { employeesOnSpec } from '../engine/drill'
import { FIGURE, PROMOTION_RATE } from '../engine/lineage'
import { SCORE_METRICS, type ScoreMetric, type ScoreRow } from '../engine/scorecard'
import { LAST_YEAR, YEAR_BEFORE } from '../engine/workforce'
import { ANONYMITY_ID, ID } from './defs'
import { drillWhen } from './drill'
import { rescope } from './model'
import { ScorecardTable } from './ScorecardTable'

const METRIC_LABEL: Record<ScoreMetric, string> = {
  voluntary: 'Voluntary',
  regretted: 'Regretted',
  firstYear: 'First-year',
  promotionRate: 'Promotion rate',
  avgSpan: 'Avg span',
}

const signed = (v: number) => (v > 0 ? `+${fmt(v, 'int')}` : fmt(v, 'int'))

export function Overview({ m }: { m: HrbpModel }) {
  const ctx = useAnalytics()
  const asOf = formatDate(ctx.asOf)
  const wf = m.workforce
  const series = wf.series
  const last = series[series.length - 1]
  const yearAgo = formatDate(addDays(m.prep.t12.start, -1))
  const flowsTotal = wf.flows.reduce((a, r) => a + r.people, 0)
  const step = (name: string) => wf.bridge.find((b) => b.step === name)?.people ?? 0
  const hires = step('Hires')
  const exits = Math.abs(step('Exits'))
  // The bridge adds something only when hires and exits don't explain the change on their own.
  const showBridge = wf.bridge.length > 4
  const card = m.scorecard
  // The readout shows up to 6 findings. When it shows 5 or more it runs past the trend and flows
  // charts, so the scorecard fills the column beside it; a short readout leaves the scorecard
  // full width below, so neither column runs on alone.
  const scorecardBeside = Math.min(m.findings.length, 6) >= 5
  const p = m.prep
  // Scorecard cells open the records behind them; the row itself still rescopes the app.
  const scoreDrill = (row: ScoreRow, cell: ScoreCell) => scoreSpec(p, row, cell)
  const scoreCol = (cell: ScoreCell) => (x: { source: ScoreRow }) => scoreDrill(x.source, cell)
  // Promotion rate comes from Job changes. Below the data standard its column drops out, so the
  // scorecard still shows in a meeting held to that standard.
  const withPromotions = p.meets(PROMOTION_RATE)
  const metrics = SCORE_METRICS.filter((k) => withPromotions || k !== 'promotionRate')

  const scorecard = (
    <Figure
      id="hrbp-scorecard"
      metric={ID.scorecard}
      uses={p.uses(FIGURE.scorecard(card.dim, withPromotions, p.set.regretted))}
      title="Sub-org scorecard"
      subtitle={`${
        ctx.filters.leaderId ? 'Each direct report’s organization' : card.rowsLabel
      } against the company: headcount on ${asOf}, rates over ${ctx.window.label}. Select a row to focus on it.`}
      data={card.rows.map((r) => ({
        organization: r.label,
        role: r.sublabel,
        headcount: r.headcount,
        netChange: r.netChange,
        voluntary: r.voluntary,
        regretted: r.regretted,
        firstYear: r.firstYear,
        promotionRate: withPromotions ? r.promotionRate : null,
        avgSpan: r.avgSpan,
        offCompany: metrics
          .filter((k) => r.shade[k])
          .map((k) => `${METRIC_LABEL[k]} ${r.shade[k]}`)
          .join('; '),
        // Not a column: the engine row behind the table row, for its drills.
        source: r,
      }))}
      columns={[
        { key: 'organization', label: 'Organization', format: 'text' },
        { key: 'role', label: 'Role or note', format: 'text' },
        { key: 'headcount', label: 'Headcount', format: 'int', drill: scoreCol('headcount') },
        { key: 'netChange', label: 'Net change, 12 mo', format: 'int', drill: scoreCol('netChange') },
        { key: 'voluntary', label: 'Voluntary attrition', format: 'pct', drill: scoreCol('voluntary') },
        { key: 'regretted', label: 'Regretted attrition', format: 'pct', drill: scoreCol('regretted') },
        { key: 'firstYear', label: 'First-year attrition', format: 'pct', drill: scoreCol('firstYear') },
        ...(withPromotions
          ? [
              {
                key: 'promotionRate' as const,
                label: 'Promotion rate',
                format: 'pct' as const,
                drill: scoreCol('promotionRate'),
              },
            ]
          : []),
        { key: 'avgSpan', label: 'Avg span', format: 'num1', drill: scoreCol('avgSpan') },
        { key: 'offCompany', label: 'Materially off the company', format: 'text' },
      ]}
      definitions={p.defs(
        ID.headcount,
        ID.netChange,
        ID.voluntary,
        ID.regretted,
        ID.firstYear,
        ...(withPromotions ? [ID.promotionRate] : []),
        ID.meanSpan,
        ID.scorecard,
        ANONYMITY_ID,
      )}
      note={`Orgs under ${p.set.minGroup} employees are folded into Other · as of ${asOf}${
        withPromotions
          ? ''
          : ` · promotion rate not shown: ${BELOW_STANDARD_TEXT[ctx.standard].toLowerCase()}`
      }`}
      // The body is an HTML table: no chart image to export (PNG and SVG would be empty).
      image={false}
      empty={card.rows.length ? null : 'No sub-organizations to compare in this scope.'}
    >
      <ScorecardTable
        rows={card.rows}
        rule={card.rule}
        onPick={(row) => {
          if (row.filter) rescope(ctx, row.filter)
        }}
        drillFor={scoreDrill}
        hide={withPromotions ? [] : ['promotionRate']}
      />
    </Figure>
  )

  return (
    <Grid>
      <KpiStrip kpis={m.kpi.kpis} />
      {/* Full width on tablets (the column beside it is full width there too), 4 of 12 from lg. */}
      <div className="col-span-full min-w-0 lg:col-span-4">
        <Readout findings={m.findings} span={12} emptyText="Nothing unusual in this scope for this period." />
      </div>
      {/* The lead figure and the monthly flows (and the scorecard, beside a long readout) stack beside the readout. */}
      <div className="col-span-full flex min-w-0 flex-col gap-4 lg:col-span-8">
        <Figure
          id="hrbp-headcount-trend"
          metric={ID.headcount}
          uses={p.uses(FIGURE.headcountTrend)}
          title="Headcount over time"
          subtitle={`Employees at each month end, ${yearAgo} to ${asOf}, with the year before in gray on the same months`}
          data={series}
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
          note={`${last ? last.headcount.toLocaleString('en-US') : 0} employees on ${asOf} · ${
            p.set.countContractors
              ? 'contractors included, interns excluded'
              : 'contractors and interns excluded'
          }`}
          empty={
            !m.prep.has.terminationDate
              ? `${NO_HISTORY}.`
              : series.some((r) => r.headcount > 0)
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
            height={350}
            onSelect={(d) => drill(() => employeesOnSpec(p, d.date))}
          />
        </Figure>
        <Grid>
          <Figure
            id="hrbp-hires-exits"
            metric={ID.hires}
            uses={p.uses(FIGURE.hiresExits)}
            title="Hires and exits by month"
            subtitle={`Employees hired and employees who left, ${wf.flows[0] ? formatDate(`${wf.flows[0].month}-01`) : ''} to ${asOf}`}
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
            note={`${hires.toLocaleString('en-US')} hires, ${exits.toLocaleString('en-US')} exits, net ${signed(hires - exits)} · as of ${asOf}`}
            span={showBridge ? 7 : 12}
            empty={flowsTotal ? null : 'No hires or exits in the last 12 months.'}
          >
            <Columns
              data={wf.flows}
              x="month"
              y="people"
              series="series"
              seriesOrder={['Hires', 'Exits']}
              xType="month"
              height={showBridge ? undefined : 260}
              onSelect={(d) => drill(() => flowMonthSpec(p, wf.flows, d.month))}
              onSelectSegment={(d) => drill(() => flowSpec(p, d))}
            />
          </Figure>
          {showBridge && (
            <Figure
              id="hrbp-headcount-bridge"
              metric={ID.bridge}
              uses={p.uses(FIGURE.bridge)}
              title="Headcount bridge"
              subtitle="From headcount 12 months ago to today"
              data={wf.bridge}
              columns={[
                { key: 'step', label: 'Step', format: 'text' },
                {
                  key: 'people',
                  label: 'Employees',
                  format: 'int',
                  drill: (r) => drillWhen(r.records.length > 0, () => bridgeSpec(p, r)),
                },
              ]}
              definitions={p.defs(ID.headcount, ID.bridge)}
              note={`As of ${asOf}`}
              span={5}
              tableOnly
              table={{ maxRows: 8 }}
            />
          )}
        </Grid>
        {scorecardBeside && scorecard}
      </div>
      {!scorecardBeside && scorecard}
    </Grid>
  )
}
