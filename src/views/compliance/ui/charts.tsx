/**
 * The Compliance charts added with the design refresh (docs/CHARTS.md, Compliance): the
 * reverification runway that leads Right to work, business days from start to I-9 Section 2,
 * licensed roles by site and status that leads Export control, and the statutory calendar by
 * jurisdiction and month that leads Deadlines. Rows come from engine/charts.ts.
 */
import { useState } from 'react'
import { type Column, Columns, DotStrip, Figure, HBars, Heatmap, type Tone, useChartTheme } from '@/charts'
import { Button } from '@/components'
import type { AnalyticsContext } from '@/data/context'
import { Drill, drill } from '@/drill'
import { formatMonth } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import type { ComplianceView } from '../engine'
import {
  type CalendarCell,
  calendarByMonth,
  type I9DayBin,
  i9DayBins,
  LICENSE_SERIES,
  licensesBySite,
  type RunwayDot,
  runway,
  type SiteStatusRow,
} from '../engine/charts'
import { expiryDrill, i9Drill } from '../engine/drills'
import { USES } from '../engine/lineage'
import { asOfNote, businessDaysText, daysText, people, periodWords } from '../engine/wording'
import type { ReverificationStatus } from '../engine/work'
import { STATUS_ORDER } from '../engine/work'
import { M } from '../metrics'
import { deadlineDrill, licenseSiteCells } from './drill'
import { COUNSEL_NOTE, defs } from './shared'

const RUNWAY_TONE: Record<ReverificationStatus, Tone> = {
  Expired: 'critical',
  'Not started': 'critical',
  'Started late': 'warning',
  'On time': 'good',
  'Not due yet': 'deemph',
}

/* ───────────── reverification runway ───────────── */

export function RunwayFigure({ m, ctx }: { m: ComplianceView; ctx: AnalyticsContext }) {
  const s = m.scope
  const cfg = m.settings
  const { dots, groups } = runway(m.work)
  const one = (d: RunwayDot) => () =>
    expiryDrill(s, [d.x], { title: `Work authorization of ${d.name}`, uses: USES.reverification })
  const low = Math.min(-10, ...dots.map((d) => d.daysToExpiry))
  const columns: Column<RunwayDot>[] = [
    { key: 'name', label: 'Name' },
    { key: 'employeeId', label: 'Employee ID' },
    { key: 'businessUnit', label: 'Business unit' },
    { key: 'location', label: 'Location' },
    { key: 'status', label: 'Reverification' },
    { key: 'expiryDate', label: 'Expiry', format: 'date' },
    { key: 'daysToExpiry', label: 'Days to expiry', format: 'days', drill: one },
    { key: 'dueBy', label: 'Start reverification by', format: 'date' },
    { key: 'startedDate', label: 'Reverification started', format: 'date' },
  ]
  const counts = groups.map((g) => `${fmt(g.people, 'int')} ${g.status.toLowerCase()}`)
  return (
    <Figure
      id="compliance-reverification-runway"
      uses={USES.reverification}
      metric={M.reverificationOverdue}
      span={12}
      title="Reverification runway"
      subtitle={`Days from the as-of date to each expiry, ended ones below zero, by where reverification stands. Reverification should start ${daysText(cfg.leadDays)} before the expiry.`}
      data={dots}
      columns={columns}
      definitions={defs(ctx.metrics, [M.reverificationOverdue, M.reverificationOnTime, M.expiring])}
      note={asOfNote(m.base.asOf, people(dots.length), ...counts)}
      empty={
        !m.base.has.expiry
          ? 'Upload Right to work with an authorization expiry column to see this.'
          : dots.length
            ? null
            : `No work authorization ends in the next ${daysText(cfg.horizonDays)}, and none has ended.`
      }
      emptyHeight={160}
    >
      <DotStrip
        data={dots}
        x="daysToExpiry"
        y="status"
        id="employeeId"
        label="name"
        xFormat="days"
        yOrder={STATUS_ORDER}
        xDomain={[low, cfg.horizonDays]}
        ref={{ value: cfg.leadDays, label: `Start by, ${daysText(cfg.leadDays)} out` }}
        tone={(d) => RUNWAY_TONE[d.status]}
        onSelect={(d) => drill(one(d))}
      />
    </Figure>
  )
}

