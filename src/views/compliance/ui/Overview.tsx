import { BarList, type Column, Columns, Figure } from '@/charts'
import { Grid, KpiStrip, Readout, Section } from '@/components'
import type { AnalyticsContext } from '@/data/context'
import { drill } from '@/drill'
import { formatMonth } from '@/lib/dates'
import type { ComplianceView } from '../engine'
import { expiryDrill } from '../engine/drills'
import { USES } from '../engine/lineage'
import { asOfNote, daysText, ofText, people, targetPct } from '../engine/wording'
import type { MonthUnitRow, QuarterRow } from '../engine/work'
import { M } from '../metrics'
import { DeadlinesFigure } from './DeadlinesTab'
import { defs, NeedData, NO_RTW } from './shared'
import { TrainingSummary } from './TrainingSummary'

interface MonthRow extends MonthUnitRow {
  monthLabel: string
  notStarted: number
}

export function Overview({ m, ctx }: { m: ComplianceView; ctx: AnalyticsContext }) {
  const s = m.scope
  const w = m.work
  const cfg = m.settings
  const has = m.base.has.rightToWork

  const monthRows: MonthRow[] = w.byMonth.map((r) => ({
    ...r,
    monthLabel: formatMonth(`${r.month}-01`),
    notStarted: r.rows.filter((x) => !x.startedDate).length,
  }))
  // Every month of the planning window shows, even one with nothing ending.
  const chartRows: MonthRow[] = [...monthRows]
  for (const month of w.months)
    if (!monthRows.some((r) => r.month === month))
      chartRows.push({
        month,
        monthLabel: formatMonth(`${month}-01`),
        businessUnit: w.units[0] ?? 'None',
        people: 0,
        notStarted: 0,
        rows: [],
      })
  chartRows.sort((a, b) => a.month.localeCompare(b.month))

  const cellDrill = (r: MonthUnitRow) =>
    r.rows.length
      ? () =>
          expiryDrill(s, r.rows, {
            title: `Work authorizations ending in ${formatMonth(`${r.month}-01`)}, ${r.businessUnit}`,
            uses: USES.expiringByUnit,
          })
      : null
  const monthDrill = (month: string) => {
    const rows = w.expiringHorizon.filter((x) => x.expiryDate.startsWith(month))
    return rows.length
      ? () =>
          expiryDrill(s, rows, {
            title: `Work authorizations ending in ${formatMonth(`${month}-01`)}`,
            uses: USES.expiring,
          })
      : null
  }
  const monthColumns: Column<MonthRow>[] = [
    { key: 'monthLabel', label: 'Month' },
    { key: 'businessUnit', label: 'Business unit' },
    { key: 'people', label: 'Authorizations ending', format: 'int', drill: cellDrill },
    {
      key: 'notStarted',
      label: 'Reverification not started',
      format: 'int',
      drill: (r) => {
        const rows = r.rows.filter((x) => !x.startedDate)
        return rows.length
          ? () =>
              expiryDrill(s, rows, {
                title: `Reverification not started, ending in ${r.monthLabel}, ${r.businessUnit}`,
                uses: USES.reverificationByUnit,
              })
          : null
      },
    },
  ]

  const target = cfg.targets.reverification
  const quarterDrill = (r: QuarterRow, which: 'all' | 'onTime' | 'late') => {
    const rows =
      which === 'all'
        ? r.rows
        : r.rows.filter((x) => (which === 'onTime' ? x.status === 'On time' : x.status !== 'On time'))
    return rows.length
      ? () =>
          expiryDrill(s, rows, {
            title: `Authorizations ending in ${r.quarter}${which === 'onTime' ? ', reverification on time' : which === 'late' ? ', reverification late or not started' : ''}`,
            uses: USES.reverification,
          })
      : null
  }
  const quarterColumns: Column<QuarterRow>[] = [
    { key: 'quarter', label: 'Expiry quarter' },
    { key: 'judged', label: 'Judged', format: 'int', drill: (r) => quarterDrill(r, 'all') },
    { key: 'onTime', label: 'Started on time', format: 'int', drill: (r) => quarterDrill(r, 'onTime') },
    { key: 'late', label: 'Late or not started', format: 'int', drill: (r) => quarterDrill(r, 'late') },
    {
      key: 'rate',
      label: 'On time %',
      format: 'pct',
      drill: (r) => (r.rate == null ? null : quarterDrill(r, 'all')),
    },
  ]
  const shownQuarters = w.byQuarter.filter((r) => r.rate != null)

  return (
    <>
      <Grid>
        <KpiStrip kpis={m.kpis} />
        <Readout findings={m.findings} span={4} />
        {has ? (
          <Figure
            id="compliance-expiries-by-month"
            uses={USES.expiringByUnit}
            metric={M.expiring}
            span={8}
            title="Authorization expiries by month"
            subtitle={`Work authorizations of active people ending in the next ${daysText(cfg.horizonDays)}, by business unit`}
            data={monthRows}
            columns={monthColumns}
            definitions={defs(ctx.metrics, [M.expiring, M.reverificationOverdue])}
            note={asOfNote(
              m.base.asOf,
              `${people(w.expiringHorizon.length)}`,
              w.overdue.length ? `${people(w.overdue.length)} with reverification overdue` : null,
            )}
            empty={
              !m.base.has.expiry
                ? 'Upload Right to work with an authorization expiry column to see this.'
                : w.expiringHorizon.length
                  ? null
                  : `No work authorization ends in the next ${daysText(cfg.horizonDays)}.`
            }
          >
            <Columns
              data={chartRows}
              x="month"
              y="people"
              series="businessUnit"
              stack
              xType="month"
              seriesOrder={w.units}
              height={300}
              onSelect={(d) => drill(monthDrill(d.month))}
              onSelectSegment={(d) => drill(cellDrill(d))}
            />
          </Figure>
        ) : (
          <NeedData {...NO_RTW} span={8} />
        )}
      </Grid>

      <Section
        title="Verification and training"
        dek="Whether reverification starts early enough, and how required training and policy acknowledgments stand. Training lives in Talent and acknowledgments in Onboarding; the numbers here link there."
      >
        <Figure
          id="compliance-reverification-by-quarter"
          uses={USES.reverification}
          metric={M.reverificationOnTime}
          span={6}
          title="Reverification on time by quarter"
          subtitle={`Share of authorizations whose reverification started at least ${daysText(cfg.leadDays)} before expiry, by the quarter they end in`}
          data={w.byQuarter}
          columns={quarterColumns}
          definitions={defs(ctx.metrics, [M.reverificationOnTime])}
          note={asOfNote(
            m.base.asOf,
            w.reverification.judged.length
              ? `${ofText(w.reverification.onTime.length, w.reverification.judged.length)} on time`
              : null,
            target != null ? `target ${targetPct(target)}` : null,
          )}
          empty={
            !has
              ? 'Upload Right to work to see this.'
              : !w.reverification.judged.length
                ? 'No authorization is due for reverification yet.'
                : shownQuarters.length
                  ? null
                  : `Every quarter has fewer than ${cfg.minGroup} authorizations judged, so the shares are hidden to protect anonymity.`
          }
        >
          <BarList
            data={w.byQuarter}
            label="quarter"
            value="rate"
            format="pct"
            sort="none"
            domain={[0, 1]}
            ref={target != null ? { value: target, label: `target ${targetPct(target)}` } : undefined}
            secondary={(d) => (d.rate == null ? `${d.judged} judged` : ofText(d.onTime, d.judged))}
            glyphTone={(d) =>
              d.rate == null || target == null || d.rate >= target
                ? 'default'
                : d.rate < target - 0.1
                  ? 'critical'
                  : 'warning'
            }
            nullNote={`Hidden to protect anonymity (n < ${cfg.minGroup})`}
            onSelect={(d) => drill(quarterDrill(d, 'all'))}
          />
        </Figure>
        <TrainingSummary m={m} ctx={ctx} span={6} />
      </Section>

      <Section
        title="Statutory deadlines"
        dek={`Calendar entries in the next ${daysText(cfg.deadlineDays)} for the jurisdictions where people in this scope work. The Deadlines tab has the detail and the sources.`}
      >
        <DeadlinesFigure m={m} ctx={ctx} compact />
      </Section>
    </>
  )
}
