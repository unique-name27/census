/**
 * The row of headline numbers at the top of a view: one sheet, tiles separated by hairlines (not
 * cards). Each tile carries its tier, comparison, a trend and a definition; a tile with `tab`
 * opens that tab. Every number on a tile can open the records behind it: the value (`drill`),
 * the change (`deltaDrill`, the comparison's records) and the note (`noteDrill`, its subset).
 * A number below the data standard shows "—" with the reason and a link to its dataset. The
 * strip also registers as a "Key figures" table (numbers, units and trend points) so view
 * exports include it.
 */
import { openDatasetQuality } from '@/app/datasetFocus'
import { Sparkline } from '@/charts/Sparkline'
import { useAnalytics } from '@/data/context'
import { datasetDef } from '@/data/schema'
import { Drill } from '@/drill/Drill'
import { DASH } from '@/lib/format'
import { kpiTarget } from '@/metrics/api'
import { targetText } from '@/metrics/overrides'
import type { MetricTarget } from '@/metrics/types'
import { DefinitionChangedMark, EditDefinitionLink } from '@/views/data/metrics/ui/EditDefinition'
import { QualityLensLine } from '@/views/data/quality-overview/LensLine'
import { useCurrentView } from './currentView'
import { IconArrowDown, IconArrowUp, IconChevronRight, IconInfo, IconLock } from './icons'
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

function Delta({ kpi }: { kpi: Kpi }) {
  const text = kpiDeltaText(kpi)
  if (!text) return null
  const dir = deltaDirection(kpi.delta)
  const Arrow = dir === 'up' ? IconArrowUp : dir === 'down' ? IconArrowDown : null
  return (
    // The comparison window is always stated in full: on a narrow tile it wraps under the change
    // instead of being cut off.
    <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 text-[12px] leading-tight">
      <span
        className={cx('inline-flex shrink-0 items-center gap-0.5 font-medium', TONE_TEXT[deltaTone(kpi)])}
      >
        {Arrow && <Arrow className="size-3" strokeWidth={2} />}
        {kpi.deltaDrill ? (
          <Drill
            spec={kpi.deltaDrill}
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

/** Met or missed against the metric's target, with the target in words: "Met · target at most 8.0%". */
function TargetLine({
  metricId,
  target,
  status,
}: {
  metricId: string
  target: MetricTarget
  status: 'met' | 'missed'
}) {
  const { metrics } = useAnalytics()
  const def = metrics.def(metricId)
  const words = def ? targetText(def, target).toLowerCase() : ''
  return (
    <div className="mt-1 flex min-w-0 items-center gap-1 text-[12px] leading-tight text-muted">
      <StatusPill
        quiet
        severity={status === 'met' ? 'good' : 'warning'}
        label={status === 'met' ? 'Met' : 'Missed'}
      />
      <span className="truncate">target {words}</span>
    </div>
  )
}

/** In place of a number the data standard hides: why, and where to raise it. */
function GateNote({ gate }: { gate: TierGate }) {
  const key = gate.limiting.dataset
  return (
    <div className="mt-1 text-[12px] leading-snug text-muted">
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
            className="relative z-10 rounded-[2px] font-medium whitespace-nowrap text-link underline-offset-2 hover:underline"
          >
            Open {datasetDef(key).label}
          </button>
        </>
      )}
    </div>
  )
}

function Tile({ kpi, gate }: { kpi: Kpi; gate: TierGate | null }) {
  const view = useCurrentView()
  const { metrics } = useAnalytics()
  // A tab of this view, or with `link` a tab of another view (Hires vs plan opens Onboarding).
  const target = tileTarget(kpi, view)
  const hidden = !!gate && !gate.shown
  // The dictionary entry behind the tile: its wording fills a missing definition, and the
  // popover links to it ("Edit definition").
  const metric = kpi.metricId && metrics.def(kpi.metricId) ? kpi.metricId : null
  const definition = kpi.definition ?? (metric ? metrics.def(metric)?.definition : undefined)
  // Marked when the number is calculated differently from the defaults, by its own metric or by a
  // setting it depends on (the population setting, the anonymity minimum, a quality rule).
  const changed = !!metric && metrics.changesBehind(metric).length > 0
  // The metric's target, judged on the value in force (only when the tile shows the metric's unit).
  const goal = hidden || kpi.suppressed ? null : kpiTarget(metrics, metric, kpi.value, kpi.format)
  return (
    <div
      className={cx(
        'group/tile relative flex min-w-0 flex-col px-4 pt-3 pb-3.5 shadow-[-1px_0_0_var(--rule),0_-1px_0_var(--rule)]',
        // Phones show two tiles a row; a lone last tile takes the whole row, so no cell sits empty.
        'max-sm:odd:last:col-span-2',
        target && 'hover:bg-hover',
      )}
    >
      <div className="flex min-h-5 items-start gap-1">
        {target ? (
          <button
            type="button"
            onClick={() => goTo(target.view, target.tab)}
            aria-label={`${kpi.label}. Open ${target.label}`}
            className="min-w-0 text-left text-[12px] leading-snug break-words text-ink-2 after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-focus"
          >
            {kpi.label}
          </button>
        ) : (
          <span className="min-w-0 text-[12px] leading-snug break-words text-ink-2">{kpi.label}</span>
        )}
        {(definition || metric) && (
          <Popover
            title={kpi.label}
            width={300}
            trigger={
              <button
                type="button"
                aria-label={`About ${kpi.label}`}
                className="relative z-10 -my-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-control text-muted hover:bg-hover hover:text-ink"
              >
                <IconInfo className="size-3.5" />
              </button>
            }
          >
            {definition && <p className="text-ink-2">{definition}</p>}
            {metric && (
              <div className={definition ? 'mt-2 border-t border-rule pt-2' : undefined}>
                <EditDefinitionLink metricId={metric} />
              </div>
            )}
          </Popover>
        )}
        {target && (
          <IconChevronRight className="mt-px ml-auto size-3.5 shrink-0 text-muted opacity-0 transition-opacity group-hover/tile:opacity-100" />
        )}
      </div>
      <div className="mt-1.5 flex items-end justify-between gap-3">
        <span className="cut-head text-[26px] leading-none font-semibold tracking-[-0.01em] whitespace-nowrap sm:text-[30px]">
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
          <span className="mb-0.5 shrink-0">
            <Sparkline values={kpi.spark} width={64} height={24} label={`${kpi.label}, recent trend`} />
          </span>
        )}
      </div>
      {!hidden && <Delta kpi={kpi} />}
      {goal && metric && <TargetLine metricId={metric} target={goal.target} status={goal.status} />}
      {hidden ? (
        <GateNote gate={gate} />
      ) : kpi.suppressed ? (
        <div className="mt-1 flex items-center gap-1 text-[12px] leading-snug text-muted">
          <IconLock className="size-3 shrink-0" />
          {SUPPRESSED_NOTE}
        </div>
      ) : (
        kpi.note && (
          <div className="mt-1 text-[12px] leading-snug text-muted">
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
        )
      )}
      {(gate || changed) && (
        // Its own row at the foot of the tile, so the label keeps the full width and badges line up.
        <div className="mt-auto flex flex-wrap items-center gap-x-1 pt-2">
          {gate && (
            <TierBadge
              compact
              tier={gate.tier}
              explain={gate.explain}
              dataset={gate.limiting.dataset}
              className="-ml-1"
            />
          )}
          {changed && metric && (
            <DefinitionChangedMark metricId={metric} className={gate ? undefined : '-ml-1'} />
          )}
          {/* The quality lens (view header switch): field limiting it, rows used and left out. */}
          <QualityLensLine
            uses={kpi.uses}
            metricId={metric ?? undefined}
            label={kpi.label}
            variant="tile"
            showChanged={false}
            className="basis-full"
          />
        </div>
      )}
    </div>
  )
}

