/**
 * First 90 days: whether people were ready on day one, Form I-9 Section 2, check-ins, probation
 * decisions, early voluntary attrition and the day-30 onboarding pulse.
 */
import { BarList, type Column, Figure, Lines } from '@/charts'
import { Button, cx, Grid, goTo, KpiStrip, Readout, Section, spanClass } from '@/components'
import { useAnalytics } from '@/data/context'
import type { Employee } from '@/data/schema'
import { drill, openPerson } from '@/drill'
import { formatDate, formatMonth } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import {
  employeesDrill,
  monthSub,
  readinessDrill,
  startEmployees,
  surveyDrill,
  tasksDrill,
  transactionsDrill,
} from '../engine/drills'
import {
  type CheckInItem,
  type NewHireTx,
  PULSE_DRIVER,
  PULSE_SURVEY,
  type RateGroup,
} from '../engine/first90'
import {
  ATTRITION_90,
  DEPARTMENT,
  MANAGER_AT_HIRE,
  NEW_HIRE_TX,
  PULSE,
  SITE,
  STARTERS,
  TASKS,
  union,
} from '../engine/lineage'
import type { Start } from '../engine/starts'
import { M } from '../metrics'
import {
  asOfNote,
  barTone,
  defs,
  drillIf,
  hiddenNote,
  NeedData,
  NO_TASKS,
  shareTone,
  useOnboarding,
} from './shared'

/** "7 of 9", or the group size alone when the group is under the anonymity minimum. */
const ofText = (met: number | null, n: number): string =>
  met == null ? `n = ${fmt(n, 'int')}` : `${fmt(met, 'int')} of ${fmt(n, 'int')}`

/**
 * A BarList fold rule for rates: the weighted rate of the folded rows that show one. Groups under
 * the anonymity minimum stay out, so the folded total can't be used to work out their count.
 */
const fold =
  <T,>(n: (r: T) => number, met: (r: T) => number | null) =>
  (rest: T[]): number | null => {
    let total = 0
    let hit = 0
    for (const r of rest) {
      const m = met(r)
      if (m == null) continue
      total += n(r)
      hit += m
    }
    return total ? hit / total : null
  }

