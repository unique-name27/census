/**
 * The row of headline numbers at the top of a view: one sheet, tiles separated by hairlines (not
 * cards). Each tile carries its tier, comparison, a trend and a definition; a tile with `tab`
 * opens that tab. Every number on a tile can open the records behind it: the value (`drill`),
 * the change (`deltaDrill`, the comparison's records) and the note (`noteDrill`, its subset).
 * A number below the data standard shows "—" with the reason and a link to its dataset. The
 * strip also registers as a "Key figures" table (numbers, units and trend points) so view
 * exports include it.
 *
 * Tile anatomy (docs/DESIGN-REFRESH.md 2.5), aligned across the strip on a five-row subgrid:
 * label with the tier medal and info button on its right; value (text-page-title) with a 72 x 24
 * sparkline; change; target in full ("Missed · target at most 45 d"); one short note. While a
 * newer context is being computed the strip holds its old numbers at 60% opacity.
 */

import { useState } from 'react'
import { kpisInMode } from '@/access/numbers'
import { routeShown } from '@/access/policy'
import { openDatasetQuality } from '@/app/datasetFocus'
import { Sparkline } from '@/charts/Sparkline'
import { useAnalytics, useAnalyticsPending } from '@/data/context'
import { datasetDef } from '@/data/schema'
import { Drill } from '@/drill/Drill'
import { LearnMoreLink } from '@/help/ui/LearnMore'
import { DASH } from '@/lib/format'
import { type Span, spanClass } from '@/lib/spans'
import { kpiTarget } from '@/metrics/api'
import { targetText } from '@/metrics/overrides'
import type { MetricTarget } from '@/metrics/types'
import { DefinitionChangedMark, EditDefinitionLink } from '@/views/data/metrics/ui/EditDefinition'
import { QualityLensLine } from '@/views/data/quality-overview/LensLine'
import { useCurrentView } from './currentView'
import { IconArrowDown, IconArrowUp, IconInfo, IconLock } from './icons'
import {
  type DeltaTone,
  deltaDirection,
  deltaTone,
  kpiColumns,
  kpiDeltaText,
  kpiRows,
  kpiValueText,
  SUPPRESSED_NOTE,
  tileTarget,
} from './kpiModel'
import { goTo } from './navigation'
import { useRouteShown } from './RouteLink'
import { TierBadge } from './tier/TierBadge'
import type { TierGate } from './tier/tierModel'
import { useGateFn } from './tier/useTierGate'
import type { Kpi } from './types'
import { cx, Popover, StatusPill } from './ui'
import { useTableFigure } from './useTableFigure'

const TONE_TEXT: Record<DeltaTone, string> = {
  good: 'text-good-text',
  bad: 'text-bad-text',
  neutral: 'text-muted',
}

function Delta({ kpi, className }: { kpi: Kpi; className?: string }) {
  const { access } = useAnalytics()
  const text = kpiDeltaText(kpi)
  if (!text) return null
  // A "vs company" change opens no records where the company's records are not listed (Manager mode).
  const deltaDrill =
    kpi.deltaDrill && !(/\bcompany\b/i.test(kpi.deltaLabel ?? '') && !access.can('ui:kpi-delta-company'))
      ? kpi.deltaDrill
      : null
  const dir = deltaDirection(kpi.delta)
  const Arrow = dir === 'up' ? IconArrowUp : dir === 'down' ? IconArrowDown : null
  return (
    // The comparison window is always stated in full: on a narrow tile it wraps under the change
    // instead of being cut off.
    <div className={cx('mt-2 flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 text-meta', className)}>
      <span
        className={cx('inline-flex shrink-0 items-center gap-0.5 font-medium', TONE_TEXT[deltaTone(kpi)])}
      >
        {Arrow && <Arrow className="size-3" strokeWidth={2} />}
        {deltaDrill ? (
          <Drill
            spec={deltaDrill}
            className="relative z-10"
            label={`${kpi.label}: show the comparison records behind ${text}${kpi.deltaLabel ? ` ${kpi.deltaLabel}` : ''}`}
          >
            {text}
          </Drill>
        ) : (
          text
        )}
      </span>
      {kpi.deltaLabel && <span className="min-w-0 text-muted">{kpi.deltaLabel}</span>}
    </div>
  )
}

/**
 * How a tile is judged against its metric's target: Met or Missed (`kpiTarget`), or with a strip's
 * own `judge`, also Watch (a role home judges as the People scorecard beside it does, so a tile
 * and a measure never give one number two verdicts).
 */