export function KpiStrip({
  kpis,
  id = 'key-figures',
  title = 'Key figures',
  className,
}: {
  kpis: Kpi[]
  /** Registry id; give a second strip on the same tab its own id. */
  id?: string
  title?: string
  className?: string
}) {
  const gateOf = useGateFn()
  const { metrics } = useAnalytics()
  const gates = kpis.map((k) => gateOf(k.uses))
  const tiered = gates.some(Boolean)
  // Each tile's target as the tile shows it, so the export carries it too.
  const targets = kpis.map((k) => {
    const t = kpiTarget(metrics, k.metricId, k.value, k.format)
    const def = k.metricId ? metrics.def(k.metricId) : undefined
    return t && def
      ? `${t.status === 'met' ? 'Met' : 'Missed'}: target ${targetText(def, t.target).toLowerCase()}`
      : null
  })
  useTableFigure({
    id,
    title,
    columns: kpiColumns(kpis, { tiered, gates, targets }),
    rows: kpiRows(kpis, tiered ? gates : undefined, targets),
  })
  if (!kpis.length) return null
  return (
    <section
      aria-label={title}
      className={cx(
        'col-span-full grid min-w-0 grid-cols-[repeat(auto-fit,minmax(150px,1fr))] overflow-hidden rounded-sheet bg-sheet max-sm:grid-cols-2',
        className,
      )}
    >
      {kpis.map((k, i) => (
        <Tile key={k.id} kpi={k} gate={gates[i]} />
      ))}
    </section>
  )
}
