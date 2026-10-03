/**
 * Chart legend: swatches that mirror the mark (rect for bars and areas, a short line for lines,
 * a dot for points) with ink labels, or a continuous ramp with its end labels. Identity sits in
 * the swatch; the text never wears the series color.
 */
import { cx } from '@/components/ui'
import type { LegendShape, LegendSpec } from './core/legend'

function Swatch({ color, shape = 'rect' }: { color: string; shape?: LegendShape }) {
  const size =
    shape === 'line'
      ? 'h-[2px] w-3.5 rounded-[1px]'
      : shape === 'dot'
        ? 'size-2 rounded-full'
        : 'size-2.5 rounded-[2px]'
  return (
    <span aria-hidden="true" className={cx('inline-block shrink-0', size)} style={{ background: color }} />
  )
}

export function Legend({ spec, className }: { spec: LegendSpec; className?: string }) {
  if (spec.kind === 'ramp') {
    return (
      <div className={cx('flex items-center gap-2 text-[12px] text-ink-2', className)}>
        {spec.title && <span>{spec.title}</span>}
        <div className="w-32">
          <div
            aria-hidden="true"
            className="h-2 rounded-[2px]"
            style={{ background: `linear-gradient(to right, ${spec.colors.join(', ')})` }}
          />
          <div className="tnum mt-0.5 flex justify-between text-[11px] text-muted">
            {spec.labels.map((l, i) => (
              <span key={i}>{l}</span>
            ))}
          </div>
        </div>
      </div>
    )
  }
  return (
    <ul className={cx('flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-2', className)}>
      {spec.items.map((it, i) => (
        <li key={`${it.label}-${i}`} className="inline-flex items-center gap-1.5">
          <Swatch color={it.color} shape={it.shape} />
          {it.label}
        </li>
      ))}
    </ul>
  )
}
