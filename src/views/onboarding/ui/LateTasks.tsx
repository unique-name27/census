/**
 * Two First 90 days figures (docs/CHARTS.md, Onboarding), both for HR and Developer mode only:
 *
 *  - Late day-one tasks by task and region (or site): the share of starters whose task was done
 *    after its due date, or is still open past it. A cell opens those late tasks; a region carries
 *    its sites as the filter, named as the region ("Filter to Asia Pacific"), a site itself. Cells
 *    under the anonymity minimum show "—".
 *  - When day-one tasks were finished: for one task, days from the start date to completion, with
 *    the on-time zone shaded and the first day marked, so a late task that still landed before day
 *    one reads apart from one that left a new starter waiting. A bin opens its tasks.
 */
import { useState } from 'react'
import { type Column, Figure, Heatmap, Histogram, type HistogramBin } from '@/charts'
import { Segmented } from '@/components'
import { useAnalytics } from '@/data/context'
import { drill } from '@/drill'
import { fmt, plural } from '@/lib/format'
import { tasksDrill, timingBinDrill } from '../engine/drills'
import {
  type LateCell,
  lateByTaskAndPlace,
  lateTaskNames,
  REGION_ORDER,
  type TaskTimingItem,
  taskTiming,
} from '../engine/first90'
import { SITE, STARTERS, TASKS, union } from '../engine/lineage'
import { M } from '../metrics'
import { lateCellDrill } from './drill'
import { asOfNote, defs, hiddenNote, useOnboarding } from './shared'

type Place = 'region' | 'site'

/** Short names for the task picker. */
const SHORT: Record<string, string> = {
  'Laptop shipped': 'Laptop',
  'Accounts created': 'Accounts',
  'Background check cleared': 'Background check',
  'Export-control screening': 'Export screening',
  'Badge ready': 'Badge',
  'Benefits packet sent': 'Benefits',
  'Orientation booked': 'Orientation',
  'Manager welcome': 'Welcome',
  'Day -1 readiness check': 'Day -1 check',
}

/** Tasks offered in the timing chart's picker: the ones with the most late items. */
const PICKS = 4

export function LateTasksHeatmap() {
  const ctx = useAnalytics()
  const m = useOnboarding()
  const b = m.base
  const f = m.first90
  const min = b.settings.minGroup
  const [by, setBy] = useState<Place>('region')
  const uses = union(STARTERS, TASKS, SITE)
  const cells = lateByTaskAndPlace(f.readinessTasks, by, min)
  const cellDrill = lateCellDrill(b, ctx.all.employees, by, uses)
  const places = [...new Set(cells.map((c) => c.place))]
  const xOrder =
    by === 'region'
      ? [
          ...REGION_ORDER.filter((r) => places.includes(r)),
          ...places.filter((p) => !REGION_ORDER.includes(p)),
        ]
      : places.sort((a, c) => (a === 'Unknown' ? 1 : c === 'Unknown' ? -1 : a.localeCompare(c)))
  const late = cells.reduce((n, c) => n + (c.late ?? 0), 0)
  const columns: Column<LateCell>[] = [
    { key: 'task', label: 'Task' },
    { key: 'place', label: by === 'region' ? 'Region' : 'Site' },
    { key: 'n', label: 'Starts with the task', format: 'int' },
    { key: 'late', label: 'Late', format: 'int', drill: cellDrill },
    { key: 'share', label: 'Share late', format: 'pct' },
  ]
  return (
    <Figure
      id="onboarding-late-tasks-by-region"
      uses={uses}
      metric={M.lateByPlace}
      title={`Late day-one tasks by task and ${by}`}
      subtitle={`Share of starters with each day-one task done after its due date or still open past it, starts ${b.windowWords}`}
      data={cells}
      columns={columns}
      definitions={defs(
        ctx.metrics,
        [M.lateByPlace, M.dayOne, M.lateTask],
        [
          {
            term: 'Late',
            text: 'Done after the due date, or still open past it on the as-of date. Tasks marked not needed are left out.',
          },
          { term: 'Hidden', text: hiddenNote(min) },
        ],
      )}
      note={asOfNote(b.asOf, `${plural(late, 'late task')}`, `cells under ${fmt(min, 'int')} starts hidden`)}
      span={7}
      actions={
        <Segmented<Place>
          size="sm"
          value={by}
          onChange={setBy}
          options={[
            { value: 'region', label: 'Region' },
            { value: 'site', label: 'Site' },
          ]}
          label="Late tasks by"
        />
      }
      empty={cells.length ? null : 'No day-one tasks for starts in this period.'}
    >
      <Heatmap
        data={cells}
        x="place"
        y="task"
        value="share"
        n="n"
        format="pct0"
        scheme="sequential"
        xOrder={xOrder}
        yOrder={[...new Set(cells.map((c) => c.task))]}
        selectable={(c) => c.items.length > 0}
        lockedNote={() => 'No late tasks'}
        onSelect={(c) => drill(cellDrill(c))}
        ariaLabel={`Late day-one tasks by task and ${by}`}
      />
    </Figure>
  )
}

