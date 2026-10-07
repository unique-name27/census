/**
 * Developer > Timings (docs/ROLES.md, 5.7): every `census:` User Timing measure (name, runs,
 * median, max, last), the slowest engine functions, and "Run all engines" (each view's headline,
 * summary and actions on a fresh context, cold, then on the live one, warm). Timings record only
 * in Developer mode.
 */
import { useState } from 'react'
import { BarList, Figure } from '@/charts'
import { Grid } from '@/components/Section'
import { toast } from '@/components/toast'
import { Button } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { fmt, plural } from '@/lib/format'
import { clearTimings, timingOn } from '@/lib/timing'
import { VIEWS } from '@/views/registry'
import { runAllEngines } from '../engines'
import { freshContext } from '../live'
import { engineStats, type TimingStat, timingStats } from '../overview'
import { useDev } from '../store'
import { useTimings } from './OverviewTab'
import { ABOUT_APP, StatusLine } from './shared'

export function TimingsTab() {
  const ctx = useAnalytics()
  const { entries, refresh } = useTimings(2000)
  const runs = useDev((s) => s.engineRuns)
  const setEngineRuns = useDev((s) => s.setEngineRuns)
  const [running, setRunning] = useState<string | null>(null)
  const stats = timingStats(entries)
  const slowest = engineStats(stats)
  const runRows = Object.values(runs).sort((a, b) => b.ms - a.ms)

  const runAll = async () => {
    setRunning('Running every engine twice.')
    try {
      const out = await runAllEngines(
        VIEWS,
        ctx,
        () => freshContext(ctx),
        (done, total) => setRunning(`Running engines: ${done} of ${total} views.`),
      )
      setEngineRuns(out)
      refresh()
      toast('Engines run', { tone: 'good', description: `${plural(out.length, 'function')}, cold and warm.` })
    } finally {
      setRunning(null)
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" disabled={!!running} onClick={() => void runAll()}>
          {running ? 'Running…' : 'Run all engines'}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            clearTimings()
            refresh()
          }}
        >
          Clear timings
        </Button>
        <StatusLine>
          {running ??
            (timingOn()
              ? 'Timings record in Developer mode only; the other modes record nothing.'
              : 'Recording is off: timings record in Developer mode only.')}
        </StatusLine>
      </div>
      <Grid className="mt-4">
        <Figure
          id="dev-engine-timings"
          title="Slowest engine functions"
          subtitle="The 15 slowest headlines, summaries and actions by median ms over the recorded runs"
          data={slowest}
          columns={STAT_COLUMNS}
          definitions={[ABOUT_APP]}
          note={slowest.length ? `${plural(stats.length, 'measure')} recorded` : undefined}
          gate={false}
          span={6}
          empty={
            slowest.length
              ? null
              : 'Nothing recorded yet. Run all engines, or move around Census in this mode.'
          }
          emptyAction={
            !slowest.length && !running ? (
              <Button size="sm" onClick={() => void runAll()}>
                Run all engines
              </Button>
            ) : undefined
          }
        >
          <BarList<TimingStat>
            data={slowest}
            label="name"
            value="median"
            format="num1"
            valueText={(s) => `${fmt(s.median, 'num1')} ms`}
            secondary={(s) => plural(s.runs, 'run')}
            ariaLabel="Median milliseconds of the slowest engine functions"
          />
        </Figure>
        <Figure
          id="dev-engine-runs"
          title="Engine runs, cold and warm"
          subtitle="The last run of each function: on a fresh context (cold) and on the live one (warm)"
          data={runRows.map((r) => ({ ...r, coldMs: r.coldMs ?? null }))}
          columns={[
            { key: 'id', label: 'Function' },
            { key: 'coldMs', label: 'Cold ms', format: 'num1' },
            { key: 'ms', label: 'Warm ms', format: 'num1' },
            { key: 'returned', label: 'Returned' },
            { key: 'error', label: 'Error' },
          ]}
          definitions={[
            ABOUT_APP,
            {
              term: 'Cold and warm',
              text: 'Cold runs on a context built afresh, so every cache kept per context misses. Warm runs on the context on screen, whose caches are filled.',
            },
          ]}
          gate={false}
          span={6}
          tableOnly
          table={{ maxRows: 15 }}
          empty={runRows.length ? null : 'Run all engines to compare cold and warm runs.'}
        />
      </Grid>
      <Grid className="mt-4">
        <Figure
          id="dev-timings"
          title="Every measure"
          subtitle="Each census: User Timing measure recorded on this page: runs, median, max and the last run, in ms"
          data={stats}
          columns={STAT_COLUMNS}
          definitions={[ABOUT_APP]}
          note={`${plural(entries.length, 'run')} recorded`}
          gate={false}
          span={12}
          tableOnly
          table={{ search: 'Find a measure', maxRows: 25 }}
          empty={stats.length ? null : 'Nothing recorded yet.'}
        />
      </Grid>
    </>
  )
}

const STAT_COLUMNS = [
  { key: 'name', label: 'Measure' },
  { key: 'runs', label: 'Runs', format: 'int' as const },
  { key: 'median', label: 'Median ms', format: 'num1' as const },
  { key: 'max', label: 'Max ms', format: 'num1' as const },
  { key: 'last', label: 'Last ms', format: 'num1' as const },
]