export type TileJudgement = { target: MetricTarget; status: 'met' | 'watch' | 'missed' }
export type TileJudge = (
  metricId: string | null | undefined,
  value: number | null | undefined,
  format: Kpi['format'],
) => TileJudgement | null

const JUDGEMENT_WORD: Record<TileJudgement['status'], string> = {
  met: 'Met',
  watch: 'Watch',
  missed: 'Missed',
}

/** Met or missed against the metric's target, with the target in words: "Met · target at most 8.0%". */
function TargetLine({
  metricId,
  target,
  status,
  className,
}: {
  metricId: string
  target: MetricTarget
  status: TileJudgement['status']
  className?: string
}) {
  const { metrics } = useAnalytics()
  const def = metrics.def(metricId)
  const words = def ? targetText(def, target).toLowerCase() : ''
  return (
    // The target is the one number this line exists to show: it wraps, it is never cut.
    <div className={cx('mt-1 flex min-w-0 flex-wrap items-center gap-x-1 text-meta text-muted', className)}>
      <StatusPill quiet severity={status === 'met' ? 'good' : 'warning'} label={JUDGEMENT_WORD[status]} />
      <span className="min-w-0">target {words}</span>
    </div>
  )
}

/** In place of a number the data standard hides: why, and where to raise it. */
function GateNote({ gate }: { gate: TierGate }) {
  // The dataset opens in the Data room, which Manager mode does not show.
  const key = useRouteShown('data') ? gate.limiting.dataset : null
  return (
    <div className="mt-1 text-meta leading-snug text-muted">
      {gate.reason}
      {key && (
        <>
          {' '}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              openDatasetQuality(key)
            }}
            className="relative z-10 rounded-mark font-medium whitespace-nowrap text-link underline-offset-2 hover:underline"
          >
            Open {datasetDef(key).label}
          </button>
        </>
      )}
    </div>
  )
}

/**
 * Tile rows, placed explicitly on the strip's subgrid so a missing row never shifts the ones below
 * it, and every tile in a strip row puts its label, value, change, target and note on the same
 * line as its neighbours'.
 */
const ROW = {
  label: 'row-start-1',
  value: 'row-start-2',
  change: 'row-start-3',
  target: 'row-start-4',
  note: 'row-start-5',
} as const

