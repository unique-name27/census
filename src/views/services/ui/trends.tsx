/**
 * The HR ops figures added with the design refresh (docs/CHARTS.md, HR ops): the lead of the Cases
 * tab (open cases at each month end), cases per 100 employees by business unit, the lead of HR
 * transactions (on time by type and quarter) and of Leave & return (people on leave at each month
 * end). Their numbers come from engine/trends.ts and engine/rates.ts, their records through the
 * view's drill gate.
 */
import { BarList, type ChartNote, type Column, Figure, Heatmap, Lines } from '@/charts'
import { useChartHeight, useNarrow } from '@/components/useNarrow'
import type { AnalyticsContext } from '@/data/context'
import { drill } from '@/drill'
import { formatDate, formatMonth } from '@/lib/dates'
import { fmt } from '@/lib/format'
import type { ServicesModel } from '../engine'
import { servicesDefinitions } from '../engine/definitions'
import { drillWhen, lockedReason } from '../engine/drills'
import type { UnitRateRow } from '../engine/rates'
import { pctWords } from '../engine/settings'
import { backlogPointDrill, onLeavePointDrill, typeQuarterDrill } from '../engine/trendDrills'
import type { BacklogPoint, OnLeavePoint, TypeQuarterCell } from '../engine/trends'
import { isOther } from '../engine/util'
import { FIGURE_METRIC } from '../metrics'
import { unitCasesDrill } from './drill'
import { asOfNote, count, period } from './shared'

/* ───────────── open cases at each month end ───────────── */

interface BacklogLine {
  date: string
  series: string
  cases: number
  point: BacklogPoint
  aged: boolean
}

export function CasesOpenTrendFigure({ m, ctx }: { m: ServicesModel; ctx: AnalyticsContext }) {
  const s = m.scope
  const D = servicesDefinitions(ctx.metrics, m.settings)
  const height = useChartHeight('lead')
  const days = m.settings.agedDays
  const open = 'Open'
  const aged = `Open longer than ${count(days, 'day')}`
  const rows = m.backlogTrend
  const records = (p: BacklogPoint, old: boolean) => (old ? p.agedRecords : p.records)
  const pointDrill = (p: BacklogPoint, old: boolean) =>
    drillWhen(s, records(p, old), () => backlogPointDrill(s, p, old ? days : false))
  const lines: BacklogLine[] = rows.flatMap((p) => [
    { date: p.date, series: open, cases: p.open, point: p, aged: false },
    { date: p.date, series: aged, cases: p.aged, point: p, aged: true },
  ])
  const last = rows.at(-1)
  // The chart says what stands out: the latest month end when it is the highest of the 24.
  const peak = rows.reduce<BacklogPoint | null>((b, p) => (!b || p.open > b.open ? p : b), null)
  const notes: ChartNote[] =
    peak && peak === last && peak.open > 0
      ? [{ at: peak.date, series: open, text: `${fmt(peak.open, 'int')} open, the most in 24 months` }]
      : []
  const columns: Column<BacklogPoint>[] = [
    { key: 'date', label: 'Month end', format: 'date' },
    { key: 'open', label: 'Open cases', format: 'int', drill: (r) => pointDrill(r, false) },
    { key: 'aged', label: aged, format: 'int', drill: (r) => pointDrill(r, true) },
  ]
  return (
    <Figure
      id="services-cases-open-trend"
      uses={m.uses['services-cases-open-trend']}
      metric={FIGURE_METRIC['services-cases-open-trend']}
      span={12}
      title="Open cases at each month end"
      subtitle={`Cases open at the end of each month, and how many of them had been open longer than ${count(days, 'day')}, last 24 months`}
      data={rows}
      columns={columns}
      definitions={[D.backlog, D.aged, D.employeeRelations]}
      note={last ? asOfNote(m.asOf, count(last.open, 'open case')) : undefined}
      empty={rows.some((p) => p.open > 0) ? null : 'No case was open at any month end in the last 24 months.'}
      emptyHeight={height}
    >
      <Lines
        data={lines}
        x="date"
        y="cases"
        series="series"
        seriesOrder={[open, aged]}
        format="int"
        area
        height={height}
        notes={notes}
        onSelect={(d) => drill(pointDrill(d.point, d.aged))}
        selectable={(d) => !!pointDrill(d.point, d.aged)}
        lockedNote={(d) => lockedReason(s, records(d.point, d.aged))}
      />
    </Figure>
  )
}

