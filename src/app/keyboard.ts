/**
 * Keyboard and scrolling helpers for the shell's tab lists. Pure where possible.
 */

/** Next tab index for an arrow/Home/End key in a horizontal tab list (wrapping), or null for other keys. */
export function rovingIndex(key: string, current: number, count: number): number | null {
  if (count <= 0) return null
  const last = count - 1
  switch (key) {
    case 'ArrowRight':
      return current >= last ? 0 : current + 1
    case 'ArrowLeft':
      return current <= 0 ? last : current - 1
    case 'Home':
      return 0
    case 'End':
      return last
    default:
      return null
  }
}

/**
 * Horizontal scroll offset change that brings [itemLeft, itemRight] inside [viewLeft, viewRight]
 * with `pad` px to spare; 0 when it is already visible.
 */
export function scrollDelta(
  itemLeft: number,
  itemRight: number,
  viewLeft: number,
  viewRight: number,
  pad = 16,
): number {
  if (itemLeft < viewLeft) return itemLeft - viewLeft - pad
  if (itemRight > viewRight) return itemRight - viewRight + pad
  return 0
}

/**
 * Scroll a horizontal strip (never the page) so the child is visible, `pad` px clear of its edges
 * (the folder tabs pass their side gutter, where the edge buttons sit).
 */
export function revealInStrip(strip: HTMLElement | null, item: HTMLElement | null, pad = 16): void {
  if (!strip || !item) return
  const s = strip.getBoundingClientRect()
  const r = item.getBoundingClientRect()
  const dx = scrollDelta(r.left, r.right, s.left, s.right, pad)
  if (dx) strip.scrollLeft += dx
}

/** Whether a horizontal strip has content past its left and right edges (1px of slack for rounding). */
export function stripEdges(
  scrollLeft: number,
  clientWidth: number,
  scrollWidth: number,
): { left: boolean; right: boolean } {
  return { left: scrollLeft > 1, right: scrollLeft + clientWidth < scrollWidth - 1 }
}
