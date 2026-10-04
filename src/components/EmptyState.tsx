import type { ReactNode } from 'react'
import { type Span, spanClass } from '@/lib/spans'
import { IconFile } from './icons'
import { cx } from './ui'

/**
 * A sheet that explains why there is nothing to show and what to do about it, e.g. "No HR cases
 * in this period" with a link to the Data room. Left-aligned like everything else on the desk.
 */
export function EmptyState({
  title,
  body,
  action,
  icon,
  span = 12,
  className,
}: {
  title: string
  body?: ReactNode
  /** Usually one Button. */
  action?: ReactNode
  icon?: ReactNode
  span?: Span
  className?: string
}) {
  return (
    <div className={cx(spanClass(span), 'flex gap-3 rounded-sheet bg-sheet px-5 py-6', className)}>
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-control bg-sheet-2 text-muted">
        {icon ?? <IconFile />}
      </span>
      <div className="min-w-0">
        <h3 className="cut-head text-[16px] leading-snug font-semibold">{title}</h3>
        {body && <div className="mt-1 max-w-[62ch] text-[13px] text-ink-2">{body}</div>}
        {action && <div className="mt-3 flex flex-wrap gap-2">{action}</div>}
      </div>
    </div>
  )
}
