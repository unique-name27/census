/**
 * Countdown to day one (Upcoming starts): who starts in the look-ahead, by start week and by the
 * team holding the open day-one task due first (the blocking item). Starts fall on a few Mondays,
 * so a grid of counts reads where dots would pile on one another: each cell is the number of
 * starts that week held by that team, its tooltip says how many are not ready or behind, and it
 * opens those starts (one start opens its day-one tasks). The table lists everyone by name. In
 * Manager and Finance mode a background check or export-control screening reads "With People ops" while open
 * and "Handled by People ops" once closed, with no completed date, in the table and the records,
 * so no contingency outcome is shown. Owner
 * teams are not a filter dimension and a person is not a group, so nothing offers "Filter to".
 */
import { MODE_NAME } from '@/access/modes'
import { type Column, Figure, Heatmap } from '@/charts'
import { useAnalytics } from '@/data/context'
import { ONBOARDING_OWNERS } from '@/data/schema'
import { drill } from '@/drill'
import type { DrillSpec } from '@/drill/types'
import { formatDate } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import { countdownDrill, startsDrill } from '../engine/drills'
import { TASK_OWNER, TASKS, UPCOMING, union } from '../engine/lineage'
import {
  type CountdownCell,
  type CountdownRow,
  countdownGrid,
  countdownRows,
  NOTHING_OPEN,
} from '../engine/upcoming'
import { M } from '../metrics'
import { asOfNote, defs, useOnboarding } from './shared'

export function Countdown() {
  const ctx = useAnalytics()
  const m = useOnboarding()
  const b = m.base
  const horizon = b.settings.readinessHorizonDays
  // Manager and Finance mode never show where a contingency stands, only who holds it.
  const masked = b.masked
  const rows = countdownRows(m.upcoming.rows, horizon, masked)
  const owners = [...ONBOARDING_OWNERS, NOTHING_OPEN]
  const grid = countdownGrid(rows, b.asOf, horizon, owners)
  const uses = union(UPCOMING, TASKS, TASK_OWNER)
  const open = (r: CountdownRow) => () => countdownDrill(b, r.row.readiness, r.name, { masked, uses })
  // A cell: one start opens their day-one tasks; several open the starts, each with its blocking item.
  const cellDrill = (c: CountdownCell): (() => DrillSpec | null) | null => {
    if (!c.starts) return null
    const one = c.rows.length === 1 ? c.rows[0] : null
    if (one) return one.row.readiness.total ? open(one) : null
    const held = c.owner === NOTHING_OPEN ? 'with nothing open' : `held by ${c.owner}`
    return () =>
      startsDrill(
        b,
        c.rows.map((r) => r.row.start),
        `Starts in the week of ${formatDate(c.week)}, ${held}`,
        {
          note: c.readiness,
          uses,
        },
      )
  }
  const notReady = rows.filter((r) => r.status === 'Not ready').length
  const behind = rows.filter((r) => r.status === 'Behind').length
  const columns: Column<CountdownRow>[] = [
    { key: 'name', label: 'Person', drill: (r) => (r.row.readiness.total ? open(r) : null) },
    { key: 'startDate', label: 'Start date', format: 'date' },
    { key: 'daysToGo', label: 'Days to go', format: 'days' },
    { key: 'owner', label: 'Held by' },
    { key: 'blocking', label: 'Blocking item' },
    { key: 'status', label: 'Readiness' },
  ]
  return (
    <Figure
      id="onboarding-countdown"
      uses={uses}
      metric={M.readiness}
      title="Countdown to day one"
      subtitle={`Starts in the next ${fmt(horizon, 'days')} by start week and the team holding the open day-one task due first`}
      data={rows}
      columns={columns}
      definitions={defs(
        ctx.metrics,
        [M.readiness],
        [
          {
            term: 'Held by',
            text: `The owner of the open day-one task due first. ${NOTHING_OPEN} means every day-one task is done or not needed.`,
          },
          { term: 'Start week', text: 'The Monday of the week the person starts.' },
          ...(masked
            ? [
                {
                  term: 'Background checks and screening',
                  text: `In ${MODE_NAME[ctx.access.mode]} mode these show the team that handles them, not where they stand or when they cleared.`,
                },
              ]
            : []),
        ],
      )}
      note={asOfNote(
        b.asOf,
        plural(rows.length, 'start'),
        `${fmt(notReady, 'int')} not ready`,
        behind ? `${fmt(behind, 'int')} behind` : '',
      )}
      span={12}
      empty={rows.length ? null : `Nobody starts in the next ${fmt(horizon, 'days')}.`}
      table={{ maxRows: 15 }}
    >
      <Heatmap<CountdownCell>
        data={grid}
        x="weekLabel"
        y="owner"
        value="starts"
        format="int"
        xOrder={[...new Set(grid.map((c) => c.weekLabel))]}
        yOrder={owners}
        detail={(c) => (c.starts ? c.readiness : null)}
        cellText={(c) => (c.starts ? fmt(c.starts, 'int') : '')}
        selectable={(c) => cellDrill(c) !== null}
        onSelect={(c) => drill(cellDrill(c))}
        ariaLabel="Starts by start week and the team holding the blocking item"
      />
    </Figure>
  )
}