/* ───────────── on time by type and quarter ───────────── */

/** Transaction types named short enough for a phone's row labels. */
const SHORT_TYPE: Record<string, string> = {
  'Compensation change': 'Comp change',
  'Return from leave': 'Leave return',
  'Location change': 'Location',
  'Personal data change': 'Personal data',
}

export function TxOnTimeHeatmapFigure({ m, ctx }: { m: ServicesModel; ctx: AnalyticsContext }) {
  const s = m.scope
  const k = m.settings.minGroup
  const D = servicesDefinitions(ctx.metrics, m.settings)
  const target = m.settings.onTimeTarget
  const cells = m.txQuarters
  // A hidden share opens nothing (its records would say what it hides).
  const cellDrill = (c: TypeQuarterCell) =>
    c.rate == null ? null : drillWhen(s, c.records, () => typeQuarterDrill(s, c))
  const types = [...new Set(cells.map((c) => c.type))]
  // Phones get short type names, so no row label is cut off.
  const narrow = useNarrow()
  const name = (type: string) => (narrow ? (SHORT_TYPE[type] ?? type) : type)
  const named = cells.map((c) => ({ ...c, label: name(c.type) }))
  const judged = cells.reduce((a, c) => a + c.due, 0)
  const first = m.quarters[0]
  const columns: Column<TypeQuarterCell>[] = [
    { key: 'type', label: 'Transaction type' },
    { key: 'quarter', label: 'Due quarter' },
    { key: 'due', label: 'Due', format: 'int', drill: cellDrill },
    { key: 'onTime', label: 'On time', format: 'int', drill: cellDrill },
    { key: 'rate', label: 'On time %', format: 'pct', drill: cellDrill },
    { key: 'gap', label: 'Points from target', format: 'pts' },
  ]
  return (
    <Figure
      id="services-tx-on-time-heatmap"
      uses={m.uses['services-tx-on-time-heatmap']}
      metric={FIGURE_METRIC['services-tx-on-time-heatmap']}
      span={12}
      title="On time by transaction type and quarter"
      subtitle={`Points above or below the ${pctWords(target)} on-time target, by transaction type and the quarter the transactions were due`}
      data={cells}
      columns={columns}
      definitions={[D.onTime, D.txOnTime, D.anonymity]}
      note={asOfNote(
        m.asOf,
        count(judged, 'transaction'),
        first ? `due from ${formatDate(first.start)}` : null,
      )}
      empty={
        !cells.length
          ? 'No transactions were due in the last 8 quarters.'
          : cells.every((c) => c.rate == null)
            ? `Every type and quarter has fewer than ${k} transactions or ${k} people, so the shares are hidden to protect anonymity.`
            : null
      }
    >
      <Heatmap
        data={named}
        x="quarter"
        y="label"
        value="gap"
        n="due"
        format="pts"
        scheme="diverging"
        mid={0}
        xOrder={m.quarters.map((q) => q.key)}
        yOrder={types.map(name)}
        onSelect={(d) => drill(cellDrill(d))}
        selectable={(d) => !!cellDrill(d)}
        lockedNote={(d) => lockedReason(s, d.records)}
      />
    </Figure>
  )
}

/* ───────────── people on leave at each month end ───────────── */

