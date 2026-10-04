/**
 * Upcoming starts: who starts in the next 90 days, whether each person will be ready on day one,
 * which team is behind, and how notice periods and reneges shape the start dates.
 */
import { BarList, type Column, Columns, Figure } from '@/charts'
import { cx, Grid, KpiStrip, Readout, Section, spanClass } from '@/components'
import { useAnalytics } from '@/data/context'
import { drill, openPerson } from '@/drill'
import { formatDate } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import { candidatesDrill, startsDrill, tasksDrill } from '../engine/drills'
import { ACCEPT_TO_START, RENEGE, TASK_OWNER, TASKS, UPCOMING, union } from '../engine/lineage'
import type { Start } from '../engine/starts'
import type { DaysRow, OwnerReadinessRow, RenegeRow, TaskReadinessRow, UpcomingRow } from '../engine/upcoming'
import { M } from '../metrics'
import {
  asOfNote,
  defs,
  drillIf,
  hiddenNote,
  NeedData,
  NO_STARTS,
  NO_TASKS,
  READY_SEVERITY,
  useOnboarding,
} from './shared'

const weekLabel = (iso: string) => formatDate(iso).replace(/ \d{4}$/, '')

export function UpcomingTab() {
  const ctx = useAnalytics()
  const m = useOnboarding()
  const b = m.base
  const u = m.upcoming
  const s = b.settings
  const starts = b.upcoming.starts
  const taskUses = union(UPCOMING, TASKS)

  /* Start calendar. */
  const units = [...new Set(u.calendar.map((r) => r.businessUnit))].sort(
    (a, c) =>
      u.calendar.filter((r) => r.businessUnit === c).reduce((n, r) => n + r.starts, 0) -
        u.calendar.filter((r) => r.businessUnit === a).reduce((n, r) => n + r.starts, 0) ||
      a.localeCompare(c),
  )
  const calRows = u.calendar.map((r) => ({
    week: r.week,
    weekOf: weekLabel(r.week),
    businessUnit: r.businessUnit,
    starts: r.starts,
    people: r.people,
  }))
  type CalRow = (typeof calRows)[number]
  const filler = units[0] ?? 'Unknown'
  const chartRows: CalRow[] = [
    ...calRows,
    ...u.weeks
      .filter((w) => !calRows.some((r) => r.week === w))
      .map((w) => ({
        week: w,
        weekOf: weekLabel(w),
        businessUnit: filler,
        starts: 0,
        people: [] as Start[],
      })),
  ]
  const weekDrill = (week: string) => () =>
    startsDrill(
      b,
      u.calendar.filter((r) => r.week === week).flatMap((r) => r.people),
      `Starts in the week of ${formatDate(week)}`,
      { uses: UPCOMING },
    )
  const cellDrill = (r: CalRow) => () =>
    startsDrill(b, r.people, `Starts in the week of ${formatDate(r.week)}, ${r.businessUnit}`, {
      uses: UPCOMING,
    })
  const calColumns: Column<CalRow>[] = [
    { key: 'week', label: 'Week of', format: 'date' },
    { key: 'businessUnit', label: 'Business unit' },
    { key: 'starts', label: 'Starts', format: 'int', drill: (r) => drillIf(r.starts, cellDrill(r)) },
  ]

  /* Upcoming starts table. */
  const rows = u.rows.map((r: UpcomingRow) => ({
    name: r.start.name,
    role: r.start.role,
    department: r.start.department,
    hiringManager: r.start.hiringManager,
    recruiter: r.start.recruiter,
    location: r.start.location,
    startDate: r.start.startDate,
    daysToGo: r.readiness.daysToGo,
    readiness: r.readiness.total ? `${r.readiness.done} of ${r.readiness.total} done` : null,
    status: r.readiness.status === 'No tasks' ? null : r.readiness.status,
    blocking: r.readiness.blocking
      ? `${r.readiness.blocking.name}${r.readiness.blocking.due ? `, due ${formatDate(r.readiness.blocking.due)}` : ''}`
      : null,
    r,
  }))
  type StartRow = (typeof rows)[number]
  const personDrill = (x: StartRow) => () => startsDrill(b, [x.r.start], x.name, { uses: UPCOMING })
  const startColumns: Column<StartRow>[] = [
    { key: 'name', label: 'Person', drill: personDrill },
    { key: 'role', label: 'Role' },
    { key: 'department', label: 'Department' },
    { key: 'hiringManager', label: 'Hiring manager' },
    { key: 'recruiter', label: 'Recruiter' },
    { key: 'location', label: 'Location' },
    { key: 'startDate', label: 'Start date', format: 'date' },
    { key: 'daysToGo', label: 'Days to go', format: 'days' },
    {
      key: 'readiness',
      label: 'Day-one tasks',
      drill: (x) =>
        drillIf(x.r.start.tasks.length, () =>
          tasksDrill(b, x.r.start.tasks, `Onboarding tasks, ${x.name}`, { uses: taskUses }),
        ),
    },
    { key: 'status', label: 'Readiness' },
    {
      key: 'blocking',
      label: 'Blocking item',
      drill: (x) =>
        x.r.readiness.blocking
          ? () =>
              tasksDrill(b, [x.r.readiness.blocking!], `${x.r.readiness.blocking!.name}, ${x.name}`, {
                uses: taskUses,
              })
          : null,
    },
  ]

  /* Readiness by task and owner. */
  const byTaskColumns: Column<TaskReadinessRow>[] = [
    { key: 'task', label: 'Task' },
    { key: 'owner', label: 'Owner' },
    { key: 'starts', label: 'Starts', format: 'int' },
    { key: 'done', label: 'Done or not needed', format: 'int' },
    {
      key: 'open',
      label: 'Open',
      format: 'int',
      drill: (r) =>
        drillIf(r.open, () =>
          tasksDrill(
            b,
            r.items.flatMap((x) => x.tasks),
            `${r.task}, open`,
            { uses: taskUses },
          ),
        ),
    },
    {
      key: 'pastDue',
      label: 'Past due',
      format: 'int',
      drill: (r) =>
        drillIf(r.pastDue, () =>
          tasksDrill(
            b,
            r.items.flatMap((x) => x.tasks).filter((t) => t.pastDue),
            `${r.task}, past due`,
            { uses: taskUses },
          ),
        ),
    },
    { key: 'share', label: 'Done so far', format: 'pct' },
  ]
  const ownerUses = union(UPCOMING, TASKS, TASK_OWNER)
  const byOwnerColumns: Column<OwnerReadinessRow>[] = [
    { key: 'owner', label: 'Owner' },
    { key: 'tasks', label: 'Tasks', format: 'int' },
    { key: 'done', label: 'Done or not needed', format: 'int' },
    {
      key: 'open',
      label: 'Open',
      format: 'int',
      drill: (r) =>
        drillIf(r.open, () =>
          tasksDrill(
            b,
            r.items.flatMap((x) => x.tasks),
            `Open tasks, ${r.owner}`,
            { uses: ownerUses },
          ),
        ),
    },
    {
      key: 'pastDue',
      label: 'Past due',
      format: 'int',
      drill: (r) =>
        drillIf(r.pastDue, () =>
          tasksDrill(
            b,
            r.items.flatMap((x) => x.tasks).filter((t) => t.pastDue),
            `Past due tasks, ${r.owner}`,
            { uses: ownerUses },
          ),
        ),
    },
    { key: 'share', label: 'Done so far', format: 'pct' },
  ]
  const openTasksDrill = (items: TaskReadinessRow['items'], title: string) => () =>
    tasksDrill(
      b,
      items.flatMap((x) => x.tasks),
      title,
      { uses: ownerUses },
    )

  /* Notice periods and reneges. */
  const ats = u.acceptToStart
  const atsColumns: Column<DaysRow>[] = [
    { key: 'location', label: 'Location' },
    {
      key: 'offers',
      label: 'Offers accepted',
      format: 'int',
      drill: (r) =>
        drillIf(r.offers, () =>
          candidatesDrill(b, r.records, `Offers accepted, ${r.location}`, { uses: ACCEPT_TO_START }),
        ),
    },
    { key: 'days', label: 'Median days to start', format: 'days' },
  ]
  const r = u.renege
  const target = s.targets.renege
  // Under the anonymity minimum a location shows its size only, never how many reneged.
  const renegeData = r.byLocation
    .filter((x) => x.accepted.length > 0)
    .map((x: RenegeRow) => ({
      ...x,
      acceptedN: x.accepted.length,
      renegedN: x.rate == null ? null : x.reneged.length,
    }))
  type RenegeData = (typeof renegeData)[number]
  const renegeColumns: Column<RenegeData>[] = [
    { key: 'location', label: 'Location' },
    {
      key: 'acceptedN',
      label: 'Offers accepted',
      format: 'int',
      drill: (x) =>
        drillIf(x.accepted.length, () =>
          candidatesDrill(b, x.accepted, `Offers accepted, ${x.location}`, { uses: RENEGE }),
        ),
    },
    {
      key: 'renegedN',
      label: 'Reneges',
      format: 'int',
      drill: (x) =>
        drillIf(x.renegedN, () => candidatesDrill(b, x.reneged, `Reneges, ${x.location}`, { uses: RENEGE })),
    },
    { key: 'rate', label: 'Renege rate', format: 'pct' },
  ]

  if (!starts.length && !b.hasCandidates && !ctx.all.employees.length)
    return (
      <Grid>
        <NeedData {...NO_STARTS} dataset="candidates" />
      </Grid>
    )

  const findings = m.findings
  return (
    <>
      <Grid>
        <KpiStrip kpis={m.kpis.upcoming} />
        <Readout findings={findings} span={4} className="md:col-span-12 lg:sticky lg:top-4" />
        <div className={cx(spanClass(8), 'min-w-0')}>
          <Grid>
            <Figure
              id="onboarding-start-calendar"
              uses={union(UPCOMING, ['employees.businessUnit', 'requisitions.businessUnit'])}
              metric={M.calendar}
              title="Start calendar"
              subtitle={`Upcoming starts by week and business unit, the next ${s.calendarWeeks} weeks from ${formatDate(u.weeks[0] ?? b.asOf)}`}
              data={calRows}
              columns={calColumns}
              definitions={defs(ctx.metrics, [M.calendar, M.starts])}
              note={asOfNote(
                b.asOf,
                plural(starts.length, 'upcoming start'),
                u.beyondCalendar ? `${fmt(u.beyondCalendar, 'int')} later, not shown` : null,
                'click a bar to see the people',
              )}
              span={12}
              empty={starts.length ? null : 'Nobody starts after the as-of date.'}
            >
              <Columns
                data={chartRows}
                x="weekOf"
                y="starts"
                series="businessUnit"
                seriesOrder={units}
                xOrder={u.weeks.map(weekLabel)}
                stack
                format="int"
                height={260}
                onSelect={(d) => drill(weekDrill(d.week))}
                onSelectSegment={(d) => (d.starts ? drill(cellDrill(d)) : drill(weekDrill(d.week)))}
              />
            </Figure>
          </Grid>
        </div>
      </Grid>

      <Section
        title="Who starts"
        dek={`Everyone who starts after ${formatDate(b.asOf)}: pre-hires in the HRIS and accepted offers in the ATS, counted once. A row opens the pre-hire's card, or the accepted offer.`}
      >
        <Figure
          id="onboarding-upcoming-starts"
          uses={union(UPCOMING, TASKS, TASK_OWNER, ['requisitions.hiringManager', 'candidates.recruiter'])}
          metric={M.readiness}
          title="Upcoming starts"
          subtitle="Each person's day-one tasks, readiness and the item blocking it"
          data={rows}
          columns={startColumns}
          definitions={defs(ctx.metrics, [M.readiness, M.starts])}
          note={asOfNote(
            b.asOf,
            plural(rows.length, 'start'),
            b.upcoming.duplicates.length
              ? `${fmt(b.upcoming.duplicates.length, 'int')} accepted offers matched to a pre-hire`
              : null,
          )}
          tableOnly
          table={{
            rowTone: (x) => (x.r.readiness.status ? READY_SEVERITY[x.r.readiness.status] : null),
            onRowClick: (x) =>
              x.r.start.employee ? openPerson(x.r.start.employee.employeeId) : drill(personDrill(x)),
            search: 'Search people, roles, sites',
            maxRows: 25,
          }}
          empty={rows.length ? null : 'Nobody starts after the as-of date.'}
        />
      </Section>

      <Section
        title="Ready for day one"
        dek={`For starts in the next ${fmt(s.readinessHorizonDays, 'days')}: the share of each day-one task done so far, and which team holds the open ones.`}
      >
        {!b.hasTasks ? (
          <NeedData {...NO_TASKS} dataset="onboardingTasks" />
        ) : (
          <>
            <Figure
              id="onboarding-readiness-by-task"
              uses={taskUses}
              metric={M.readinessByTask}
              title="Readiness by task"
              subtitle={`Share of starts by ${formatDate(u.horizonEnd)} with each day-one task done or not needed`}
              data={u.byTask}
              columns={byTaskColumns}
              note={asOfNote(b.asOf, plural(u.in30.length, 'start'))}
              span={6}
              empty={u.byTask.length ? null : 'No day-one tasks for the starts in this window.'}
            >
              <BarList
                data={u.byTask}
                label="task"
                value="share"
                format="pct"
                sort="none"
                domain={[0, 1]}
                secondary={(d) => `${fmt(d.done, 'int')} of ${fmt(d.starts, 'int')}`}
                tone={(d) => (d.pastDue ? 'warning' : 'default')}
                onSelect={(d) => drill(openTasksDrill(d.items, `${d.task}, open`))}
              />
            </Figure>
            <Figure
              id="onboarding-readiness-by-owner"
              uses={ownerUses}
              metric={M.readinessByOwner}
              title="Readiness by owner"
              subtitle={`Share of each team's day-one tasks done or not needed, starts by ${formatDate(u.horizonEnd)}`}
              data={u.byOwner}
              columns={byOwnerColumns}
              note={asOfNote(b.asOf, 'lowest first')}
              span={6}
              empty={u.byOwner.length ? null : 'No day-one tasks for the starts in this window.'}
            >
              <BarList
                data={u.byOwner}
                label="owner"
                value="share"
                format="pct"
                domain={[0, 1]}
                sort="none"
                secondary={(d) => `${fmt(d.open, 'int')} open`}
                tone={(d) => (d.pastDue ? 'warning' : 'default')}
                onSelect={(d) => drill(openTasksDrill(d.items, `Open tasks, ${d.owner}`))}
              />
            </Figure>
          </>
        )}
      </Section>

      <Section
        title="Notice periods and reneges"
        dek={`How long accepted offers take to start, by location, and how many accepted offers were withdrawn before the start, ${b.windowWords}.`}
      >
        <Figure
          id="onboarding-accept-to-start"
          uses={ACCEPT_TO_START}
          metric={M.acceptToStart}
          title="Offer accepted to start by location"
          subtitle={`Median days from offer accepted to the start date, offers accepted ${b.windowWords}`}
          data={ats.byLocation}
          columns={atsColumns}
          note={asOfNote(b.asOf, plural(ats.offers.length, 'accepted offer'), 'internal moves left out')}
          span={6}
          empty={ats.byLocation.length ? null : 'No accepted offers with a start date in this period.'}
        >
          <BarList
            data={ats.byLocation}
            label="location"
            value="days"
            format="days"
            top={10}
            secondary={(d) => `${fmt(d.offers, 'int')} offers`}
            ref={
              ats.days != null ? { value: ats.days, label: `company ${fmt(ats.days, 'days')}` } : undefined
            }
            nullNote={hiddenNote(s.minGroup)}
            onSelect={(d) =>
              drill(
                candidatesDrill(b, d.records, `Offers accepted, ${d.location}`, { uses: ACCEPT_TO_START }),
              )
            }
          />
        </Figure>
        <Figure
          id="onboarding-renege-by-location"
          uses={RENEGE}
          metric={M.renege}
          title="Reneges by location"
          subtitle={`Accepted offers later withdrawn, offers accepted ${b.windowWords}`}
          data={renegeData}
          columns={renegeColumns}
          note={asOfNote(
            b.asOf,
            `${plural(r.reneged.length, 'renege')} of ${plural(r.accepted.length, 'accepted offer')}`,
            `${r.tracked.country} tracked separately`,
          )}
          span={6}
          empty={renegeData.length ? null : 'No accepted offers in this period.'}
        >
          <BarList
            data={renegeData}
            label="location"
            value="rate"
            format="pct"
            top={8}
            secondary={(d) =>
              d.renegedN == null
                ? `n = ${fmt(d.acceptedN, 'int')}`
                : `${fmt(d.renegedN, 'int')} of ${fmt(d.acceptedN, 'int')}`
            }
            ref={
              r.company.rate != null
                ? { value: r.company.rate, label: `company ${fmt(r.company.rate, 'pct')}` }
                : undefined
            }
            tone={(d) => (target && d.rate != null && d.rate >= target.value ? 'warning' : 'default')}
            nullNote={hiddenNote(s.minGroup)}
            onSelect={(d) =>
              drill(candidatesDrill(b, d.accepted, `Offers accepted, ${d.location}`, { uses: RENEGE }))
            }
          />
        </Figure>
      </Section>
    </>
  )
}
