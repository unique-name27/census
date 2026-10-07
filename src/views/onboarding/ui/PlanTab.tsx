/**
 * Hiring plan: are we hiring to plan? Plan, actual, committed and forecast starts by month;
 * coverage by business unit and department; the coming quarter's roles with nothing behind them;
 * planned roles with no open req; and open reqs that are not in the plan.
 */
import { useState } from 'react'
import { type Column, Figure, HBars, Lines } from '@/charts'
import { cx, Grid, KpiStrip, Readout, Section, Segmented, spanClass } from '@/components'
import { useAnalytics } from '@/data/context'
import type { Requisition } from '@/data/schema'
import { drill } from '@/drill'
import { formatDate, formatMonth } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import { employeesDrill, monthSub, planDrill, reqsDrill, startsDrill } from '../engine/drills'
import { forecastWithin } from '../engine/forecast'
import { ACCEPTED, ACTUAL, FORECAST, OPEN_REQS, PLAN, PLAN_REQ, UPCOMING, union } from '../engine/lineage'
import { COVERAGE_LABEL, type CoverageRow, cumulative, isUncovered, type PlanLineView } from '../engine/plan'
import { M } from '../metrics'
import { coverageRowDrills, quarterRoleDrill } from './drill'
import { PlanGrid } from './PlanGrid'
import { asOfNote, defs, drillIf, NeedData, NO_PLAN, PLAN_SEVERITY, useOnboarding } from './shared'

type Cut = 'unit' | 'department'