/* ───────────── business days to I-9 Section 2 ───────────── */

export function I9DaysFigure({ m, ctx }: { m: ComplianceView; ctx: AnalyticsContext }) {
  const s = m.scope
  const cfg = m.settings
  const allowed = cfg.i9Days
  const { bins, done, missing, shown } = i9DayBins(m.i9.current.judged, allowed, cfg.minGroup)
  const binDrill = (b: I9DayBin) =>
    b.starts
      ? () =>
          i9Drill(s, b.rows, {
            title: `US starts with I-9 Section 2 done ${b.bin} business ${b.bin === '1' ? 'day' : 'days'} after the start`,
            uses: USES.i9,
          })
      : null
  const columns: Column<I9DayBin>[] = [
    { key: 'bin', label: 'Business days to Section 2' },
    { key: 'starts', label: 'US starts', format: 'int', drill: binDrill },
  ]
  return (
    <Figure
      id="compliance-i9-business-days"
      uses={USES.i9}
      metric={M.i9Section2}
      span={4}
      title="Business days to I-9 Section 2"
      subtitle={`US employee starts in the ${periodWords(ctx)} with Section 2 done, by business days from the start. Past ${businessDaysText(allowed)} is late.`}
      data={bins}
      columns={columns}
      definitions={defs(ctx.metrics, [M.i9Section2])}
      note={asOfNote(
        m.base.asOf,
        `${fmt(done, 'int')} US ${done === 1 ? 'start' : 'starts'} with Section 2 done`,
        missing ? `${fmt(missing, 'int')} past due without Section 2` : null,
      )}
      empty={
        !m.base.has.i9Section2
          ? 'Upload Right to work with an I-9 Section 2 date column to see this.'
          : !done
            ? 'No US employee start in the period has Section 2 done.'
            : shown
              ? null
              : `Fewer than ${cfg.minGroup} US starts have Section 2 done, so the days are hidden to protect anonymity.`
      }
    >
      <Columns
        data={bins}
        x="bin"
        y="starts"
        xOrder={bins.map((b) => b.bin)}
        format="int"
        tone={(d) => (d.late ? 'critical' : 'default')}
        onSelect={(d) => drill(binDrill(d))}
        selectable={(d) => !!binDrill(d)}
      />
    </Figure>
  )
}

/* ───────────── licensed roles by site and status ───────────── */

export function LicensesBySiteFigure({ m, ctx }: { m: ComplianceView; ctx: AnalyticsContext }) {
  const s = m.scope
  const t = useChartTheme()
  const ex = m.exportControl
  const rows = licensesBySite(ex.required)
  // A bar is everyone at the site, a segment its people with one status; both filter to the site.
  const cells = licenseSiteCells(s, USES.exportLicense)
  const siteDrill = cells.site
  const segmentDrill = cells.segment
  const colors: Record<string, string> = {
    Approved: t.status.good,
    Pending: t.status.warning,
    Expired: t.status.serious,
    Denied: t.status.critical,
  }
  const present = LICENSE_SERIES.filter((x) => rows.some((r) => r.status === x))
  const columns: Column<SiteStatusRow>[] = [
    { key: 'location', label: 'Site' },
    { key: 'status', label: 'License status' },
    { key: 'people', label: 'People', format: 'int', drill: segmentDrill },
  ]
  const sites = [...new Set(rows.map((r) => r.location))]
  return (
    <Figure
      id="compliance-licenses-by-site"
      uses={[...USES.exportLicense, 'employees.location']}
      metric={M.licenseStatus}
      span={8}
      title="People in licensed roles by site and status"
      subtitle="People active or starting soon whose role needs an export license, by site and license status at the as-of date"
      data={rows}
      columns={columns}
      definitions={defs(ctx.metrics, [M.licenseStatus, M.withoutLicense])}
      note={asOfNote(m.base.asOf, people(ex.required.length), `${fmt(sites.length, 'int')} sites`)}
      empty={
        !m.base.has.exportLicense
          ? 'Upload Right to work with export license columns to see this.'
          : rows.length
            ? null
            : 'No role in this scope needs an export license.'
      }
    >
      <HBars
        data={rows}
        y="location"
        x="people"
        series="status"
        stack
        seriesOrder={present}
        colors={(name) => colors[name] ?? t.deemph}
        yOrder={sites}
        format="int"
        onSelect={(d) => drill(siteDrill(d))}
        onSelectSegment={(d) => drill(segmentDrill(d))}
      />
    </Figure>
  )
}

