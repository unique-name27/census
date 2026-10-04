import { BarList, type Column, Columns, Figure, Lines } from '@/charts'
import { cx, Grid, KpiStrip, Readout, spanClass } from '@/components'
import type { AnalyticsContext } from '@/data/context'
import { drill } from '@/drill'
import { formatDate, formatMonth } from '@/lib/dates'
import { fmt } from '@/lib/format'
import type { ServicesModel } from '../engine'
import {
  AGE_BUCKETS,
  ALL_CATEGORIES,
  BACKLOG_STATUSES,
  type BacklogRow,
  type CategoryRow,
  type MonthCategoryRow,
  type MonthSlaRow,
} from '../engine/cases'
import { RESOLUTION_SLA_TARGET, TRANSACTION_ON_TIME_TARGET } from '../engine/catalog'
import {
  caseDrill,
  drillWhen,
  isLateTx,
  monthName,
  monthSub,
  onTimeDrill,
  openDrill,
  resolutionDrill,
  resolutionOutcomeDrill,
  responseDrill,
  txOutcomeDrill,
} from '../engine/drills'
import type { TxMonthRow } from '../engine/transactions'
import { asOfNote, count, DEF, NeedData, NO_CASES, period, rateTone, titled, useProcessHref } from './shared'

const hiddenMonths = (what: string) =>
  `Every month has fewer than 5 ${what} or 5 people behind it, so monthly rates are hidden to protect anonymity.`

/**
 * A value-axis floor one 5-pt step under the lowest value (or the target), so the line uses the
 * plot height instead of sitting in its top third.
 */
function floorFor(values: readonly number[], target: number): number {
  const lo = Math.min(...values, target)
  return Math.max(0, Math.round((Math.floor(lo * 20) / 20 - 0.05) * 100) / 100)
}

/** The series of the monthly volume chart in words. */
const seriesWords = (series: string): string | null =>
  series === ALL_CATEGORIES ? null : series === 'Other' ? 'other categories' : series