function Tile({
  kpi,
  gate,
  judge,
  className,
}: {
  kpi: Kpi
  gate: TierGate | null
  judge?: TileJudge
  className?: string
}) {
  const view = useCurrentView()
  const { metrics, access } = useAnalytics()
  // A tab of this view, or with `link` a tab of another view (Hires vs plan opens Onboarding);
  // none when the mode hides it.
  const target = tileTarget(kpi, view, (v, t) => routeShown(access.mode, v, t))
  const hidden = !!gate && !gate.shown
  // The dictionary entry behind the tile: its wording fills a missing definition, and the
  // popover links to it ("Edit definition").
  const metric = kpi.metricId && metrics.def(kpi.metricId) ? kpi.metricId : null
  const definition = kpi.definition ?? (metric ? metrics.def(metric)?.definition : undefined)
  // Marked when the number is calculated differently from the defaults, by its own metric or by a
  // setting it depends on (the population setting, the anonymity minimum, a quality rule).
  const changed = !!metric && metrics.changesBehind(metric).length > 0
  // The metric's target, judged on the value in force (only when the tile shows the metric's unit).
  const goal =
    hidden || kpi.suppressed
      ? null
      : (judge ?? ((m, v, f) => kpiTarget(metrics, m, v, f)))(metric, kpi.value, kpi.format)
  const note = hidden ? (
    <GateNote gate={gate} />
  ) : kpi.suppressed ? (
    <div className="flex items-center gap-1 text-meta text-muted">
      <IconLock className="size-3 shrink-0" />
      {kpi.suppressedNote ?? SUPPRESSED_NOTE}
    </div>
  ) : kpi.note ? (
    <div className="text-meta text-muted">
      {kpi.noteDrill ? (
        <Drill
          spec={kpi.noteDrill}
          className="relative z-10 text-left"
          label={`${kpi.label}: show the records behind "${kpi.note}"`}
        >
          {kpi.note}
        </Drill>
      ) : (
        kpi.note
      )}
    </div>
  ) : null
  return (
    <div
      data-metric={kpi.metricId}
      className={cx(
        'group/tile @container/tile relative row-span-5 grid min-w-0 grid-rows-subgrid content-start px-4 pt-3 pb-4 shadow-[-1px_0_0_var(--rule),0_-1px_0_var(--rule)]',
        // Phones show two tiles a row; a lone last tile takes the whole row, so no cell sits empty.
        'max-sm:odd:last:col-span-2',
        target && 'hover:bg-hover',
        className,
      )}
    >
      {/* 1. Label (wraps at spaces only, never mid-word) on the left; tier medal and info on the
          right. In a narrow tile the label keeps its longest word whole and the medal and info wrap
          under it, at the right. */}
      <div
        className={cx(
          ROW.label,
          'flex min-w-0 flex-wrap items-start gap-x-1 supports-[not(grid-template-rows:subgrid)]:min-h-[2lh]',
        )}
      >
        {target ? (
          <button
            type="button"
            onClick={() => goTo(target.view, target.tab)}
            aria-label={`${kpi.label}. Open ${target.label}`}
            className="min-w-min flex-1 text-left text-meta break-normal text-ink-2 after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-focus"
          >
            {kpi.label}
          </button>
        ) : (
          <span className="min-w-min flex-1 text-meta break-normal text-ink-2">{kpi.label}</span>
        )}
        {/* Under 200px a tile always puts them on a line of their own, so the label keeps the full width. */}
        <span className="ml-auto flex shrink-0 items-start gap-1 @max-[12.5rem]/tile:basis-full @max-[12.5rem]/tile:justify-end">
          {(gate || changed) && (
            <span data-tour="kpi-tier" className="-my-0.5 flex shrink-0 items-center">
              {gate && (
                <TierBadge compact tier={gate.tier} explain={gate.explain} dataset={gate.limiting.dataset} />
              )}
              {changed && metric && <DefinitionChangedMark metricId={metric} />}
            </span>
          )}
          {(definition || kpi.formula || metric) && (
            <Popover
              title={kpi.label}
              width={300}
              trigger={
                <button
                  type="button"
                  data-tour="kpi-info"
                  aria-label={`About ${kpi.label}`}
                  className="relative z-10 -my-0.5 -mr-1 inline-flex size-5 shrink-0 items-center justify-center rounded-control text-muted hover:bg-hover hover:text-ink"
                >
                  <IconInfo className="size-3.5" />
                </button>
              }
            >
              {definition && <p className="text-ink-2">{definition}</p>}
              {kpi.formula && !hidden && !kpi.suppressed && (
                <p className={cx('text-ink-2', definition && 'mt-1.5')}>{kpi.formula}</p>
              )}
              {metric && (
                <div
                  className={cx(
                    'flex flex-wrap items-center gap-x-4 gap-y-1',
                    (definition || kpi.formula) && 'mt-2 border-t border-rule pt-2',
                  )}
                >
                  <EditDefinitionLink metricId={metric} />
                  <LearnMoreLink metricId={metric} />
                </div>
              )}
            </Popover>
          )}
        </span>
      </div>
      {/* 2. Value (28px at every width, proportional figures) with the trend at its baseline. Lines
          pack to the top of the shared row, so a neighbour whose trend wraps never pushes this
          value down; phones (two narrow tiles a row) always stack the trend under the value. */}
      <div
        className={cx(
          ROW.value,
          'mt-2 flex flex-wrap content-start items-end justify-between gap-x-3 gap-y-1 max-sm:flex-col max-sm:items-start max-sm:justify-start',
        )}
      >
        <span
          data-tour="kpi-value"
          className="cut-head text-page-title leading-none font-semibold tracking-[-0.01em] whitespace-nowrap"
        >
          {hidden ? (
            <span className="text-muted">{DASH}</span>
          ) : kpi.drill && !kpi.suppressed && kpi.value != null ? (
            <Drill
              spec={kpi.drill}
              className="relative z-10"
              label={`${kpi.label}: show the records behind ${kpiValueText(kpi)}`}
            >
              {kpiValueText(kpi)}
            </Drill>
          ) : (
            kpiValueText(kpi)
          )}
        </span>
        {!hidden && kpi.spark && !kpi.suppressed && kpi.spark.length > 1 && (
          <span className="shrink-0">
            <Sparkline values={kpi.spark} width={72} height={24} label={`${kpi.label}, recent trend`} />
          </span>
        )}
      </div>
      {/* 3. Change: arrow, signed change, comparison; wraps, never cut. */}
      {!hidden && <Delta kpi={kpi} className={ROW.change} />}
      {/* 4. Target, in full. */}
      {goal && metric && (
        <TargetLine metricId={metric} target={goal.target} status={goal.status} className={ROW.target} />
      )}
      {/* 5. One short note (formulas live in the definition), and the quality lens line. */}
      {(note || kpi.uses || metric) && (
        <div className={cx(ROW.note, 'mt-1 min-w-0 empty:hidden')}>
          {note}
          {/* The quality lens (view header switch): field limiting it, rows used and left out. */}
          <QualityLensLine
            uses={kpi.uses}
            metricId={metric ?? undefined}
            label={kpi.label}
            variant="tile"
            showChanged={false}
            className="mt-1"
          />
        </div>
      )}
    </div>
  )
}