/** A bin of whole days by the days it holds: "4 d after", "The first day", "9 d before to 8 d before". */
function timingBinLabel(x0: number, x1: number): string {
  const when = (d: number) => (d < 0 ? `${-d} d before` : d === 0 ? 'the first day' : `${d} d after`)
  const text = x1 - x0 <= 1 ? when(x0) : `${when(x0)} to ${when(x1 - 1)}`
  return text.charAt(0).toUpperCase() + text.slice(1)
}

interface TimingRow {
  person: string
  startDate: string
  completedDate: string | null
  daysFromStart: number
  state: string
  item: TaskTimingItem
}

export function TaskTimingChart() {
  const ctx = useAnalytics()
  const m = useOnboarding()
  const b = m.base
  const f = m.first90
  const min = b.settings.minGroup
  const uses = union(STARTERS, TASKS)
  const choices = lateTaskNames(f.readinessTasks).slice(0, PICKS)
  const [picked, setPicked] = useState<string | null>(null)
  const task = picked && choices.includes(picked) ? picked : (choices[0] ?? 'Laptop shipped')
  const t = taskTiming(f.readinessTasks, task, min)
  const rows: TimingRow[] = t.done.map((d) => ({
    person: d.item.start.name,
    startDate: d.item.start.startDate,
    completedDate: d.item.task.task.completedDate ?? null,
    daysFromStart: d.days,
    state: d.item.task.state,
    item: d,
  }))
  const days = rows.map((r) => r.daysFromStart)
  const lo = Math.min(0, t.dueDay ?? 0, ...days)
  const hi = Math.max(1, ...days.map((d) => d + 1))
  const step = Math.max(1, Math.ceil((hi - lo) / 30))
  const edges: number[] = []
  for (let x = lo; x < hi + step; x += step) edges.push(x)
  const one = (r: TimingRow) => () => tasksDrill(b, [r.item.item.task], `${task}, ${r.person}`, { uses })
  const columns: Column<TimingRow>[] = [
    { key: 'person', label: 'Person', drill: one },
    { key: 'startDate', label: 'Start date', format: 'date' },
    { key: 'completedDate', label: 'Completed', format: 'date' },
    { key: 'daysFromStart', label: 'Days from start', format: 'int', drill: one },
    { key: 'state', label: 'Status' },
  ]
  const binDrill = (bin: HistogramBin<TimingRow>) =>
    timingBinDrill(
      b,
      task,
      bin.rows.map((r) => r.item),
      bin.x0,
      bin.x1,
      { uses },
    )
  return (
    <Figure
      id="onboarding-task-timing"
      uses={uses}
      metric={M.taskTiming}
      title="When day-one tasks were finished"
      subtitle={`Days from the start date to completion, ${task.toLowerCase()}, starts ${b.windowWords}`}
      data={rows}
      columns={columns}
      definitions={defs(ctx.metrics, [M.taskTiming])}
      note={
        t.shown
          ? asOfNote(
              b.asOf,
              `${fmt(t.late, 'int')} of ${plural(t.done.length, 'task')} late`,
              `${fmt(t.lateAfterStart, 'int')} after the first day`,
              t.open.length ? `${fmt(t.open.length, 'int')} still open` : null,
            )
          : undefined
      }
      span={6}
      actions={
        choices.length > 1 ? (
          <Segmented<string>
            size="sm"
            value={task}
            onChange={setPicked}
            options={choices.map((c) => ({ value: c, label: SHORT[c] ?? c }))}
            label="Task"
          />
        ) : undefined
      }
      empty={
        !t.n
          ? 'No day-one task was late in this period.'
          : !t.shown
            ? hiddenNote(min)
            : rows.length
              ? null
              : 'None of these tasks is completed yet.'
      }
    >
      <Histogram
        data={rows}
        value="daysFromStart"
        thresholds={edges}
        format="int"
        unit="starts"
        band={t.dueDay != null ? [lo, t.dueDay] : undefined}
        bandLabel="By the due date"
        refs={[{ value: 0, label: 'First day' }]}
        binLabel={timingBinLabel}
        onSelect={(bin) => drill(binDrill(bin))}
        ariaLabel={`When ${task.toLowerCase()} was finished`}
      />
    </Figure>
  )
}
