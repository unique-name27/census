/**
 * What a page shows while its numbers are being worked out (docs/DESIGN-REFRESH.md 2.11): the
 * sheets it will show, at their final size and with their titles, and one quiet status line in the
 * lead sheet. No spinner, no shimmer, no skeleton blocks, so nothing flashes and the page does not
 * jump when the content lands.
 *
 * One sheet:
 *
 *   <Pending title="People scorecard" span={8} height={420}
 *            message="Reading each practice's measures and findings." />
 *
 * Several sheets (a page frame), each a grid item of the surrounding Grid; the message sits in the
 * first one:
 *
 *   <Grid>
 *     <Pending message="Collecting open items from every view."
 *              frames={[{ title: 'Where items wait', span: 8, height: 280 }, { title: 'Owners', span: 4, height: 280 }]} />
 *   </Grid>
 *
 * The status line is `role="status"`, so a screen reader hears it once; the frames are
 * `aria-hidden` apart from it.
 */
import { type Span, spanClass } from '@/lib/spans'
import { cx } from './ui'

export interface PendingFrame {
  /** The title the sheet will carry, so the reader knows what is coming. */
  title?: string
  /** Grid columns at desktop width (default 12). */
  span?: Span
  /** Body height in px the content will take (default 220, the standard chart height). */
  height?: number
  /** Extra placement classes for this sheet (e.g. a wider breakpoint's column span). */
  className?: string
}

/** The line a page shows while it prepares, when the caller gives none. */
export const PENDING_MESSAGE = 'Preparing the data.'

export function Pending({
  title,
  span = 12,
  height = 220,
  message = PENDING_MESSAGE,
  frames,
  className,
}: PendingFrame & {
  /** One short sentence, said once. */
  message?: string
  /** Several sheets in place of the single one; the message goes in the first. */
  frames?: PendingFrame[]
  className?: string
}) {
  const list: PendingFrame[] = frames?.length ? frames : [{ title, span, height }]
  return (
    <>
      {list.map((f, i) => (
        <div
          key={`${f.title ?? ''}-${i}`}
          data-pending=""
          className={cx(
            spanClass(f.span ?? 12),
            'flex flex-col self-start rounded-sheet bg-sheet',
            f.className,
            className,
          )}
        >
          {f.title && (
            <div aria-hidden="true" className="px-4 pt-4 lg:px-5">
              <div className="cut-head text-title font-semibold text-ink-2">{f.title}</div>
            </div>
          )}
          <div className="px-4 pt-3 pb-5 lg:px-5" style={{ minHeight: f.height ?? 220 }}>
            {i === 0 && (
              <p role="status" className="text-small text-muted">
                {message}
              </p>
            )}
          </div>
        </div>
      ))}
    </>
  )
}