export function OnLeaveTrendFigure({ m, ctx }: { m: ServicesModel; ctx: AnalyticsContext }) {
  const s = m.scope
  const k = m.leave.min
  const D = servicesDefinitions(ctx.metrics, m.settings)
  const height = useChartHeight('lead')
  // The line starts once the leave history covers a whole leave: earlier month ends would miss
  // leaves already under way when the history begins.
  const rows = m.leaveTrend.filter((p) => p.covered)
  const cut = m.leaveTrend.length - rows.length
  const { since } = m.leaveCoverage
  const pointDrill = (p: OnLeavePoint) =>
    p.people == null || !p.people || !s.on ? null : () => onLeavePointDrill(s, p)
  const last = rows.at(-1)
  const shown = rows.filter((p) => p.people != null)
  const peak = shown.reduce<OnLeavePoint | null>(
    (b, p) => (!b || (p.people ?? 0) > (b.people ?? 0) ? p : b),
    null,
  )
  const notes: ChartNote[] =
    peak && peak === last && (peak.people ?? 0) > 0
      ? [
          {
            at: peak.date,
            text: `${fmt(peak.people, 'int')} on leave, the most in ${count(rows.length, 'month')}`,
          },
        ]
      : []
  const columns: Column<OnLeavePoint>[] = [
    { key: 'date', label: 'Month end', format: 'date' },
    { key: 'people', label: 'People on leave', format: 'int', drill: pointDrill },
  ]
  return (
    <Figure
      id="services-leave-on-leave-trend"
      uses={m.uses['services-leave-on-leave-trend']}
      metric={FIGURE_METRIC['services-leave-on-leave-trend']}
      span={12}
      title="People on leave at each month end"
      subtitle={`People on a leave of absence at the end of each month, ${
        cut && rows[0] ? `since ${formatMonth(rows[0].date)}` : 'last 24 months'
      }`}
      data={rows}
      columns={columns}
      definitions={[D.onLeave, D.leavePairing, D.leaveGroups]}
      note={asOfNote(
        m.asOf,
        last?.people != null ? `${count(last.people, 'person', 'people')} on leave` : null,
        cut && since
          ? `leave history begins ${formatDate(since)}; earlier month ends would miss leaves already under way`
          : null,
      )}
      empty={
        !rows.some((p) => p.records.length)
          ? 'Nobody was on leave at any month end in the last 24 months.'
          : !shown.length
            ? `Every month end has fewer than ${k} people on leave in this scope, so the counts are hidden to protect anonymity.`
            : null
      }
      emptyHeight={height}
    >
      <Lines
        data={rows}
        x="date"
        y="people"
        format="int"
        area
        height={height}
        notes={notes}
        onSelect={(d) => drill(pointDrill(d))}
        selectable={(d) => !!pointDrill(d)}
        lockedNote={(d) =>
          d.people != null && !s.on
            ? `Fewer than ${k} people in this scope, so the records are not listed`
            : null
        }
      />
    </Figure>
  )
}

/* ───────────── cases per 100 employees ───────────── */

export function CasesPer100Figure({ m, ctx }: { m: ServicesModel; ctx: AnalyticsContext }) {
  const s = m.scope
  const k = m.settings.minGroup
  const D = servicesDefinitions(ctx.metrics, m.settings)
  const per = period(ctx)
  const { rows, company, unplaced } = m.per100
  const open = unitCasesDrill(s)
  // Opens only when the view's gate lets the unit's cases open (and something outside employee relations is left to list).
  const cell = (r: UnitRateRow) => (r.rate != null && drillWhen(s, r.records, () => true) ? open(r) : null)
  const columns: Column<UnitRateRow>[] = [
    { key: 'unit', label: 'Business unit' },
    { key: 'cases', label: 'Cases opened', format: 'int', drill: cell },
    { key: 'headcount', label: 'Average headcount', format: 'num1' },
    { key: 'rate', label: 'Cases per 100 employees', format: 'num1', drill: cell },
  ]
  const total = rows.reduce((a, r) => a + r.records.length, 0)
  return (
    <Figure
      id="services-cases-per-100"
      uses={m.uses['services-cases-per-100']}
      metric={FIGURE_METRIC['services-cases-per-100']}
      span={5}
      // Shorter than the reopened and escalated bars beside it: end the sheet at its content.
      className="self-start"
      title="Cases per 100 employees"
      subtitle={`Cases opened in the ${per} by each business unit’s people, per 100 employees a year`}
      data={rows}
      columns={columns}
      definitions={[D.rate, D.employeeRelations, D.anonymity]}
      note={asOfNote(
        m.asOf,
        count(total, 'case'),
        unplaced ? `${count(unplaced, 'case')} with no requester on the roster left out` : null,
      )}
      empty={
        !rows.length
          ? 'No case in the period names a requester on the roster.'
          : rows.every((r) => r.rate == null)
            ? `Every business unit has fewer than ${k} people behind its cases, so the rates are hidden to protect anonymity.`
            : null
      }
    >
      <BarList
        data={rows}
        label="unit"
        value="rate"
        format="num1"
        sort="none"
        ref={company != null ? { value: company, label: `Company ${fmt(company, 'num1')}` } : undefined}
        secondary={(d) => (d.cases == null ? null : count(d.cases, 'case'))}
        tone={(d) => (isOther(d.unit) ? 'deemph' : 'default')}
        onSelect={(d) => drill(cell(d))}
        selectable={(d) => !!cell(d)}
        lockedNote={(d) => lockedReason(s, d.records)}
      />
    </Figure>
  )
}