export function First90Tab() {
  const ctx = useAnalytics()
  const m = useOnboarding()
  const b = m.base
  const f = m.first90
  const s = b.settings
  const min = s.minGroup
  const t = s.targets
  const dayOneUses = union(STARTERS, TASKS)

  /* Day-one readiness by month. */
  const people = startEmployees
  const ready = new Set(f.dayOne.ready)
  const monthRows = f.dayOne.byMonth.map((r) => ({
    month: r.month,
    monthName: formatMonth(`${r.month}-01`),
    starts: r.n,
    ready: r.ready,
    rate: r.rate,
    rows: r.rows,
  }))
  type MonthRow = (typeof monthRows)[number]
  const monthDrill = (r: MonthRow) => () =>
    employeesDrill(b, people(r.rows), `Starts in ${r.monthName}`, {
      subtitle: monthSub(b, r.month),
      uses: dayOneUses,
    })
  /** A readiness bar: the people not ready, or on a 100% bar the people who were. */
  const notReadyDrill = (rows: readonly Start[], where: string, subtitle?: string) => () =>
    readinessDrill(b, rows, ready, where, { subtitle, uses: dayOneUses })
  const readyDrill = (rows: readonly Start[], where: string, subtitle?: string) => () =>
    employeesDrill(b, people(rows.filter((p) => ready.has(p))), `Ready on day one, ${where}`, {
      subtitle,
      uses: dayOneUses,
    })
  const monthColumns: Column<MonthRow>[] = [
    { key: 'monthName', label: 'Start month' },
    {
      key: 'starts',
      label: 'Starts with tasks',
      format: 'int',
      drill: (r) => drillIf(r.starts, monthDrill(r)),
    },
    {
      key: 'ready',
      label: 'Ready on day one',
      format: 'int',
      drill: (r) => drillIf(r.ready, readyDrill(r.rows, r.monthName, monthSub(b, r.month))),
    },
    { key: 'rate', label: 'Day-one readiness', format: 'pct' },
  ]
  const shown = monthRows.filter((r) => r.rate != null)
  const values = shown.map((r) => r.rate as number)
  const floor = Math.max(0, Math.floor(Math.min(...values, t.dayOne?.value ?? 1) * 10) / 10 - 0.1)

  /* By site. */
  const siteRows = f.dayOne.bySite.map((g) => ({ site: g.group, starts: g.n, ready: g.met, rate: g.rate, g }))
  type SiteRow = (typeof siteRows)[number]
  const siteColumns: Column<SiteRow>[] = [
    { key: 'site', label: 'Site' },
    {
      key: 'starts',
      label: 'Starts with tasks',
      format: 'int',
      drill: (r) =>
        drillIf(r.starts, () =>
          employeesDrill(b, people(r.g.rows), `Starts, ${r.site}`, { uses: dayOneUses }),
        ),
    },
    {
      key: 'ready',
      label: 'Ready on day one',
      format: 'int',
      drill: (r) => drillIf(r.ready, readyDrill(r.g.rows, r.site)),
    },
    { key: 'rate', label: 'Day-one readiness', format: 'pct' },
  ]
  const nh = f.newHire
  const nhRows = nh.bySite.map((g) => ({ site: g.group, due: g.n, onTime: g.met, rate: g.rate, g }))
  type NhRow = (typeof nhRows)[number]
  const nhDrill = (g: RateGroup<NewHireTx>, title: string) => () =>
    transactionsDrill(
      b,
      g.rows.map((x) => x.tx),
      title,
      { uses: NEW_HIRE_TX },
    )
  const nhColumns: Column<NhRow>[] = [
    { key: 'site', label: 'Site' },
    {
      key: 'due',
      label: 'New hires due',
      format: 'int',
      drill: (r) => drillIf(r.due, nhDrill(r.g, `New hire transactions, ${r.site}`)),
    },
    {
      key: 'onTime',
      label: 'Entered by day -3',
      format: 'int',
      drill: (r) =>
        drillIf(r.onTime, () =>
          transactionsDrill(
            b,
            r.g.rows.filter((x) => x.onTime).map((x) => x.tx),
            `New hires entered by day -3, ${r.site}`,
            { uses: NEW_HIRE_TX },
          ),
        ),
    },
    { key: 'rate', label: 'On time', format: 'pct' },
  ]

  /* Check-ins. */
  const ciUses = union(STARTERS, TASKS)
  const ciRows = (groups: RateGroup<CheckInItem>[]) =>
    groups.map((g) => ({
      group: g.group,
      due: g.n,
      onTime: g.met,
      late: g.met == null ? null : g.n - g.met,
      rate: g.rate,
      g,
    }))
  const byCheckIn = ciRows(f.checkIns.byCheckIn)
  const byDept = ciRows(f.checkIns.byDepartment)
  type CiRow = (typeof byCheckIn)[number]
  const ciDrill = (g: RateGroup<CheckInItem>, title: string, only?: 'late' | 'onTime') => () =>
    tasksDrill(
      b,
      g.rows.filter((x) => !only || (only === 'late' ? !x.onTime : x.onTime)).map((x) => x.task),
      title,
      { uses: union(ciUses, DEPARTMENT) },
    )
  /** A check-in bar opens the late or missed ones; on a 100% bar, the ones held on time. */
  const ciBarDrill = (g: RateGroup<CheckInItem>, group: string) =>
    g.met != null && g.met === g.n
      ? ciDrill(g, `Check-ins on time, ${group}`, 'onTime')
      : ciDrill(g, `Check-ins late or missed, ${group}`, 'late')
  const ciColumns = (label: string): Column<CiRow>[] => [
    { key: 'group', label },
    {
      key: 'due',
      label: 'Due',
      format: 'int',
      drill: (r) => drillIf(r.due, ciDrill(r.g, `Check-ins due, ${r.group}`)),
    },
    {
      key: 'onTime',
      label: 'On time',
      format: 'int',
      drill: (r) => drillIf(r.onTime, ciDrill(r.g, `Check-ins on time, ${r.group}`, 'onTime')),
    },
    {
      key: 'late',
      label: 'Late or missed',
      format: 'int',
      drill: (r) => drillIf(r.late, ciDrill(r.g, `Check-ins late or missed, ${r.group}`, 'late')),
    },
    { key: 'rate', label: 'On time %', format: 'pct' },
  ]

  /* Probation. */
  const probRows = f.probation.map((x) => ({
    name: x.person.name,
    department: x.person.department,
    location: x.person.location,
    manager: x.person.hiringManager,
    startDate: x.person.startDate,
    due: x.due,
    state: x.state,
    daysLate: x.daysLate > 0 ? x.daysLate : null,
    dueIn: x.daysLate > 0 ? null : -x.daysLate,
    x,
  }))
  type ProbRow = (typeof probRows)[number]
  const probUses = union(STARTERS, TASKS, [
    'employees.terminationDate',
    'employees.country',
    'employees.managerId',
  ])
  const probColumns: Column<ProbRow>[] = [
    { key: 'name', label: 'Person' },
    { key: 'department', label: 'Department' },
    { key: 'location', label: 'Location' },
    { key: 'manager', label: 'Manager' },
    { key: 'startDate', label: 'Start date', format: 'date' },
    {
      key: 'due',
      label: 'Decision due',
      format: 'date',
      drill: (r) => () => tasksDrill(b, [r.x.task], `Probation decision, ${r.name}`, { uses: probUses }),
    },
    { key: 'state', label: 'Status' },
    { key: 'daysLate', label: 'Days past due', format: 'days' },
    { key: 'dueIn', label: 'Due in', format: 'days' },
  ]

  /* Early attrition. */
  const a = f.attrition
  // Groups under the anonymity minimum show no leaver count either, so nobody can be singled out.
  const attrRows = (groups: (RateGroup<Employee> & { managerId?: string | null })[]) =>
    groups.map((g) => ({ group: g.group, starts: g.n, left: g.rate == null ? null : g.met, rate: g.rate, g }))
  const attrDept = attrRows(a.byDepartment)
  const attrMgr = attrRows(a.byManager)
  // Managers under the minimum are folded into "Other (k)": say how many, and whether that group
  // shows a rate or is itself too small and hidden.
  const mgrFolded = a.byManager.reduce((n, g) => n + (g.folded ?? 0), 0)
  const mgrOtherShown = a.byManager.some((g) => g.folded && g.rate != null)
  const mgrFoldedNote = mgrFolded
    ? `${plural(mgrFolded, 'manager')} under ${fmt(min, 'int')} starts ${mgrOtherShown ? 'grouped as Other' : 'hidden'}`
    : null
  type AttrRow = (typeof attrDept)[number]
  const attrUses = union(ATTRITION_90, MANAGER_AT_HIRE)
  const attrColumns = (label: string): Column<AttrRow>[] => [
    { key: 'group', label },
    {
      key: 'starts',
      label: 'Starts',
      format: 'int',
      drill: (r) =>
        r.rate == null ? null : () => employeesDrill(b, r.g.rows, `Starts, ${r.group}`, { uses: attrUses }),
    },
    {
      key: 'left',
      label: 'Resigned early',
      format: 'int',
      drill: (r) =>
        r.rate == null || !r.left
          ? null
          : () =>
              employeesDrill(
                b,
                r.g.rows.filter((e) => a.leavers.includes(e)),
                `Resigned early, ${r.group}`,
                { uses: attrUses },
              ),
    },
    { key: 'rate', label: 'Early voluntary attrition', format: 'pct' },
  ]

  /* Day-30 pulse. */
  const p = f.pulse
  const pulseRows = p.byRegion
    ? [...p.byRegion.groups, ...(p.byRegion.other ? [p.byRegion.other] : [])].map((g) => ({
        region: g.group,
        respondents: g.respondents,
        mean: g.mean,
      }))
    : []
  type PulseRow = (typeof pulseRows)[number]
  const pulseDrill = () =>
    surveyDrill(b, PULSE_SURVEY, p.byRegion, p.overall, 'Day-30 "I had what I needed", by region', {
      groupBy: 'Region',
      item: p.item,
      driver: PULSE_DRIVER,
      uses: PULSE,
    })
  const pulseColumns: Column<PulseRow>[] = [
    { key: 'region', label: 'Region' },
    { key: 'respondents', label: 'Respondents', format: 'int', drill: () => pulseDrill },
    { key: 'mean', label: 'Mean score (1 to 5)', format: 'num2' },
  ]

  const findings = m.findings.filter((x) => x.tab === 'first90')
  const noTasks = !b.hasTasks
  return (
    <>
      <Grid>
        <KpiStrip kpis={m.kpis.first90} />
        <Readout
          findings={findings}
          span={4}
          title="First 90 days readout"
          emptyText="Nothing stands out in the first 90 days for this scope and period."
          className="md:col-span-12 lg:sticky lg:top-4"
        />
        <div className={cx(spanClass(8), 'min-w-0')}>
          <Grid>
            {noTasks ? (
              <NeedData {...NO_TASKS} dataset="onboardingTasks" />
            ) : (
              <Figure
                id="onboarding-day-one-by-month"
                uses={dayOneUses}
                metric={M.dayOne}
                title="Day-one readiness by month"
                subtitle={`Share of people who started each month with every day-one task done by their first day, ${b.windowWords}`}
                data={monthRows}
                columns={monthColumns}
                note={asOfNote(
                  b.asOf,
                  `${fmt(f.dayOne.ready.length, 'int')} of ${plural(f.dayOne.judged.length, 'start')} ready`,
                  t.dayOne ? `target ${fmt(t.dayOne.value, 'pct0')}` : null,
                )}
                span={12}
                empty={
                  shown.length
                    ? null
                    : `Every month has fewer than ${min} starts with tasks, so rates are hidden.`
                }
              >
                <Lines
                  data={shown}
                  x="month"
                  y="rate"
                  format="pct"
                  ref={
                    t.dayOne
                      ? { value: t.dayOne.value, label: `target ${fmt(t.dayOne.value, 'pct0')}` }
                      : undefined
                  }
                  yDomain={[floor, 1]}
                  xTicks="quarter"
                  height={240}
                  onSelect={(d) => drill(notReadyDrill(d.rows, d.monthName, monthSub(b, d.month)))}
                />
              </Figure>
            )}
          </Grid>
        </div>
      </Grid>

      <Section
        title="Where day one slips"
        dek="Day-one readiness by site, and whether the HRIS had each new hire entered three business days before the start (Atlas ON-03, moved here from HR ops)."
      >
        <Figure
          id="onboarding-day-one-by-site"
          uses={union(dayOneUses, SITE)}
          metric={M.dayOne}
          title="Day-one readiness by site"
          subtitle={`Starts with every day-one task done by the first day, ${b.windowWords}`}
          data={siteRows}
          columns={siteColumns}
          note={asOfNote(b.asOf, 'lowest first')}
          span={6}
          empty={
            noTasks
              ? 'Upload Onboarding tasks to see this.'
              : siteRows.length
                ? null
                : 'No starts with tasks in this period.'
          }
        >
          <BarList
            data={siteRows}
            label="site"
            value="rate"
            format="pct"
            sort="none"
            domain={[0, 1]}
            secondary={(d) => ofText(d.ready, d.starts)}
            ref={
              t.dayOne ? { value: t.dayOne.value, label: `target ${fmt(t.dayOne.value, 'pct0')}` } : undefined
            }
            tone={(d) => barTone(d.rate, t.dayOne?.value)}
            glyphTone={(d) => shareTone(d.rate, t.dayOne?.value)}
            nullNote={hiddenNote(min)}
            onSelect={(d) => drill(d.rate == null ? null : notReadyDrill(d.g.rows, d.site))}
          />
        </Figure>
        <Figure
          id="onboarding-new-hire-entered"
          uses={NEW_HIRE_TX}
          metric={M.newHireEntered}
          title="New hires entered by day -3, by site"
          subtitle={`New hire transactions completed by their due date, starts ${b.windowWords}`}
          data={nhRows}
          columns={nhColumns}
          note={asOfNote(b.asOf, plural(nh.judged.length, 'new hire transaction'), 'lowest first')}
          span={6}
          empty={nhRows.length ? null : 'Upload HR transactions with New hire rows to see this.'}
        >
          <BarList
            data={nhRows}
            label="site"
            value="rate"
            format="pct"
            sort="none"
            domain={[0, 1]}
            secondary={(d) => ofText(d.onTime, d.due)}
            tone={(d) => barTone(d.rate, null)}
            glyphTone={(d) => shareTone(d.rate, null)}
            nullNote={hiddenNote(min)}
            onSelect={(d) =>
              drill(
                d.rate == null
                  ? null
                  : () => {
                      // The late ones; on a 100% bar, the ones entered on time.
                      const late = d.g.rows.filter((x) => !x.onTime)
                      return late.length
                        ? transactionsDrill(
                            b,
                            late.map((x) => x.tx),
                            `New hires entered late, ${d.site}`,
                            { uses: NEW_HIRE_TX },
                          )
                        : transactionsDrill(
                            b,
                            d.g.rows.map((x) => x.tx),
                            `New hires entered by day -3, ${d.site}`,
                            { uses: NEW_HIRE_TX },
                          )
                    },
              )
            }
          />
        </Figure>
      </Section>

      <Section
        title="Check-ins and probation"
        dek="Whether managers hold the 30, 60 and 90-day check-ins on time, and which probation decisions are due or overdue."
      >
        <Figure
          id="onboarding-check-ins"
          uses={ciUses}
          metric={M.checkIns}
          title="Check-ins on time"
          subtitle={`30, 60 and 90-day check-ins due ${b.windowWords}, done by their due date`}
          data={byCheckIn}
          columns={ciColumns('Check-in')}
          note={asOfNote(
            b.asOf,
            plural(f.checkIns.judged.length, 'check-in'),
            t.checkIns ? `target ${fmt(t.checkIns.value, 'pct0')}` : null,
          )}
          span={6}
          empty={
            noTasks
              ? 'Upload Onboarding tasks to see this.'
              : byCheckIn.length
                ? null
                : 'No check-ins due in this period.'
          }
        >
          <BarList
            data={byCheckIn}
            label="group"
            value="rate"
            format="pct"
            sort="none"
            domain={[0, 1]}
            secondary={(d) => ofText(d.onTime, d.due)}
            ref={
              t.checkIns
                ? { value: t.checkIns.value, label: `target ${fmt(t.checkIns.value, 'pct0')}` }
                : undefined
            }
            tone={(d) => barTone(d.rate, t.checkIns?.value)}
            glyphTone={(d) => shareTone(d.rate, t.checkIns?.value)}
            nullNote={hiddenNote(min)}
            onSelect={(d) => drill(d.rate == null ? null : ciBarDrill(d.g, d.group))}
          />
        </Figure>
        <Figure
          id="onboarding-check-ins-by-department"
          uses={union(ciUses, DEPARTMENT)}
          metric={M.checkIns}
          title="Check-ins on time by department"
          subtitle={`Lowest first, check-ins due ${b.windowWords}`}
          data={byDept}
          columns={ciColumns('Department')}
          note={asOfNote(b.asOf, `departments under ${min} check-ins hidden`)}
          span={6}
          empty={
            noTasks
              ? 'Upload Onboarding tasks to see this.'
              : byDept.length
                ? null
                : 'No check-ins due in this period.'
          }
        >
          <BarList
            data={byDept}
            label="group"
            value="rate"
            format="pct"
            sort="none"
            top={10}
            other={fold(
              (r) => r.due,
              (r) => r.onTime,
            )}
            domain={[0, 1]}
            secondary={(d) => ofText(d.onTime, d.due)}
            ref={
              t.checkIns
                ? { value: t.checkIns.value, label: `target ${fmt(t.checkIns.value, 'pct0')}` }
                : undefined
            }
            tone={(d) => barTone(d.rate, t.checkIns?.value)}
            glyphTone={(d) => shareTone(d.rate, t.checkIns?.value)}
            nullNote={hiddenNote(min)}
            onSelect={(d) => drill(d.rate == null ? null : ciBarDrill(d.g, d.group))}
          />
        </Figure>
        <Figure
          id="onboarding-probation"
          uses={probUses}
          metric={M.probation}
          title="Probation decisions due and overdue"
          subtitle={`Open probation decisions due by ${formatDate(b.asOf)} or in the next ${fmt(s.probationDueSoonDays, 'days')}, people still employed`}
          data={probRows}
          columns={probColumns}
          note={asOfNote(
            b.asOf,
            `${fmt(probRows.filter((r) => r.state === 'Overdue').length, 'int')} overdue`,
            `${fmt(probRows.filter((r) => r.state === 'Due soon').length, 'int')} due soon`,
          )}
          tableOnly
          table={{
            rowTone: (r) => (r.state === 'Overdue' ? 'warning' : null),
            onRowClick: (r) => openPerson(r.x.person.key),
          }}
          span={12}
          empty={
            noTasks
              ? 'Upload Onboarding tasks to see this.'
              : probRows.length
                ? null
                : 'No probation decisions are due or overdue.'
          }
        />
      </Section>

      <Section
        title="Early leavers"
        dek={`People who resigned within ${fmt(s.attritionDays, 'days')} of starting, by department and by the manager they joined. Groups under ${min} starts are hidden.`}
      >
        <Figure
          id="onboarding-attrition-by-department"
          uses={attrUses}
          metric={M.attrition90}
          title="Early voluntary attrition by department"
          subtitle={`Starts ${b.windowWords} whose first ${fmt(s.attritionDays, 'days')} have passed`}
          data={attrDept}
          columns={attrColumns('Department')}
          note={asOfNote(b.asOf, `${fmt(a.leavers.length, 'int')} of ${plural(a.cohort.length, 'start')}`)}
          span={6}
          empty={a.cohort.length ? null : 'No starts whose early exit window has passed in this period.'}
        >
          <BarList
            data={attrDept}
            label="group"
            value="rate"
            format="pct"
            sort="none"
            top={10}
            other={fold(
              (r) => r.starts,
              (r) => r.left,
            )}
            secondary={(d) => ofText(d.left, d.starts)}
            ref={
              t.attrition90
                ? { value: t.attrition90.value, label: `target ${fmt(t.attrition90.value, 'pct0')}` }
                : undefined
            }
            nullNote={hiddenNote(min)}
            onSelect={(d) =>
              drill(
                d.rate == null
                  ? null
                  : () => employeesDrill(b, d.g.rows, `Starts, ${d.group}`, { uses: attrUses }),
              )
            }
          />
        </Figure>
        <Figure
          id="onboarding-attrition-by-manager"
          uses={attrUses}
          metric={M.attrition90}
          title="Early voluntary attrition by hiring manager"
          subtitle="The manager at the start date; managers with fewer starts than the minimum are grouped as Other"
          data={attrMgr.filter((x) => x.rate != null)}
          columns={attrColumns('Manager at hire')}
          note={asOfNote(b.asOf, mgrFoldedNote)}
          span={6}
          empty={
            attrMgr.some((x) => x.rate != null)
              ? null
              : `No manager has ${min} or more starts whose early exit window has passed.`
          }
        >
          <BarList
            data={attrMgr.filter((x) => x.rate != null)}
            label="group"
            value="rate"
            format="pct"
            sort="none"
            top={10}
            other={fold(
              (r) => r.starts,
              (r) => r.left,
            )}
            secondary={(d) => ofText(d.left, d.starts)}
            nullNote={hiddenNote(min)}
            onSelect={(d) =>
              drill(() => employeesDrill(b, d.g.rows, `Starts, ${d.group}`, { uses: attrUses }))
            }
          />
        </Figure>
      </Section>

      <Section
        title="What new starters say"
        dek="One number from the day-30 onboarding pulse. The full survey, with every driver, is in Listening."
        actions={
          <Button size="sm" variant="ghost" onClick={() => goTo('listening', 'onboarding')}>
            Open in Listening
          </Button>
        }
      >
        <Figure
          id="onboarding-pulse"
          uses={PULSE}
          metric={M.pulse}
          title={'Day-30 "I had what I needed" by region'}
          subtitle={`Mean score on a 1 to 5 scale, answers given ${b.windowWords}`}
          data={pulseRows}
          columns={pulseColumns}
          definitions={defs(ctx.metrics, [M.pulse])}
          note={asOfNote(
            b.asOf,
            p.overall ? `${plural(p.overall.respondents, 'respondent')}` : null,
            p.overall?.mean != null ? `company ${fmt(p.overall.mean, 'num2')}` : null,
            p.target != null ? `target ${fmt(p.target, 'num1')}` : null,
            `groups under ${s.surveyMin} respondents hidden`,
          )}
          span={6}
          empty={
            !b.hasSurveys
              ? 'Upload Survey responses to see this.'
              : p.overall?.suppressed
                ? hiddenNote(s.surveyMin)
                : pulseRows.length
                  ? null
                  : 'No day-30 pulse answers in this period.'
          }
        >
          <BarList
            data={pulseRows}
            label="region"
            value="mean"
            format="num2"
            domain={[1, 5]}
            secondary={(d) => `${fmt(d.respondents, 'int')} respondents`}
            ref={p.target != null ? { value: p.target, label: `target ${fmt(p.target, 'num1')}` } : undefined}
            tone={(d) =>
              d.mean != null && p.target != null && d.mean < p.target - 0.5 ? 'warning' : 'default'
            }
            nullNote={hiddenNote(s.surveyMin)}
            onSelect={() => drill(pulseDrill)}
          />
        </Figure>
      </Section>
    </>
  )
}