/* ───────────── statutory calendar by jurisdiction and month ───────────── */

export function CalendarHeatmapFigure({ m, ctx }: { m: ComplianceView; ctx: AnalyticsContext }) {
  const s = m.scope
  const { months, cells } = calendarByMonth(m.deadlines, m.base.asOf)
  const [picked, setPicked] = useState<string | null>(null)
  const cell = cells.find((c) => `${c.jurisdictionId}|${c.month}` === picked) ?? null
  const people = deadlineDrill(s, USES.deadlines)
  const total = cells.reduce((a, c) => a + c.entries, 0)
  const rows = cells.map((c) => ({
    jurisdiction: c.jurisdiction,
    month: c.month,
    entries: c.entries,
    obligations: c.items.map((x) => `${x.when}: ${x.entry.title}`).join('; '),
    cell: c,
  }))
  type Row = (typeof rows)[number]
  const columns: Column<Row>[] = [
    { key: 'jurisdiction', label: 'Jurisdiction' },
    { key: 'month', label: 'Month' },
    { key: 'entries', label: 'Calendar entries', format: 'int' },
    { key: 'obligations', label: 'Obligations', width: 60 },
  ]
  const first = months[0]
  const last = months.at(-1)
  return (
    <Figure
      id="compliance-deadlines-by-month"
      uses={USES.deadlines}
      metric={M.calendar}
      span={12}
      title="Statutory calendar by jurisdiction and month"
      subtitle={`Filings, payments, notices and planning dates in each of the next 12 months, for the jurisdictions where people in scope work`}
      data={rows}
      columns={columns}
      definitions={defs(ctx.metrics, [M.calendar])}
      note={asOfNote(
        m.base.asOf,
        `${plural(total, 'entry', 'entries')}${first && last ? ` from ${formatMonth(`${first}-01`)} to ${formatMonth(`${last}-01`)}` : ''}`,
        COUNSEL_NOTE,
      )}
      empty={cells.length ? null : 'Nobody in this scope is active at a site with a statutory calendar.'}
    >
      <Heatmap
        data={cells}
        x="monthLabel"
        y="jurisdiction"
        value="entries"
        format="int"
        scheme="sequential"
        xOrder={[...new Set(cells.map((c) => c.monthLabel))]}
        yOrder={[...new Set(cells.map((c) => c.jurisdiction))]}
        onSelect={(c: CalendarCell) => setPicked(`${c.jurisdictionId}|${c.month}`)}
        selectable={(c) => c.entries > 0}
        lockedNote={(c) => (c.entries ? null : 'No entry this month')}
      />
      {cell && (
        <div className="mt-4 border-t border-rule pt-3" aria-live="polite">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h4 className="cut-head text-title font-semibold text-ink">
              {cell.jurisdiction}, {formatMonth(`${cell.month}-01`)}
            </h4>
            <span className="text-small text-ink-2">{plural(cell.entries, 'entry', 'entries')}</span>
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setPicked(null)}>
              Clear
            </Button>
          </div>
          <ul className="mt-1">
            {cell.items.map((x) => (
              <li
                key={x.key}
                className="grid grid-cols-1 gap-x-4 border-t border-rule py-2 first:border-t-0 md:grid-cols-[9rem_1fr_auto]"
              >
                <span className="text-small text-ink-2">{x.when}</span>
                <span className="min-w-0 text-small text-ink">
                  {x.entry.title}
                  <span className="text-ink-2">. {x.recurrence}.</span>
                </span>
                <Drill spec={people(x)} label={`Show the ${plural(x.people.length, 'employee')} covered`}>
                  {plural(x.people.length, 'employee')} covered
                </Drill>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Figure>
  )
}
