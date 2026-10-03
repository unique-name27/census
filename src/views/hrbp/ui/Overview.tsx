import { Columns, Figure, Lines } from '@/charts'
import { cx, Grid, KpiStrip, Readout, Section, spanClass } from '@/components'
import { useAnalytics } from '@/data/context'
import { formatDate } from '@/lib/dates'
import type { HrbpModel } from '../engine'
import { SCORE_METRICS, type ScoreMetric } from '../engine/scorecard'
import { LAST_YEAR, YEAR_BEFORE } from '../engine/workforce'
import { DEF } from './defs'
import { rescope } from './model'
import { ScorecardTable } from './ScorecardTable'

const METRIC_LABEL: Record<ScoreMetric, string> = {
  voluntary: 'Voluntary',
  regretted: 'Regretted',
  firstYear: 'First-year',
  promotionRate: 'Promotion rate',
  avgSpan: 'Avg span',
}

export function Overview({ m }: { m: HrbpModel }) {
  const ctx = useAnalytics()
  const asOf = formatDate(ctx.asOf)
  const wf = m.workforce
  const series = wf.series
  // The boundary month belongs to both lines so they join; the exported rows keep one row per month.
  const boundary = series.findLast((r) => r.period === YEAR_BEFORE)
  const chartRows = boundary ? [...series, { ...boundary, period: LAST_YEAR }] : series
  const first = series[0]
  const last = series[series.length - 1]
  const flowsTotal = wf.flows.reduce((a, r) => a + r.people, 0)
  const card = m.scorecard

  return (
    <>
      <Grid>
        <KpiStrip kpis={m.kpi.kpis} />
        <Readout findings={m.findings} span={4} emptyText="Nothing unusual in this scope for this period." />
        {/* The lead figure and the monthly flows stack beside the readout so the column fills. */}
        <div className={cx(spanClass(8), 'flex flex-col gap-4')}>
          <Figure
            id="hrbp-headcount-trend"
            title="Headcount over time"
            subtitle={`Employees at each month end, ${formatDate(first?.date)} to ${asOf}, with the year before in gray`}
            data={series}
            columns={[
              { key: 'date', label: 'Month end', format: 'date' },
              { key: 'headcount', label: 'Headcount', format: 'int' },
              { key: 'period', label: 'Period', format: 'text' },
            ]}
            definitions={[DEF.headcount]}
            note={`${last ? last.headcount.toLocaleString('en-US') : 0} employees on ${asOf} · contractors and interns excluded`}
            span={12}
            empty={
              series.some((r) => r.headcount > 0)
                ? null
                : 'No employees in this scope over the last 24 months.'
            }
          >
            <Lines
              data={chartRows}
              x="date"
              y="headcount"
              series="period"
              seriesOrder={[YEAR_BEFORE, LAST_YEAR]}
              emphasize={LAST_YEAR}
              format="int"
              height={300}
            />
          </Figure>
          <Grid>
            <Figure
              id="hrbp-hires-exits"
              title="Hires and exits by month"
              subtitle={`Employees hired and employees who left, ${wf.flows[0] ? formatDate(`${wf.flows[0].month}-01`) : ''} to ${asOf}`}
              data={wf.flows}
              columns={[
                { key: 'month', label: 'Month', format: 'text' },
                { key: 'series', label: 'Movement', format: 'text' },
                { key: 'people', label: 'Employees', format: 'int' },
              ]}
              definitions={[
                { term: 'Hire', text: 'An employee whose hire date falls in the month.' },
                { term: 'Exit', text: 'An employee whose termination date falls in the month.' },
              ]}
              note={`${wf.bridge.find((b) => b.step === 'Hires')?.people ?? 0} hires and ${Math.abs(wf.bridge.find((b) => b.step === 'Exits')?.people ?? 0)} exits · as of ${asOf}`}
              span={7}
              empty={flowsTotal ? null : 'No hires or exits in the last 12 months.'}
            >
              <Columns
                data={wf.flows}
                x="month"
                y="people"
                series="series"
                seriesOrder={['Hires', 'Exits']}
                xType="month"
              />
            </Figure>
            <Figure
              id="hrbp-headcount-bridge"
              title="Headcount bridge"
              subtitle="From headcount 12 months ago to today"
              data={wf.bridge}
              columns={[
                { key: 'step', label: 'Step', format: 'text' },
                { key: 'people', label: 'Employees', format: 'int' },
              ]}
              definitions={[
                DEF.headcount,
                {
                  term: 'Other changes',
                  text: 'Changes that are neither hires nor exits in this scope, such as contractor conversions, rehires or people whose records moved in or out of the selected org.',
                },
              ]}
              note={`As of ${asOf}`}
              span={5}
              tableOnly
              table={{ maxRows: 8 }}
            />
          </Grid>
        </div>
      </Grid>

      <Section
        title="Sub-organizations"
        dek={
          ctx.filters.leaderId
            ? 'Each direct report’s organization against the company. Select a row to focus on that org.'
            : `${card.rowsLabel} in this scope against the company. Select a row to focus on it.`
        }
      >
        <Figure
          id="hrbp-scorecard"
          title="Sub-org scorecard"
          subtitle={`${card.rowsLabel}: headcount on ${asOf}, rates over ${ctx.window.label}`}
          data={card.rows.map((r) => ({
            organization: r.label,
            role: r.sublabel,
            headcount: r.headcount,
            netChange: r.netChange,
            voluntary: r.voluntary,
            regretted: r.regretted,
            firstYear: r.firstYear,
            promotionRate: r.promotionRate,
            avgSpan: r.avgSpan,
            offCompany: SCORE_METRICS.filter((k) => r.shade[k])
              .map((k) => `${METRIC_LABEL[k]} ${r.shade[k]}`)
              .join('; '),
          }))}
          columns={[
            { key: 'organization', label: 'Organization', format: 'text' },
            { key: 'role', label: 'Role or note', format: 'text' },
            { key: 'headcount', label: 'Headcount', format: 'int' },
            { key: 'netChange', label: 'Net change, 12 mo', format: 'int' },
            { key: 'voluntary', label: 'Voluntary attrition', format: 'pct' },
            { key: 'regretted', label: 'Regretted attrition', format: 'pct' },
            { key: 'firstYear', label: 'First-year attrition', format: 'pct' },
            { key: 'promotionRate', label: 'Promotion rate', format: 'pct' },
            { key: 'avgSpan', label: 'Avg span', format: 'num1' },
            { key: 'offCompany', label: 'Materially off the company', format: 'text' },
          ]}
          definitions={[
            DEF.voluntary,
            DEF.regretted,
            DEF.firstYear,
            DEF.promotionRate,
            DEF.span,
            DEF.suppressed,
          ]}
          note={`Orgs under 5 employees are folded into Other · as of ${asOf}`}
          empty={card.rows.length ? null : 'No sub-organizations to compare in this scope.'}
        >
          <ScorecardTable
            rows={card.rows}
            onPick={(row) => {
              if (row.filter) rescope(ctx, row.filter)
            }}
          />
        </Figure>
      </Section>
    </>
  )
}
