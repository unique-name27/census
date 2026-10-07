/**
 * A swatch legend whose counts open the records behind them ("No step booked 220"). Same look as
 * the chart kit's Legend; the count is a drill button when the item has records.
 */
import type { LegendShape } from '@/charts'
import { cx } from '@/components'
import { Drill, type DrillSource } from '@/drill'
import { fmt } from '@/lib/format'

export interface DrillLegendItem {
  label: string
  /** Shown after the label; omitted for items without a count. */
  count?: number
  color: string
  shape?: LegendShape
  drill?: DrillSource
}

function Swatch({ color, shape = 'rect' }: { color: string; shape?: LegendShape }) {
  if (shape === 'diamond') {
    return (
      <svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10" className="shrink-0">
        <path d="M5 0L10 5L5 10L0 5Z" fill={color} />
      </svg>
    )
  }
  const size =
    shape === 'line'
      ? 'h-[2px] w-3.5 rounded-mark'
      : shape === 'dot'
        ? 'size-2 rounded-full'
        : 'size-2.5 rounded-mark'
  return (
    <span aria-hidden="true" className={cx('inline-block shrink-0', size)} style={{ background: color }} />
  )
}

export function DrillLegend({ items, className }: { items: readonly DrillLegendItem[]; className?: string }) {
  return (
    <ul className={cx('flex flex-wrap items-center gap-x-4 gap-y-1 text-meta text-ink-2', className)}>
      {items.map((it) => (
        <li key={it.label} className="inline-flex items-center gap-1.5">
          <Swatch color={it.color} shape={it.shape} />
          {it.label}
          {it.count != null &&
            (it.drill && it.count > 0 ? (
              <Drill spec={it.drill} label={`${it.label}: show the ${fmt(it.count, 'int')} records`}>
                {fmt(it.count, 'int')}
              </Drill>
            ) : (
              <span>{fmt(it.count, 'int')}</span>
            ))}
        </li>
      ))}
    </ul>
  )
}
