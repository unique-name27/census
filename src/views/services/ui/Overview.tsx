import { BarList, Columns, Figure, Lines } from '@/charts'
import { cx, Grid, goTo, KpiStrip, Readout, spanClass } from '@/components'
import type { AnalyticsContext } from '@/data/context'
import { formatMonth } from '@/lib/dates'
import { fmt } from '@/lib/format'
import type { ServicesModel } from '../engine'
import { AGE_BUCKETS, BACKLOG_STATUSES } from '../engine/cases'
import { RESOLUTION_SLA_TARGET } from '../engine/catalog'
import { asOfNote, count, DEF, NeedData, NO_CASES, period } from './shared'
import { TypeOnTimeFigure } from './TransactionsTab'

export function Overview({ m, ctx }: { m: ServicesModel; ctx: AnalyticsContext }) {
  const per = period(ctx)
  const firstMonth = formatMonth(`${m.months[0]}-01`)
  const lastMonth = formatMonth(`${m.months[m.months.length - 1]}-01`)
  const slaRows = m.slaMonths.filter((r) => r.opened > 0)
  const slaValues = slaRows.flatMap((r) => (r.slaRate == null ? [] : [r.slaRate]))
  const slaFloor = Math.min(0.6, Math.floor(Math.min(...slaValues, 1) * 10) / 10)
  const openCases = (to: string) => () => goTo('services', to)

  return (
    <Grid>
      <KpiStrip kpis={m.kpis} />
      <Readout findings={m.findings} span={4} />
      {m.hasCases ? (
        <div className={cx(spanClass(8), 'flex flex-col gap-4')}>
          <Figure
            id="services-cases-by-month"
            span={12}
            title="Cases opened by month"
            subtitle={`Cases opened per month by category, the five largest plus Other, ${firstMonth} to ${lastMonth}`}
            data={m.opened.rows}
            columns={[
              { key: 'month', label: 'Month' },
              { key: 'category', label: 'Category' },
              { key: 'cases', label: 'Cases opened', format: 'int' },
            ]}
            definitions={[
              { term: 'Cases opened', text: 'Cases by the month of their opened date, every channel.' },
              {
                term: 'Other',
                text: 'Every category outside the five with the most cases over these 24 months.',
              },
            ]}
            note={asOfNote(m.asOf, count(m.cases.filter((f) => m.months.includes(f.month)).length, 'case'))}
          >
            <Columns
              data={m.opened.rows}
              x="month"
              y="cases"
              series="category"
              stack
              xType="month"
              seriesOrder={m.opened.series}
              height={300}
              onSelect={openCases('cases')}
            />
          </Figure>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
            <Figure
              id="services-sla-by-month"
              span={6}
              title="Resolution SLA by month"
              subtitle={`Share of cases opened each month that were resolved within target, ${firstMonth} to ${lastMonth}`}
              data={m.slaMonths}
              columns={[
                { key: 'month', label: 'Month' },
                { key: 'opened', label: 'Cases opened', format: 'int' },
                { key: 'slaN', label: 'Cases judged', format: 'int' },
                { key: 'slaMet', label: 'Met target', format: 'int' },
                { key: 'slaRate', label: 'Resolution SLA met', format: 'pct' },
                { key: 'responseRate', label: 'First response SLA met', format: 'pct' },
              ]}
              definitions={[DEF.resolutionSla, DEF.responseSla]}
              note={asOfNote(
                m.asOf,
                `target ${fmt(RESOLUTION_SLA_TARGET, 'pct0')}`,
                'the latest month still has cases inside their target',
              )}
              empty={m.caseCols.resolvedAt ? null : 'Upload HR cases with a resolved time to see this.'}
            >
              <Lines
                data={slaRows}
                x="month"
                y="slaRate"
                format="pct"
                ref={{
                  value: RESOLUTION_SLA_TARGET,
                  label: `target ${fmt(RESOLUTION_SLA_TARGET, 'pct0')}`,
                }}
                yDomain={[slaFloor, 1]}
                height={240}
              />
            </Figure>
            <Figure
              id="services-cases-by-category"
              span={6}
              title="Cases by category"
              subtitle={`Cases opened in the ${per}, with the share that met the resolution SLA`}
              data={m.categories}
              columns={[
                { key: 'category', label: 'Category' },
                { key: 'processId', label: 'Atlas process' },
                { key: 'team', label: 'Team' },
                { key: 'cases', label: 'Cases opened', format: 'int' },
                { key: 'share', label: 'Share of cases', format: 'pct' },
                { key: 'slaRate', label: 'Resolution SLA met', format: 'pct' },
                { key: 'open', label: 'Open now', format: 'int' },
              ]}
              definitions={[DEF.resolutionSla, DEF.anonymity]}
              note={asOfNote(m.asOf, count(m.summary.opened, 'case'))}
            >
              <BarList
                data={m.categories}
                label="category"
                value="cases"
                secondary={(d) => (d.slaRate == null ? null : `SLA ${fmt(d.slaRate, 'pct0')}`)}
                tone={(d) => (d.slaRate != null && d.slaRate < 0.8 ? 'critical' : 'default')}
                onSelect={openCases('cases')}
              />
            </Figure>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
            <Figure
              id="services-backlog-by-age"
              span={6}
              title="Open backlog by age"
              subtitle="Cases open at the as-of date, by days since they were opened and by status"
              data={m.backlog}
              columns={[
                { key: 'age', label: 'Age' },
                { key: 'status', label: 'Status' },
                { key: 'cases', label: 'Open cases', format: 'int' },
              ]}
              definitions={[DEF.backlog]}
              note={asOfNote(m.asOf, count(m.backlogTotal, 'open case'))}
              empty={m.backlogTotal ? null : 'No open cases at the as-of date.'}
            >
              <Columns
                data={m.backlog}
                x="age"
                y="cases"
                series="status"
                stack
                xOrder={AGE_BUCKETS}
                seriesOrder={BACKLOG_STATUSES}
                onSelect={openCases('cases')}
              />
            </Figure>
            <TypeOnTimeFigure
              id="services-overview-tx-on-time"
              m={m}
              ctx={ctx}
              span={6}
              onSelect={() => goTo('services', 'transactions')}
            />
          </div>
        </div>
      ) : (
        <div className={cx(spanClass(8), 'flex flex-col gap-4')}>
          <NeedData {...NO_CASES} />
          <TypeOnTimeFigure
            id="services-overview-tx-on-time"
            m={m}
            ctx={ctx}
            span={12}
            onSelect={() => goTo('services', 'transactions')}
          />
        </div>
      )}
    </Grid>
  )
}
