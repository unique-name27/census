/**
 * The People scorecard, HR mode's home (docs/VIEWS.md, Scorecard; chart-led per
 * docs/DESIGN-REFRESH.md 4.1 and docs/ROLES.md 2.1): targets met and the key figures, every
 * measure against its target beside the top findings across Census, how the workforce is moving,
 * where the pressure is, then the full People scorecard table as the record. Everything comes from
 * the views' own summaries and models, computed in idle time after the first paint; until then the
 * sheets show at their final size with one quiet line.
 */
import { Figure } from '@/charts'
import { Grid, goTo, Pending, type PendingFrame, Readout, Section } from '@/components'
import type { FindingSource } from '@/components/Readout'
import type { Finding } from '@/components/types'
import { Button, cx, Popover } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { WelcomeCard } from '@/help/ui/WelcomeCard'
import { formatDate } from '@/lib/dates'
import { plural } from '@/lib/format'
import { definitionOf } from '@/metrics/api'
import { metricHref, openMetricDefinition, openMetricDefinitions } from '@/views/data/metrics/open'
import type { ScorecardModel, SourcedFinding } from '../engine/model'
import { scorecardTable, standingLine } from '../engine/report'
import { M } from '../metrics'
import { KeyFigures, Measures, Standing } from './Band'
import { ScoreTable } from './ScoreTable'
import { MovingSection, PressureSection } from './Sections'
import { useScorecard } from './useScorecard'
import { useScorecardItems } from './useScorecardItems'

const LOADING = "Reading each practice's measures and findings."

/** The findings sit beside the measures from 1024px (8 and 4 columns), under them below that. */
const SIDE = 'lg:col-span-4'

/** Each measure's target in force, with a link to edit it in Metric definitions. */
function TargetsPopover({ model }: { model: ScorecardModel }) {
  return (
    <Popover
      title="Targets"
      align="end"
      width={360}
      trigger={
        <Button size="sm" variant="ghost" data-tour="scorecard-targets">
          Targets
        </Button>
      }
    >
      <p className="text-meta leading-snug text-ink-2">
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
                className="flex items-baseline gap-3 px-1 py-1.5 text-meta hover:bg-hover"
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
          className="text-meta font-medium text-link underline-offset-2 hover:underline"
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
      className={cx(updating && 'opacity-60 transition-opacity')}
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

/**
 * The home page's first sheets while the Scorecard is worked out, at their final size: the hero
 * and key figures (260px), the measures (about 28px a measure plus the header and note) and the
 * findings readout (five compact findings).
 */
const HOME_FRAMES: PendingFrame[] = [
  { title: 'Targets met', span: 4, height: 223 },
  { title: 'Key figures', span: 8, height: 223 },
  { title: 'Measures against target', span: 8, height: 973 },
  { title: 'Top findings across Census', span: 4, height: 827 },
]

export function ScorecardPage() {
  const { model, updating } = useScorecard()
  const items = useScorecardItems()
  if (!model)
    return (
      <Grid>
        <WelcomeCard />
        <Pending
          message={LOADING}
          // Body heights of the final sheets at 1440 (each sheet adds its ~37px title), so
          // nothing on the first screen moves when the numbers land.
          frames={HOME_FRAMES}
        />
      </Grid>
    )
  const listed = [...model.findings.top, ...model.findings.hidden]
  const fade = updating && 'opacity-60 transition-opacity'
  return (
    <>
      <Grid>
        <WelcomeCard />
        <Standing model={model} className={cx(fade)} />
        <KeyFigures items={items} />
        <Measures model={model} className={cx(fade)} />
        <Readout
          id="scorecard-findings"
          title="Top findings across Census"
          findings={listed.map((s) => s.finding)}
          sourceOf={sources(listed)}
          emptyText="No critical or watch findings in any practice."
          span={12}
          limit={5}
          variant="compact"
          className={cx(SIDE, 'lg:sticky lg:top-4', fade)}
        />
      </Grid>
      <MovingSection />
      <PressureSection items={items} />
      <Section
        title="People scorecard"
        dek="Every measure with its value, target, status, change, trend and tier: the record behind the charts above, and what the monthly report exports."
      >
        <ScoreFigure model={model} updating={updating} />
      </Section>
    </>
  )
}
