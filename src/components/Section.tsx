/**
 * Page structure for view bodies: a titled Section whose children sit in the 12-column grid,
 * and the bare Grid. Children size themselves with `spanClass` (Figure does this via `span`).
 */
import type { ReactNode } from 'react'
import { GRID_CLASS, type Span, spanClass } from '@/lib/spans'
import { cx } from './ui'

/** Grid placement (one mapping for Figure, Readout, EmptyState and view panels): see `@/lib/spans`. */
export { type Span, spanClass }

export function Grid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx(GRID_CLASS, className)}>{children}</div>
}

export function Section({
  title,
  dek,
  actions,
  id,
  children,
  className,
}: {
  title: string
  /** One or two sentences saying what this section answers. */
  dek?: ReactNode
  /** Controls at the right of the heading (e.g. a Segmented toggle that drives several figures). */
  actions?: ReactNode
  /** Anchor id, for in-page links. */
  id?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section id={id} aria-label={title} className={cx('mt-10 scroll-mt-4 first:mt-0', className)}>
      <header className="mb-3 flex flex-wrap items-end gap-x-6 gap-y-2">
        <div className="min-w-0 flex-1">
          <h2 className="cut-head text-[20px] leading-tight font-semibold">{title}</h2>
          {dek && <p className="mt-1 max-w-[70ch] text-[13px] text-ink-2">{dek}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </header>
      <Grid>{children}</Grid>
    </section>
  )
}
