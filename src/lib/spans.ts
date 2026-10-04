/**
 * Grid placement shared by everything laid on the desk grid (Figure, Readout, EmptyState and any
 * view panel inside a Section or Grid), so a figure and a panel with the same span always line up.
 *
 * - Phones (under 768px): one column. `col-span-full` spans every explicit track, so a child never
 *   creates implicit columns, whether its grid has 1 track (Grid on phones) or 12.
 * - Tablets (md): spans 3-6 take half the row; wider spans take the full row.
 * - Desktop (lg): the exact span of 12.
 *
 * Class names are static strings so Tailwind sees every one.
 */
export type Span = 3 | 4 | 5 | 6 | 7 | 8 | 9 | 12

const SPAN_CLASS: Record<Span, string> = {
  3: 'col-span-full md:col-span-6 lg:col-span-3',
  4: 'col-span-full md:col-span-6 lg:col-span-4',
  5: 'col-span-full md:col-span-6 lg:col-span-5',
  6: 'col-span-full md:col-span-6',
  7: 'col-span-full lg:col-span-7',
  8: 'col-span-full lg:col-span-8',
  9: 'col-span-full lg:col-span-9',
  12: 'col-span-full',
}

/** Grid placement for a child of Grid/Section: full width on phones, `span` of 12 on desktop. */
export function spanClass(span: Span = 12): string {
  return `min-w-0 ${SPAN_CLASS[span] ?? SPAN_CLASS[12]}`
}

/**
 * The desk grid: one column on phones (every direct child forced to the full row, so a stray
 * `col-span-12` can't add implicit tracks), 12 columns with 16px gaps from 768px.
 */
export const GRID_CLASS = 'grid grid-cols-1 gap-4 md:grid-cols-12 max-md:*:col-span-full'