/** Tiles a phone shows before "Show all n" (the rest stay in the export). */
const PHONE_TILES = 4

/**
 * The row of headline numbers. Tiles sit on a CSS subgrid of five rows (label, value, change,
 * target, note), so values in one strip row share a baseline however their labels wrap.
 *
 *   <KpiStrip kpis={kpis} />                 // full width
 *   <KpiStrip kpis={four} span={8} />        // beside a span-4 hero figure on a home page
 *
 * Phones show two tiles a row and, past four tiles, the first four plus "Show all n".
 */
export function KpiStrip({
  kpis: listed,
  id = 'key-figures',
  title = 'Key figures',
  span = 12,
  judge,
  className,
}: {
  kpis: Kpi[]
  /** Registry id; give a second strip on the same tab its own id. */
  id?: string
  title?: string
  /** Grid columns at desktop width (default 12), so a home page can set a hero figure beside it. */
  span?: Span
  /** How tiles are judged against their targets, when not plain Met or Missed (`TileJudge`). */
  judge?: TileJudge
  className?: string
}) {
  const gateOf = useGateFn()
  const { metrics, access } = useAnalytics()
  // Tiles whose metric the mode hides are not rendered or exported (docs/ROLES.md, 3.13).
  const kpis = kpisInMode(access, listed)
  const pending = useAnalyticsPending()
  const [all, setAll] = useState(false)
  const gates = kpis.map((k) => gateOf(k.uses))
  const tiered = gates.some(Boolean)
  // Each tile's target as the tile shows it, so the export carries it too.
  const targets = kpis.map((k) => {
    const t = judge ? judge(k.metricId, k.value, k.format) : kpiTarget(metrics, k.metricId, k.value, k.format)
    const def = k.metricId ? metrics.def(k.metricId) : undefined
    return t && def ? `${JUDGEMENT_WORD[t.status]}: target ${targetText(def, t.target).toLowerCase()}` : null
  })
  useTableFigure({
    id,
    title,
    columns: kpiColumns(kpis, { tiered, gates, targets }),
    rows: kpiRows(kpis, tiered ? gates : undefined, targets),
    // For the Developer page's contract checks only (never exported).
    items: {
      kind: 'kpi',
      list: kpis.map((k) => ({ id: k.id, metricId: k.metricId, uses: !!k.uses?.length, drill: !!k.drill })),
    },
  })
  if (!kpis.length) return null
  const folded = !all && kpis.length > PHONE_TILES
  return (
    <section
      aria-label={title}
      data-tour="kpi-strip"
      aria-busy={pending || undefined}
      className={cx(
        span === 12 ? 'col-span-full min-w-0' : spanClass(span),
        'grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] content-start overflow-hidden rounded-sheet bg-sheet max-sm:grid-cols-2',
        pending && 'opacity-60 transition-opacity',
        className,
      )}
    >
      {kpis.map((k, i) => (
        <Tile
          key={k.id}
          kpi={k}
          gate={gates[i]}
          judge={judge}
          className={folded && i >= PHONE_TILES ? 'max-md:hidden' : undefined}
        />
      ))}
      {kpis.length > PHONE_TILES && (
        <div className="col-span-full px-4 py-2 shadow-[0_-1px_0_var(--rule)] md:hidden">
          <button
            type="button"
            aria-expanded={all}
            onClick={() => setAll(!all)}
            className="rounded-mark text-meta font-medium text-link underline-offset-2 hover:underline"
          >
            {all ? 'Show fewer' : `Show all ${kpis.length}`}
          </button>
        </div>
      )}
    </section>
  )
}
