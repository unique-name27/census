/**
 * My team's My list (docs/ROLES-V2.md 5.12): one table of the people in the manager's org, direct
 * reports first, with their start date, whether they are in their first 90 days, an open probation
 * decision, overdue required courses and the open reqs they own. A row opens the person's card;
 * each count opens its records. It follows Manager mode's rules: no pay, rating, flight risk,
 * survey or case.
 */
import { type Column, Figure } from '@/charts'
import { Section } from '@/components'
import { useAnalytics } from '@/data/context'
import { openPerson } from '@/drill'
import { drillSpec } from '@/drill/types'
import { formatDate } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import { ID } from '@/views/hrbp/metrics'
import { openReqsDrill } from '@/views/recruiting/engine/drills'
import { FIRST_DAYS, type TeamPersonRow, type TeamSources, teamLeader, teamPeople } from '../engine'

const ROWS = 50

export function MyListSection({ s }: { s: TeamSources }) {
  const ctx = useAnalytics()
  const leader = teamLeader(ctx)
  const rows = teamPeople(ctx, s, leader?.id ?? null)
  const direct = rows.filter((r) => r.direct).length
  const columns: Column<TeamPersonRow>[] = [
    { key: 'name', label: 'Name' },
    { key: 'title', label: 'Title' },
    { key: 'reportsTo', label: 'Reports to' },
    { key: 'startDate', label: 'Start date', format: 'date' },
    { key: 'firstNinety', label: `In first ${FIRST_DAYS} days` },
    {
      key: 'probationDue',
      label: 'Probation decision due',
      format: 'date',
      drill: (r) =>
        r.probation
          ? drillSpec({
              kind: 'onboardingTasks',
              title: `Probation decision, ${r.name}`,
              rows: [r.probation],
            })
          : null,
    },
    {
      key: 'overdueCourses',
      label: 'Overdue required courses',
      format: 'int',
      drill: (r) =>
        r.courses.length
          ? drillSpec({
              kind: 'learning',
              title: `Overdue required courses, ${r.name}`,
              rows: r.courses,
              note: 'Required, past the due date and not completed.',
            })
          : null,
    },
    {
      key: 'openReqs',
      label: 'Open reqs they own',
      format: 'int',
      drill: (r) =>
        r.reqs.length ? () => openReqsDrill(s.recruiting.base, r.reqs, `Open reqs, ${r.name}`) : null,
    },
  ]
  return (
    <Section
      title="My list"
      dek="Everyone in the org, your direct reports first: who is new, whose probation decision is open, and what is overdue."
    >
      <Figure
        id="team-people"
        metric={ID.headcount}
        uses={[
          'employees.employeeId',
          'employees.managerId',
          'employees.hireDate',
          'onboardingTasks.dueDate',
          'learning.dueDate',
        ]}
        title="My list: my team"
        subtitle={`Active people in ${leader ? `${leader.name}'s org` : 'the org'} on ${formatDate(ctx.asOf)}, direct reports first`}
        data={rows}
        columns={columns}
        note={`${plural(rows.length, 'person', 'people')}, ${fmt(direct, 'int')} direct ${direct === 1 ? 'report' : 'reports'} · a row opens the person`}
        span={12}
        tableOnly
        table={{ maxRows: ROWS, onRowClick: (r) => openPerson(r.employeeId) }}
        empty={rows.length ? null : 'Nobody is active in this org on the as-of date.'}
      />
    </Section>
  )
}