export function Overview({ m, ctx }: { m: ServicesModel; ctx: AnalyticsContext }) {
  const s = m.scope
  const processHref = useProcessHref()
  const per = period(ctx)
  const firstMonth = formatMonth(`${m.months[0]}-01`)
  const lastMonth = formatMonth(`${m.months[m.months.length - 1]}-01`)
  const slaRows = m.slaMonths.filter((r) => r.opened > 0)
  const slaValues = slaRows.flatMap((r) => (r.slaRate == null ? [] : [r.slaRate]))
  const txRows = m.txMonths.filter((r) => r.due > 0)
  const txValues = txRows.flatMap((r) => (r.rate == null ? [] : [r.rate]))
  const txTotal = txRows.reduce((a, r) => a + r.due, 0)
  const asOf = formatDate(m.asOf)

  /* Drill sources, shared by the charts and their table views. */
  const monthCases = (month: string) => m.slaMonths.find((r) => r.month === month)?.records
  const openedInMonth = (month: string) => () =>
    caseDrill(s, monthCases(month), {
      title: titled('Cases opened', monthName(month)),
      subtitle: monthSub(s, month),
    })
  const segmentCases = (d: MonthCategoryRow) => () =>
    caseDrill(s, d.records, {
      title: titled('Cases opened', seriesWords(d.category), monthName(d.month)),
      subtitle: monthSub(s, d.month),
    })
  const slaMonth = (d: MonthSlaRow) =>
    d.slaRate == null
      ? null
      : () =>
          resolutionDrill(
            s,
            d.records,
            titled('Cases judged on resolution SLA', `opened ${monthName(d.month)}`),
            monthSub(s, d.month),
          )
  const txMonth = (d: TxMonthRow) =>
    d.rate == null
      ? null
      : () =>
          onTimeDrill(s, d.records, titled('Transactions due', monthName(d.month)), {
            subtitle: monthSub(s, d.month),
          })
  const categoryCases = (d: CategoryRow) => () =>
    caseDrill(s, d.records, { title: titled('Cases opened', d.category, per) })
  const backlogCell = (d: BacklogRow) => () =>
    openDrill(s, d.records, titled('Open cases', `aged ${d.age}`, d.status.toLowerCase()))
  const backlogAge = (age: string) => () =>
    openDrill(
      s,
      m.backlog.filter((r) => r.age === age).flatMap((r) => r.records),
      titled('Open cases', `aged ${age}`),
    )

  const txColumns: Column<TxMonthRow>[] = [
    { key: 'month', label: 'Due month' },
    { key: 'due', label: 'Due and judged', format: 'int', drill: txMonth },
    {
      key: 'onTime',
      label: 'On time',
      format: 'int',
      drill: (r) =>
        r.onTime
          ? () =>
              txOutcomeDrill(
                s,
                r.records,
                (f) => f.outcome === 'on-time',
                titled('Transactions on time', `due ${monthName(r.month)}`),
                { subtitle: monthSub(s, r.month) },
              )
          : null,
    },
    {
      key: 'late',
      label: 'Late or open past due',
      format: 'int',
      drill: (r) =>
        r.late
          ? () =>
              txOutcomeDrill(
                s,
                r.records,
                isLateTx,
                titled('Transactions late or open past due', `due ${monthName(r.month)}`),
                {
                  subtitle: monthSub(s, r.month),
                },
              )
          : null,
    },
    { key: 'rate', label: 'On time %', format: 'pct', drill: txMonth },
  ]

  const txFigure = (
    <Figure
      id="services-tx-on-time-by-month"
      uses={m.uses['services-tx-on-time-by-month']}
      span={m.hasCases ? 6 : 12}
      title="Transactions on time by month"
      subtitle={`Share of HR transactions due each month that were completed by their due date, ${firstMonth} to ${lastMonth}`}
      data={m.txMonths}
      columns={txColumns}
      definitions={[DEF.onTime, DEF.anonymity]}
      note={asOfNote(
        m.asOf,
        count(txTotal, 'transaction'),
        `target ${fmt(TRANSACTION_ON_TIME_TARGET, 'pct0')}`,
      )}
      empty={
        !m.hasTx
          ? 'Upload HR transactions to see this.'
          : !m.txCols.dueDate
            ? 'Upload HR transactions with a due date column to see this.'
            : txValues.length
              ? null
              : hiddenMonths('transactions')
      }
    >
      <Lines
        data={txRows}
        x="month"
        y="rate"
        format="pct"
        ref={{
          value: TRANSACTION_ON_TIME_TARGET,
          label: `target ${fmt(TRANSACTION_ON_TIME_TARGET, 'pct0')}`,
        }}
        yDomain={[floorFor(txValues, TRANSACTION_ON_TIME_TARGET), 1]}
        xTicks="quarter"
        height={240}
        onSelect={(d) => drill(txMonth(d))}
      />
    </Figure>
  )

  const slaColumns: Column<MonthSlaRow>[] = [
    { key: 'month', label: 'Month' },
    {
      key: 'opened',
      label: 'Cases opened',
      format: 'int',
      drill: (r) => drillWhen(s, r.records, openedInMonth(r.month)),
    },
    { key: 'slaN', label: 'Cases with an outcome', format: 'int', drill: slaMonth },
    {
      key: 'slaMet',
      label: 'Met target',
      format: 'int',
      drill: (r) =>
        r.slaMet
          ? () =>
              resolutionOutcomeDrill(
                s,
                r.records,
                true,
                titled('Cases that met the resolution SLA', `opened ${monthName(r.month)}`),
              )
          : null,
    },
    { key: 'slaRate', label: 'Resolution SLA met', format: 'pct', drill: slaMonth },
    {
      key: 'responseRate',
      label: 'First response SLA met',
      format: 'pct',
      drill: (r) =>
        r.responseRate == null
          ? null
          : () =>
              responseDrill(
                s,
                r.records,
                titled('Cases judged on first response SLA', `opened ${monthName(r.month)}`),
                monthSub(s, r.month),
              ),
    },
  ]

  const categoryColumns: Column<CategoryRow>[] = [
    { key: 'category', label: 'Category' },
    { key: 'processId', label: 'Atlas process', href: (r) => processHref(r.processId) },
    { key: 'team', label: 'Team' },
    {
      key: 'cases',
      label: 'Cases opened',
      format: 'int',
      drill: (r) => drillWhen(s, r.records, categoryCases(r)),
    },
    {
      key: 'share',
      label: 'Share of cases',
      format: 'pct',
      drill: (r) => drillWhen(s, r.records, categoryCases(r)),
    },
    {
      key: 'slaRate',
      label: 'Resolution SLA met',
      format: 'pct',
      drill: (r) =>
        r.slaRate == null
          ? null
          : () => resolutionDrill(s, r.records, titled('Cases judged on resolution SLA', r.category, per)),
    },
    {
      key: 'open',
      label: 'Open now',
      format: 'int',
      drill: (r) =>
        drillWhen(s, r.openRecords, () =>
          openDrill(s, r.openRecords, titled('Open cases', r.category, `at ${asOf}`)),
        ),
    },
  ]

  return (
    <Grid>
      <KpiStrip kpis={m.kpis} />
      <Readout findings={m.findings} span={4} />
      {m.hasCases ? (
        <div className={cx(spanClass(8), 'flex flex-col gap-4')}>
          <Figure
            id="services-cases-by-month"
            uses={m.uses['services-cases-by-month']}
            span={12}
            title="Cases opened by month"
            subtitle={`Cases opened per month by category, the five largest plus Other, ${firstMonth} to ${lastMonth}`}
            data={m.opened.rows}
            columns={[
              { key: 'month', label: 'Month' },
              { key: 'category', label: 'Category' },
              {
                key: 'cases',
                label: 'Cases opened',
                format: 'int',
                drill: (r: MonthCategoryRow) => drillWhen(s, r.records, segmentCases(r)),
              },
            ]}
            definitions={[
              { term: 'Cases opened', text: 'Cases by the month of their opened date, every channel.' },
              {
                term: 'Other',
                text: 'Every category outside the five with the most cases over these 24 months, and any category behind fewer than 5 people.',
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
              labels={false}
              height={300}
              onSelect={(d) => drill(openedInMonth(d.month))}
              onSelectSegment={(d) => drill(segmentCases(d))}
            />
          </Figure>
          <Grid>
            <Figure
              id="services-sla-by-month"
              uses={m.uses['services-sla-by-month']}
              span={6}
              title="Resolution SLA by month"
              subtitle={`Share of cases opened each month that were resolved within target, ${firstMonth} to ${lastMonth}`}
              data={m.slaMonths}
              columns={slaColumns}
              definitions={[DEF.resolutionSla, DEF.responseSla, DEF.anonymity]}
              note={asOfNote(
                m.asOf,
                `target ${fmt(RESOLUTION_SLA_TARGET, 'pct0')}`,
                'the latest month still has cases inside their target',
              )}
              empty={
                !m.caseCols.resolvedAt
                  ? 'Upload HR cases with a resolved time to see this.'
                  : slaValues.length
                    ? null
                    : hiddenMonths('cases')
              }
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
                yDomain={[floorFor(slaValues, RESOLUTION_SLA_TARGET), 1]}
                xTicks="quarter"
                height={240}
                onSelect={(d) => drill(slaMonth(d))}
              />
            </Figure>
            <Figure
              id="services-cases-by-category"
              uses={m.uses['services-cases-by-category']}
              span={6}
              title="Cases by category"
              subtitle={`Cases opened in the ${per}, with the share that met the resolution SLA`}
              data={m.categories}
              columns={categoryColumns}
              definitions={[
                DEF.resolutionSla,
                {
                  term: 'Status mark',
                  text: `Shown beside the count when the category's resolution SLA is under the ${fmt(RESOLUTION_SLA_TARGET, 'pct0')} target: warning under target, critical 10 pts or more under it (the same marks as on the Cases tab).`,
                },
                DEF.anonymity,
              ]}
              note={asOfNote(m.asOf, count(m.summary.opened, 'case'))}
            >
              <BarList
                data={m.categories}
                label="category"
                value="cases"
                secondary={(d) => (d.slaRate == null ? null : `SLA ${fmt(d.slaRate, 'pct0')}`)}
                glyphTone={(d) => rateTone(d.slaRate, RESOLUTION_SLA_TARGET)}
                onSelect={(d) => drill(categoryCases(d))}
              />
            </Figure>
            <Figure
              id="services-backlog-by-age"
              uses={m.uses['services-backlog-by-age']}
              span={6}
              title="Open backlog by age"
              subtitle="Cases open at the as-of date, by days since they were opened and by status"
              data={m.backlog}
              columns={[
                { key: 'age', label: 'Age' },
                { key: 'status', label: 'Status' },
                {
                  key: 'cases',
                  label: 'Open cases',
                  format: 'int',
                  drill: (r: BacklogRow) => drillWhen(s, r.records, backlogCell(r)),
                },
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
                onSelect={(d) => drill(backlogAge(d.age))}
                onSelectSegment={(d) => drill(backlogCell(d))}
              />
            </Figure>
            {txFigure}
          </Grid>
        </div>
      ) : (
        <div className={cx(spanClass(8), 'flex flex-col gap-4')}>
          <NeedData {...NO_CASES} />
          <Grid>{txFigure}</Grid>
        </div>
      )}
    </Grid>
  )
}
