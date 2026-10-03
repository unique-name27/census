/**
 * Page structure for view bodies: a titled Section whose children sit in the 12-column grid,
 * and the bare Grid. Children size themselves with `spanClass` (Figure does this via `span`).
 */
import type { ReactNode } from 'react'
import { cx } from './ui'

export type Span = 3 | 4 | 5 | 6 | 7 | 8 | 9 | 12

/**
 * Static class names so Tailwind sees every span. One column under 768px; on tablets quarters
 * pair up and halves stay halves, everything else takes the full row so no row is left with a hole.
 */
const SPAN_CLASS: Record<Span, string> = {
  3: 'md:col-span-6 lg:col-span-3',
  4: 'md:col-span-12 lg:col-span-4',
  5: 'md:col-span-12 lg:col-span-5',
  6: 'md:col-span-6',
  7: 'md:col-span-12 lg:col-span-7',
  8: 'md:col-span-12 lg:col-span-8',
  9: 'md:col-span-12 lg:col-span-9',
  12: 'md:col-span-12',
}

/** Grid placement for a child of Grid/Section: full width on phones, `span` of 12 on desktop. */
export const spanClass = (span: Span = 12): string => cx('col-span-1 min-w-0', SPAN_CLASS[span])

export function Grid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('grid grid-cols-1 gap-4 md:grid-cols-12', className)}>{children}</div>
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
