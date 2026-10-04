/**
 * The row of headline numbers at the top of a view: one sheet, tiles separated by hairlines (not
 * cards). Each tile carries its comparison, a trend and a definition; a tile with `tab` opens that
 * tab, and a tile with `drill` lets the reader click the value to see the records behind it. The
 * strip also registers as a "Key figures" table so view exports include it.
 */
import { Sparkline } from '@/charts/Sparkline'
import { Drill } from '@/drill/Drill'
import { tabLabel, useCurrentView } from './currentView'
import { IconArrowDown, IconArrowUp, IconChevronRight, IconInfo, IconLock } from './icons'
import {
  type DeltaTone,
  deltaDirection,
  deltaTone,
  KPI_COLUMNS,
  kpiDeltaText,
  kpiRows,
  kpiValueText,
  SUPPRESSED_NOTE,
} from './kpiModel'
import { goTo } from './navigation'
import type { Kpi } from './types'
import { cx, Popover } from './ui'
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
    <div className="mt-2 flex min-w-0 items-center gap-1 text-[12px] leading-tight">
      <span
        className={cx('inline-flex shrink-0 items-center gap-0.5 font-medium', TONE_TEXT[deltaTone(kpi)])}
      >
        {Arrow && <Arrow className="size-3" strokeWidth={2} />}
        {text}
      </span>
      {kpi.deltaLabel && <span className="truncate text-muted">{kpi.deltaLabel}</span>}
    </div>
  )
}

function Tile({ kpi }: { kpi: Kpi }) {
  const view = useCurrentView()
  const target = kpi.tab && view ? kpi.tab : null
  return (
    <div
      className={cx(
        'group/tile relative flex min-w-0 flex-col px-4 pt-3 pb-3.5 shadow-[-1px_0_0_var(--rule),0_-1px_0_var(--rule)]',
        target && 'hover:bg-hover',
      )}
    >
      <div className="flex min-h-5 items-start gap-1">
        {target && view ? (
          <button
            type="button"
            onClick={() => goTo(view.key, target)}
            aria-label={`${kpi.label}. Open ${tabLabel(view, target)}`}
            className="min-w-0 text-left text-[12px] leading-snug text-ink-2 after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-focus"
          >
            {kpi.label}
          </button>
        ) : (
          <span className="min-w-0 text-[12px] leading-snug text-ink-2">{kpi.label}</span>
        )}
        {kpi.definition && (
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
            <p className="text-ink-2">{kpi.definition}</p>
          </Popover>
        )}
        {target && (
          <IconChevronRight className="ml-auto size-3.5 shrink-0 text-muted opacity-0 transition-opacity group-hover/tile:opacity-100" />
        )}
      </div>
      <div className="mt-1.5 flex items-end justify-between gap-3">
        <span className="cut-head text-[26px] leading-none font-semibold tracking-[-0.01em] whitespace-nowrap sm:text-[30px]">
          {kpi.drill && !kpi.suppressed && kpi.value != null ? (
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
        {kpi.spark && !kpi.suppressed && kpi.spark.length > 1 && (
          <span className="mb-0.5 shrink-0">
            <Sparkline values={kpi.spark} width={64} height={24} label={`${kpi.label}, recent trend`} />
          </span>
        )}
      </div>
      <Delta kpi={kpi} />
      {kpi.suppressed ? (
        <div className="mt-1 flex items-center gap-1 text-[12px] leading-snug text-muted">
          <IconLock className="size-3 shrink-0" />
          {SUPPRESSED_NOTE}
        </div>
      ) : (
        kpi.note && <div className="mt-1 text-[12px] leading-snug text-muted">{kpi.note}</div>
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
  useTableFigure({ id, title, columns: KPI_COLUMNS, rows: kpiRows(kpis) })
  if (!kpis.length) return null
  return (
    <section
      aria-label={title}
      className={cx(
        'col-span-full grid min-w-0 grid-cols-[repeat(auto-fit,minmax(150px,1fr))] overflow-hidden rounded-sheet bg-sheet',
        className,
      )}
    >
      {kpis.map((k) => (
        <Tile key={k.id} kpi={k} />
      ))}
    </section>
  )
}
