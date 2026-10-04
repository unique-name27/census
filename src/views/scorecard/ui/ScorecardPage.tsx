/**
 * The People scorecard (docs/VIEWS.md, Scorecard): each practice's key measures against target
 * (lead, 8 of 12 columns) and the most serious findings across Census (4 of 12). Both come from the views'
 * own summaries, computed in idle time after the first paint; until then each sheet says so in
 * one quiet line.
 */
import { Figure } from '@/charts'
import { Grid, goTo, Readout, spanClass } from '@/components'
import type { FindingSource } from '@/components/Readout'
import type { Finding } from '@/components/types'
import { Button, cx, Popover } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { formatDate } from '@/lib/dates'
import { plural } from '@/lib/format'
import { definitionOf } from '@/metrics/api'
import { metricHref, openMetricDefinition, openMetricDefinitions } from '@/views/data/metrics/open'
import type { ScorecardModel, SourcedFinding } from '../engine/model'
import { scorecardTable, standingLine } from '../engine/report'
import { M } from '../metrics'
import { ScoreTable } from './ScoreTable'
import { useScorecard } from './useScorecard'

const LOADING = "Reading each practice's measures and findings."

/**
 * The scorecard and the findings sit side by side from 1280px (8 and 4 columns); below that the
 * table needs the full width for its seven columns, and the findings follow under it.
 */
const LEAD = 'xl:col-span-8'
const SIDE = 'xl:col-span-4'

/** Each measure's target in force, with a link to edit it in Metric definitions. */
function TargetsPopover({ model }: { model: ScorecardModel }) {
  return (
    <Popover
      title="Targets"
      align="end"
      width={360}
      trigger={
        <Button size="sm" variant="ghost">
          Targets
        </Button>
      }
    >
      <p className="text-[12px] leading-snug text-ink-2">
        Targets are kept in Metric definitions, so every view judges a measure against the same target. Pick a
        measure to change its target there.
      </p>
      <ul className="mt-2 max-h-[320px] overflow-y-auto border-t border-rule">
        {model.rows
          .filter((r) => r.metricId)
          .map((r) => (
            <li key={r.id} className="border-b border-rule last:border-b-0">
              <a
                href={metricHref(r.metricId as string)}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
                  e.preventDefault()
                  openMetricDefinition(r.metricId as string)
                }}
                className="flex items-baseline gap-3 px-1 py-1.5 text-[12px] hover:bg-hover"
              >
                <span className="min-w-0 flex-1">
                  <span className="text-ink">{r.kpi.label}</span>
                  <span className="text-muted"> · {r.practice}</span>
                </span>
                <span className={cx('shrink-0', r.target ? 'text-ink-2' : 'text-muted')}>{r.targetText}</span>
              </a>
            </li>
          ))}
      </ul>
      <div className="mt-2 border-t border-rule pt-2">
        <button
          type="button"
          onClick={() => openMetricDefinitions()}
          className="text-[12px] font-medium text-link underline-offset-2 hover:underline"
        >
          Open Metric definitions
        </button>
      </div>
    </Popover>
  )
}

function ScoreFigure({ model, updating }: { model: ScorecardModel; updating: boolean }) {
  const ctx = useAnalytics()
  const table = scorecardTable(model)
  const status = definitionOf(ctx.metrics, M.status)
  const watch = definitionOf(ctx.metrics, M.watch)
  const counted = model.counts
  const notes = [
    `${plural(counted.measures, 'measure')} from ${plural(model.practices.length, 'practice')}`,
    counted.noTarget ? `${counted.noTarget} without a target` : '',
    `as of ${formatDate(ctx.asOf)}`,
    'click a value to see the records',
  ].filter(Boolean)
  return (
    <Figure
      id="scorecard-people"
      title="People scorecard"
      subtitle={standingLine(counted)}
      data={table.rows}
      columns={table.columns}
      uses={model.uses.length ? model.uses : undefined}
      metric={M.status}
      definitions={[status, watch].filter((d): d is NonNullable<typeof d> => d != null)}
      note={notes.join(' · ')}
      span={12}
      image={false}
      tableToggle={false}
      actions={<TargetsPopover model={model} />}
      empty={model.practices.length ? null : 'No practice has measures to show yet.'}
      className={cx(LEAD, updating && 'opacity-60 transition-opacity')}
    >
      <div aria-busy={updating || undefined}>
        <ScoreTable practices={model.practices} caption="People scorecard" />
      </div>
    </Figure>
  )
}

/** "Open in Recruiting" for each finding; the scorecard's own finding carries its tag only. */
function sources(list: readonly SourcedFinding[]): (f: Finding) => FindingSource | null {
  const byId = new Map(list.map((s) => [s.finding.id, s]))
  return (f) => {
    const s = byId.get(f.id)
    if (!s) return null
    const to = s.opens
    return to
      ? { label: s.practice, openLabel: `Open in ${s.practice}`, open: () => goTo(to.view, to.tab) }
      : { label: s.practice }
  }
}

function Waiting({ title, wide }: { title: string; wide: boolean }) {
  return (
    <section
      aria-label={title}
      aria-busy
      className={cx(spanClass(12), wide ? LEAD : SIDE, 'self-start rounded-sheet bg-sheet')}
    >
      <header className="border-b border-rule px-4 pt-3.5 pb-3">
        <h2 className="cut-head text-[15px] leading-snug font-semibold">{title}</h2>
      </header>
      <p className="px-4 py-4 text-[13px] text-muted" role="status">
        {LOADING}
      </p>
    </section>
  )
}

export function ScorecardPage() {
  const { model, updating } = useScorecard()
  if (!model)
    return (
      <Grid>
        <Waiting title="People scorecard" wide />
        <Waiting title="Top findings across Census" wide={false} />
      </Grid>
    )
  const listed = [...model.findings.top, ...model.findings.hidden]
  return (
    <Grid>
      <ScoreFigure model={model} updating={updating} />
      <Readout
        id="scorecard-findings"
        title="Top findings across Census"
        findings={listed.map((s) => s.finding)}
        sourceOf={sources(listed)}
        emptyText="No critical or watch findings in any practice."
        span={12}
        className={cx(SIDE, 'xl:sticky xl:top-4', updating && 'opacity-60 transition-opacity')}
      />
    </Grid>
  )
}