export function PlanTab() {
  const ctx = useAnalytics()
  const m = useOnboarding()
  const b = m.base
  const p = m.plan
  const fc = m.forecast
  const [cut, setCut] = useState<Cut>('unit')
  if (!p)
    return (
      <Grid>
        <KpiStrip kpis={m.kpis.plan} />
        <NeedData {...NO_PLAN} dataset="hiringPlan" />
      </Grid>
    )

  const version = p.version ?? 'the plan'
  const year = `${formatMonth(p.start)} to ${formatMonth(p.end)}`
  const planUses = union(PLAN, PLAN_REQ)

  /* Plan vs actual, cumulative. */
  const cum = cumulative(p, b.asOf)
  const byMonth = new Map(p.months.map((x) => [x.month, x]))
  const monthRows = p.months.map((x) => ({
    month: x.month,
    monthName: formatMonth(`${x.month}-01`),
    plan: x.plan,
    actual: x.month <= b.asOf.slice(0, 7) ? x.actual : null,
    committed: x.committed,
    forecast: Math.round(x.forecast * 10) / 10,
  }))
  type MonthRow = (typeof monthRows)[number]
  const monthColumns: Column<MonthRow>[] = [
    { key: 'monthName', label: 'Month' },
    {
      key: 'plan',
      label: 'Planned starts',
      format: 'int',
      drill: (r) =>
        drillIf(r.plan, () =>
          planDrill(
            b,
            p.views.filter((v) => v.month === r.month),
            `Planned starts, ${r.monthName}`,
            { uses: planUses },
          ),
        ),
    },
    {
      key: 'actual',
      label: 'Actual starts',
      format: 'int',
      drill: (r) =>
        drillIf(r.actual, () =>
          employeesDrill(b, byMonth.get(r.month)!.actualPeople, `Starts in ${r.monthName}`, {
            subtitle: monthSub(b, r.month),
            uses: ACTUAL,
          }),
        ),
    },
    {
      key: 'committed',
      label: 'Committed starts',
      format: 'int',
      drill: (r) =>
        drillIf(r.committed, () =>
          startsDrill(b, byMonth.get(r.month)!.committedStarts, `Committed starts, ${r.monthName}`, {
            uses: UPCOMING,
          }),
        ),
    },
    {
      key: 'forecast',
      label: 'Forecast starts',
      format: 'num1',
      drill: (r) => {
        const reqs = (fc?.reqs ?? []).filter((f) =>
          f.parts.some((x) => x.start.slice(0, 7) === r.month && x.start > b.asOf),
        )
        return drillIf(reqs.length, () =>
          reqsDrill(
            b,
            reqs.map((f) => f.req),
            `Open reqs forecast to start in ${r.monthName}`,
            { uses: FORECAST },
          ),
        )
      },
    },
  ]

  /* Coverage. */
  const covRows = (cut === 'unit' ? p.byUnit : p.byDepartment).map((r) => ({
    ...r,
    department: r.department ?? 'All departments',
    statusText: r.status ?? (r.planYtd ? null : 'No plan to date'),
    gapRounded: Math.round(r.gap),
    forecastRounded: Math.round(r.forecast * 10) / 10,
    r,
  }))
  type CovRow = (typeof covRows)[number]
  const where = (r: CoverageRow) => (r.department ? `${r.businessUnit}, ${r.department}` : r.businessUnit)
  const covUses = { plan: planUses, actual: ACTUAL, gap: union(planUses, ACCEPTED) }
  // Every number of a row carries the row's business unit or department as the drill's filter.
  const covDrills = new Map(covRows.map((x) => [x.r, coverageRowDrills(b, p, x.r, where(x.r), covUses)]))
  const covDrill = (x: CovRow) => covDrills.get(x.r)!
  const covColumns: Column<CovRow>[] = [
    { key: 'businessUnit', label: 'Business unit' },
    ...(cut === 'department' ? [{ key: 'department', label: 'Department' } as Column<CovRow>] : []),
    {
      key: 'planYtd',
      label: 'Plan to date',
      format: 'int',
      drill: (x) => covDrill(x).planYtd,
    },
    {
      key: 'actualYtd',
      label: 'Actual to date',
      format: 'int',
      // Plan year to date, not the view's period.
      drill: (x) => covDrill(x).actualYtd,
    },
    { key: 'vsPlan', label: 'Vs plan', format: 'pct' },
    { key: 'statusText', label: 'Plan status' },
    {
      key: 'planFull',
      label: 'Full-year plan',
      format: 'int',
      drill: (x) => covDrill(x).planFull,
    },
    { key: 'committed', label: 'Committed', format: 'int', drill: (x) => covDrill(x).committed },
    { key: 'openReqs', label: 'Open reqs', format: 'int', drill: (x) => covDrill(x).openReqs },
    { key: 'forecastRounded', label: 'Forecast', format: 'num1', drill: (x) => covDrill(x).forecast },
    {
      key: 'gapRounded',
      label: 'Gap',
      format: 'int',
      // The future lines with nothing behind them yet, with the sum in the note.
      drill: (x) => covDrill(x).gap,
    },
  ]

  /* The coming quarter. */
  const q = p.quarter
  const qRows = q.units.flatMap((u) =>
    (
      [
        ['accepted', u.accepted],
        ['open', u.open],
        ['on-hold', u.onHold],
        ['cancelled', u.cancelled],
        ['no-req', u.noReq],
      ] as const
    )
      .filter(([, n]) => n > 0)
      .map(([coverage, n]) => ({
        businessUnit: u.businessUnit,
        coverage: COVERAGE_LABEL[coverage],
        starts: n,
        lines: u.lines.filter((v) => v.coverage === coverage),
      })),
  )
  type QRow = (typeof qRows)[number]
  // A segment is one business unit's roles, with the unit as the drill's filter.
  const qDrill = quarterRoleDrill(b, q.label, union(planUses, ACCEPTED))
  const qColumns: Column<QRow>[] = [
    { key: 'businessUnit', label: 'Business unit' },
    { key: 'coverage', label: 'Behind the role' },
    { key: 'starts', label: 'Planned starts', format: 'int', drill: qDrill },
  ]
  const qOrder = ['Accepted offer', 'Open req', 'Req on hold', 'Req cancelled', 'No req']

  /* Lists. */
  const lineRows = (views: readonly PlanLineView[]) =>
    views.map((v) => ({
      month: formatMonth(v.line.period),
      businessUnit: v.line.businessUnit,
      department: v.line.department,
      location: v.line.location ?? null,
      jobTitle: v.line.jobTitle ?? null,
      level: v.line.level ?? null,
      plannedHires: v.line.plannedHires,
      reqId: v.line.reqId ?? null,
      coverage: COVERAGE_LABEL[v.coverage],
      positionId: v.line.positionId ?? null,
      v,
    }))
  const noReqRows = lineRows(p.noReq)
  type LineRow = (typeof noReqRows)[number]
  const lineColumns: Column<LineRow>[] = [
    { key: 'month', label: 'Start month' },
    { key: 'businessUnit', label: 'Business unit' },
    { key: 'department', label: 'Department' },
    { key: 'location', label: 'Location' },
    { key: 'jobTitle', label: 'Role' },
    { key: 'level', label: 'Level' },
    {
      key: 'plannedHires',
      label: 'Planned starts',
      format: 'int',
      drill: (r) => () => planDrill(b, [r.v], `Plan line, ${r.department}`, { uses: planUses }),
    },
    { key: 'coverage', label: 'Behind it' },
    { key: 'reqId', label: 'Req ID' },
    { key: 'positionId', label: 'Position ID' },
  ]
  const reqRows = (reqs: readonly Requisition[], kind: string) =>
    reqs.map((r) => ({
      reqId: r.reqId,
      jobTitle: r.jobTitle,
      businessUnit: r.businessUnit,
      department: r.department,
      location: r.location,
      kind,
      openedDate: r.openedDate,
      hiringManager: r.hiringManager ?? null,
      r,
    }))
  const outside = [...reqRows(p.notInPlan.added, 'New role'), ...reqRows(p.notInPlan.backfills, 'Backfill')]
  type ReqRow = (typeof outside)[number]
  const outUses = union(OPEN_REQS, ['hiringPlan.reqId', 'hiringPlan.planVersion', 'requisitions.reqType'])
  const outColumns: Column<ReqRow>[] = [
    {
      key: 'reqId',
      label: 'Req ID',
      drill: (r) => () => reqsDrill(b, [r.r], `Requisition ${r.reqId}`, { uses: outUses }),
    },
    { key: 'kind', label: 'Type' },
    { key: 'jobTitle', label: 'Role' },
    { key: 'businessUnit', label: 'Business unit' },
    { key: 'department', label: 'Department' },
    { key: 'location', label: 'Location' },
    { key: 'hiringManager', label: 'Hiring manager' },
    { key: 'openedDate', label: 'Opened', format: 'date' },
  ]

  const from = b.asOf
  const fcTotal = (fc?.reqs ?? []).reduce((n, r) => n + forecastWithin(r, from, p.end), 0)
  const findings = m.findings.filter((x) => x.tab === 'plan')
  return (
    <>
      <Grid>
        <KpiStrip kpis={m.kpis.plan} />
        <Readout
          findings={findings}
          span={4}
          title="Hiring plan readout"
          emptyText="Hiring is on plan for this scope."
          className="md:col-span-12 lg:sticky lg:top-4"
        />
        <div className={cx(spanClass(8), 'min-w-0')}>
          <Grid>
            <Figure
              id="onboarding-plan-vs-actual"
              uses={union(PLAN, ACTUAL, UPCOMING, FORECAST)}
              metric={M.vsPlan}
              title="Plan, actual and forecast starts"
              subtitle={`Cumulative starts by month, ${version}, ${year}`}
              data={monthRows}
              columns={monthColumns}
              definitions={defs(ctx.metrics, [M.vsPlan, M.committed, M.forecast])}
              note={asOfNote(
                b.asOf,
                `${fmt(p.planFull, 'int')} planned`,
                `${fmt(p.actual.length, 'int')} started`,
                `${fmt(p.committed.length, 'int')} committed`,
                fc ? `${fmt(fcTotal, 'num1')} forecast` : null,
                p.versions.length > 1 ? `latest of ${plural(p.versions.length, 'version')}` : null,
              )}
              span={12}
            >
              <Lines
                data={cum}
                x="month"
                y="starts"
                series="series"
                seriesOrder={['Plan', 'Actual', 'Committed', 'Forecast']}
                format="int"
                zero
                height={260}
                xTicks="quarter"
                onSelect={(d) => {
                  const r = monthRows.find((x) => x.month === d.month)
                  if (!r) return
                  const col =
                    d.series === 'Plan'
                      ? monthColumns[1]
                      : d.series === 'Actual'
                        ? monthColumns[2]
                        : d.series === 'Committed'
                          ? monthColumns[3]
                          : monthColumns[4]
                  drill(col.drill?.(r) ?? null)
                }}
              />
            </Figure>
          </Grid>
        </div>
      </Grid>

      <Section
        title="Month by month"
        dek="Where, and in which months, starts fell behind or ran ahead of the plan."
      >
        <PlanGrid p={p} />
      </Section>

      <Section
        title="Coverage"
        dek={`Each business unit and department against its plan: starts to date, what is already committed, the open reqs and the forecast, and what is left to find. On plan means within ${fmt(b.settings.onPlanBand, 'pct0')} of the plan to date.`}
        actions={
          <Segmented<Cut>
            value={cut}
            onChange={setCut}
            options={[
              { value: 'unit', label: 'By business unit' },
              { value: 'department', label: 'By department' },
            ]}
            label="Coverage by"
          />
        }
      >
        <Figure
          id="onboarding-plan-coverage"
          uses={union(PLAN, ACTUAL, UPCOMING, FORECAST)}
          metric={M.gap}
          title="Plan coverage"
          subtitle={`${version}, ${year}, to ${formatDate(p.toDate)}`}
          data={covRows}
          columns={covColumns}
          definitions={defs(ctx.metrics, [M.vsPlan, M.gap, M.forecast])}
          note={asOfNote(
            b.asOf,
            cut === 'unit' ? plural(covRows.length, 'business unit') : plural(covRows.length, 'department'),
          )}
          tableOnly
          table={{
            rowTone: (x) => (x.r.status ? PLAN_SEVERITY[x.r.status] : null),
            search: cut === 'department' ? 'Search departments' : undefined,
          }}
          span={12}
        />
        <Figure
          id="onboarding-quarter-coverage"
          uses={union(planUses, ACCEPTED)}
          metric={M.quarter}
          title={`${q.label} roles by what stands behind them`}
          subtitle="Planned starts in the coming quarter: an accepted offer, an open req, or nothing yet"
          data={qRows}
          columns={qColumns}
          note={asOfNote(
            b.asOf,
            `${fmt(
              q.units.reduce((n, u) => n + u.uncovered, 0),
              'int',
            )} of ${fmt(
              q.units.reduce((n, u) => n + u.planned, 0),
              'int',
            )} not covered`,
          )}
          span={12}
          empty={qRows.length ? null : `The plan has no lines in ${q.label}.`}
        >
          <HBars
            data={qRows}
            y="businessUnit"
            x="starts"
            series="coverage"
            seriesOrder={qOrder}
            stack
            format="int"
            onSelect={(d) => drill(qDrill(d))}
          />
        </Figure>
      </Section>

      <Section
        title="Roles and reqs out of step"
        dek="Planned roles that have nothing behind them yet, and open reqs that the plan does not name."
      >
        <Figure
          id="onboarding-no-req"
          uses={union(planUses, ACCEPTED)}
          metric={M.noReq}
          title="Planned roles with no open req"
          subtitle={`Future plan lines with no req, or a req on hold or cancelled, ${version}`}
          data={noReqRows}
          columns={lineColumns}
          note={asOfNote(
            b.asOf,
            `${plural(noReqRows.length, 'line')}, ${plural(
              p.noReq.reduce((n, v) => n + v.line.plannedHires, 0),
              'planned start',
            )}`,
          )}
          tableOnly
          table={{ rowTone: (r) => (isUncovered(r.v.coverage) ? 'warning' : null), maxRows: 20 }}
          span={12}
          empty={noReqRows.length ? null : 'Every future plan line has an accepted offer or an open req.'}
        />
        <Figure
          id="onboarding-not-in-plan"
          uses={outUses}
          metric={M.notInPlan}
          title="Open reqs not in the plan"
          subtitle={`Open reqs whose ID is on no line of ${version}; backfills listed after new roles`}
          data={outside}
          columns={outColumns}
          note={asOfNote(
            b.asOf,
            `${fmt(p.notInPlan.added.length, 'int')} new roles`,
            `${fmt(p.notInPlan.backfills.length, 'int')} backfills`,
          )}
          tableOnly
          table={{
            onRowClick: (r) => drill(reqsDrill(b, [r.r], `Requisition ${r.reqId}`, { uses: outUses })),
          }}
          span={12}
          empty={outside.length ? null : 'Every open req is on a plan line.'}
        />
      </Section>
    </>
  )
}
