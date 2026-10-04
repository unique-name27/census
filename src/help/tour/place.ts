/**
 * Where the tour popover goes: beside its target on the preferred side when it fits, else on the
 * first side that fits, else in the lower right corner of the screen. On narrow screens it docks,
 * full width, to the top or bottom edge away from the target. Without a target it is centered.
 * Only the narrow-screen dock changes the popover's width, so placing never feeds back into its
 * size on a wide screen. Pure.
 */
import type { Placement } from '../types'

export interface Box {
  top: number
  left: number
  width: number
  height: number
}

export interface Size {
  width: number
  height: number
}

export type PlacedSide =
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'center'
  | 'corner'
  | 'dock-top'
  | 'dock-bottom'

export interface Placed {
  top: number
  left: number
  side: PlacedSide
}

export interface PlaceOptions {
  /** Space between the target and the popover. */
  gap?: number
  /** Space kept from the screen edges. */
  margin?: number
  /** Below this screen width the popover docks to an edge. */
  dockBelow?: number
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi))

const SIDES: readonly Exclude<Placement, 'auto'>[] = ['bottom', 'top', 'right', 'left']

export function placePopover(
  target: Box | null,
  pop: Size,
  view: Size,
  prefer: Placement = 'auto',
  opts: PlaceOptions = {},
): Placed {
  const gap = opts.gap ?? 16
  const m = opts.margin ?? 16
  const dockBelow = opts.dockBelow ?? 640
  const maxTop = view.height - pop.height - m
  const maxLeft = view.width - pop.width - m
  if (!target)
    return {
      top: Math.max(m, Math.round((view.height - pop.height) / 2)),
      left: Math.max(m, Math.round((view.width - pop.width) / 2)),
      side: 'center',
    }
  if (view.width < dockBelow) {
    // Dock on the half of the screen the target is not in.
    const below = target.top + target.height / 2 > view.height / 2
    return below
      ? { top: m, left: m, side: 'dock-top' }
      : { top: Math.max(m, maxTop), left: m, side: 'dock-bottom' }
  }
  const order = prefer === 'auto' ? SIDES : [prefer, ...SIDES.filter((s) => s !== prefer)]
  const midX = target.left + target.width / 2 - pop.width / 2
  const midY = target.top + target.height / 2 - pop.height / 2
  for (const side of order) {
    if (side === 'bottom') {
      const top = target.top + target.height + gap
      if (top + pop.height <= view.height - m && top >= m) return { top, left: clamp(midX, m, maxLeft), side }
    } else if (side === 'top') {
      const top = target.top - gap - pop.height
      if (top >= m && top + pop.height <= view.height - m) return { top, left: clamp(midX, m, maxLeft), side }
    } else if (side === 'right') {
      const left = target.left + target.width + gap
      if (left + pop.width <= view.width - m) return { top: clamp(midY, m, maxTop), left, side }
    } else {
      const left = target.left - gap - pop.width
      if (left >= m) return { top: clamp(midY, m, maxTop), left, side }
    }
  }
  // The target fills the screen: sit in its lower corner, inside the screen, at the same width.
  return { top: Math.max(m, maxTop), left: Math.max(m, maxLeft), side: 'corner' }
}

/** True when two boxes differ by more than half a pixel anywhere. */
export function moved(a: Box | null, b: Box | null): boolean {
  if (!a || !b) return a !== b
  return (
    Math.abs(a.top - b.top) > 0.5 ||
    Math.abs(a.left - b.left) > 0.5 ||
    Math.abs(a.width - b.width) > 0.5 ||
    Math.abs(a.height - b.height) > 0.5
  )
}

/** Next step for a key: 1 for next, -1 for back, 'end' to stop, or null for other keys. */
export function tourKey(key: string): 1 | -1 | 'end' | null {
  if (key === 'ArrowRight') return 1
  if (key === 'ArrowLeft') return -1
  if (key === 'Escape' || key === 'Esc') return 'end'
  return null
}
