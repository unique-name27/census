/**
 * Chart legend: swatches that mirror the mark (rect for bars and areas, a short line for lines,
 * a dot for points, a diamond for diamond markers, a medal for tier-coded charts) with ink labels,
 * or a continuous ramp with its end labels. Identity sits in the swatch; the text never wears the series color.
 */
import { cx } from '@/components/ui'
import { type LegendShape, type LegendSpec, medalPath } from './core/legend'

function Swatch({ color, shape = 'rect' }: { color: string; shape?: LegendShape }) {
  if (shape === 'medal') {
    return (
      <svg aria-hidden="true" width="10" height="12" viewBox="0 -6 10 12" className="shrink-0">
        <path d={medalPath(0, 0)} fill={color} />
      </svg>
    )
  }
  if (shape === 'diamond') {
    return (
      <svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10" className="shrink-0">
        <path d="M5 0L10 5L5 10L0 5Z" fill={color} />
      </svg>
    )
  }
  if (shape === 'outline') {
    return (
      <span
        aria-hidden="true"
        className="inline-block size-2.5 shrink-0 rounded-mark"
        style={{ border: `1.5px solid ${color}` }}
      />
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

export function Legend({ spec, className }: { spec: LegendSpec; className?: string }) {
  if (spec.kind === 'ramp') {
    return (
      <div className={cx('flex items-center gap-2 text-meta text-ink-2', className)}>
        {spec.title && <span>{spec.title}</span>}
        <div className="w-32">
          <div
            aria-hidden="true"
            className="h-2 rounded-mark"
            style={{ background: `linear-gradient(to right, ${spec.colors.join(', ')})` }}
          />
          <div className="tnum mt-0.5 flex justify-between text-label text-muted">
            {spec.labels.map((l, i) => (
              <span key={i}>{l}</span>
            ))}
          </div>
        </div>
      </div>
    )
  }
  return (
    <ul className={cx('flex flex-wrap items-center gap-x-4 gap-y-1 text-meta text-ink-2', className)}>
      {spec.items.map((it, i) => (
        <li key={`${it.label}-${i}`} className="inline-flex items-center gap-1.5">
          <Swatch color={it.color} shape={it.shape} />
          {it.label}
        </li>
      ))}
    </ul>
  )
}
