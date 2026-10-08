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
  align,
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
  /**
   * 'start' when the figures in a row have very different chart heights: each sheet keeps its
   * own height instead of stretching to the tallest, so a short chart never sits on a mostly
   * empty sheet.
   */
  align?: 'start'
  children: ReactNode
  className?: string
}) {
  return (
    // A section whose figures all render nothing (hidden in this mode) goes with them, heading and all.
    <section
      id={id}
      aria-label={title}
      className={cx('mt-10 scroll-mt-4 first:mt-0 has-[>div:empty]:hidden', className)}
    >
      <header className="mb-3 flex flex-wrap items-end gap-x-6 gap-y-2">
        {/* The heading keeps at least 288px: in a narrower area the actions wrap under it instead
            of squeezing the title and dek into a thin column. */}
        <div className="min-w-0 grow basis-72">
          <h2 className="cut-head text-section font-semibold">{title}</h2>
          {dek && <p className="mt-1 max-w-[70ch] text-small text-ink-2">{dek}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </header>
      <Grid className={align === 'start' ? 'items-start' : undefined}>{children}</Grid>
    </section>
  )
}
