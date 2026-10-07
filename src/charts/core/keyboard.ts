/**
 * The chart keyboard layer (docs/DESIGN-REFRESH.md 2.7, audit A12), as pure geometry: every kit
 * chart is one tab stop; arrow keys move a focus index through the chart's data in reading order
 * and show the same tooltip at the datum; Enter or Space drills; Escape clears.
 *
 * A chart supplies its data as key points, in reading order, in the plot's own pixel coordinates
 * (from its scales). Points may carry a `group` (a series, a heatmap row, a dot-strip row):
 *
 * - One group (or none): every arrow steps through the list. Left and Up go back, Right and Down
 *   go forward. Home and End jump to the first and last point.
 * - Several groups: Left and Right step within the group (along time or categories); Up and Down
 *   move to the previous or next group, landing on its point with the same `part` (the same
 *   series in the next row of a stacked bar chart), else the one nearest across. Home and End
 *   jump to the ends of the current group. Charts list their emphasized group first, so the
 *   first key press lands on the series the figure is about.
 *
 * `stepKey` never wraps: at an end the index stays put. It returns null for keys it does not own,
 * so the caller lets them through (Tab moves on).
 *
 *   const pts: KeyPoint<Row>[] = rows.map((r) => ({ datum: r, x: sx(r.value) / 2, y: sy(r.key) }))
 *   stepKey(pts, -1, 'ArrowDown') // 0: the first point
 *   stepKey(pts, 0, 'ArrowDown')  // 1
 */

/** One datum a chart can focus: its center in plot pixels, and the box of its mark if known. */
export interface KeyPoint<P> {
  /** What the tooltip and `onSelect` receive (the same datum the pointer would hover). */
  datum: P
  /** The part of the datum (a series in a stacked bar or a line), as the chart's `pick` names it. */
  part?: string | null
  /** Center of the mark in plot px (from the top-left of the plot's SVG). */
  x: number
  y: number
  /** Size of the mark in px, for the focus outline; a small ring when absent. */
  w?: number
  h?: number
  /** Series, row or other grouping for Up and Down; points of one group are contiguous. */
  group?: string
}

/** Keys the chart layer handles; anything else passes through. */
export type ChartKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' | 'Home' | 'End'

const STEP_KEYS = new Set<string>(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'])

export function isStepKey(key: string): key is ChartKey {
  return STEP_KEYS.has(key)
}

/** Distinct groups in order of first appearance; one entry (undefined) for an ungrouped chart. */
function groupsOf<P>(points: readonly KeyPoint<P>[]): (string | undefined)[] {
  const seen: (string | undefined)[] = []
  for (const p of points) if (!seen.includes(p.group)) seen.push(p.group)
  return seen
}

/**
 * The index focus moves to from `index` (-1 when nothing is focused yet) on `key`, or null when
 * the key is not a chart key or there are no points. The first key press focuses the first point.
 */
export function stepKey<P>(points: readonly KeyPoint<P>[], index: number, key: string): number | null {
  if (!isStepKey(key) || points.length === 0) return null
  const n = points.length
  const groups = groupsOf(points)
  if (index < 0 || index >= n) {
    if (key !== 'End') return 0
    // End before anything is focused: the last point of the first group (the series that leads).
    let last = 0
    for (let i = 0; i < n; i++) if (points[i].group === points[0].group) last = i
    return last
  }
  if (groups.length <= 1) {
    if (key === 'Home') return 0
    if (key === 'End') return n - 1
    const back = key === 'ArrowLeft' || key === 'ArrowUp'
    return Math.min(n - 1, Math.max(0, index + (back ? -1 : 1)))
  }
  const here = points[index]
  const members = (g: string | undefined) => points.flatMap((p, i) => (p.group === g ? [i] : []))
  const own = members(here.group)
  const at = own.indexOf(index)
  switch (key) {
    case 'Home':
      return own[0]
    case 'End':
      return own[own.length - 1]
    case 'ArrowLeft':
      return own[Math.max(0, at - 1)]
    case 'ArrowRight':
      return own[Math.min(own.length - 1, at + 1)]
    default: {
      const gi = groups.indexOf(here.group) + (key === 'ArrowUp' ? -1 : 1)
      if (gi < 0 || gi >= groups.length) return index
      const cand = members(groups[gi])
      // Rows of segments (a stacked bar per row): keep to the same part when the next row has it.
      if (here.part != null) {
        const same = cand.find((i) => points[i].part === here.part)
        if (same !== undefined) return same
      }
      // Otherwise land on the point of that group nearest across (by x; the first of equals).
      let best = cand[0]
      let bestD = Number.POSITIVE_INFINITY
      for (const i of cand) {
        const d = Math.abs(points[i].x - here.x)
        if (d < bestD - 0.5) {
          best = i
          bestD = d
        }
      }
      return best
    }
  }
}

/**
 * Points sorted into reading order for charts whose marks are not already in it: by row (y,
 * within `rowTolerance` px), then left to right. Charts that know their order (a ranked list, a
 * time series) pass their points as they are.
 */
export function readingOrder<P>(points: readonly KeyPoint<P>[], rowTolerance = 4): KeyPoint<P>[] {
  return [...points].sort((a, b) => (Math.abs(a.y - b.y) > rowTolerance ? a.y - b.y : a.x - b.x))
}

/** The focus outline around a point, in plot px: the mark's box padded by 3px, or a 14px ring. */
export function focusBox<P>(p: KeyPoint<P>): { x: number; y: number; w: number; h: number; round: boolean } {
  if (p.w != null && p.h != null && p.w > 0 && p.h > 0) {
    const w = Math.max(p.w, 6) + 6
    const h = Math.max(p.h, 6) + 6
    return { x: p.x - w / 2, y: p.y - h / 2, w, h, round: false }
  }
  return { x: p.x - 7, y: p.y - 7, w: 14, h: 14, round: true }
}
