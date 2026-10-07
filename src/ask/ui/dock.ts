/**
 * Where the Ask panel sits and how big it is (docs/ASK-ACTIONS.md, part 1), as pure functions so
 * all of it is tested:
 *
 *  - Wide screens (768px and up): docked on the right, 360 to 640px wide (420 by default,
 *    remembered in this browser), resized by dragging its left edge or with the arrow keys on it.
 *    Collapsed, it is a slim rail. The main area gives up the panel's (or the rail's) width.
 *  - Phones: a bottom sheet at three heights: a peek bar (the last answer's first line and the
 *    question box), half the screen and full. The page keeps the room under the peek bar or the
 *    half sheet, so it scrolls clear of it.
 *
 * Open or collapsed is remembered for the browser session; closed is the default.
 */

/** Windows this wide or wider dock the panel; narrower ones get the bottom sheet. */
export const DOCK_MIN_VIEWPORT = 768
export const PANEL_MIN = 360
export const PANEL_MAX = 640
export const PANEL_DEFAULT = 420
/** The collapsed panel: a rail with the Ask icon. */
export const RAIL_WIDTH = 44
/** The main area never gets narrower than this beside the panel. */
export const MAIN_MIN = 400
/** One arrow key press on the resize handle; with Shift, four. */
export const RESIZE_STEP = 16

/** Where the panel is kept: open or collapsed for the session, its width on this device. */
export const PANEL_STATE_KEY = 'census:ask-panel'
export const PANEL_WIDTH_KEY = 'census:ask-width'

export type PanelState = 'closed' | 'open' | 'collapsed'
export type SheetHeight = 'peek' | 'half' | 'full'

export interface Viewport {
  width: number
  height: number
  /**
   * The page's width without its scrollbar, where the docked panel's right edge is; the window's
   * width when not given. The panel's width and the main area's minimum are measured on it.
   */
  page?: number
}

export type DockLayout =
  | { kind: 'none'; right: 0; bottom: 0 }
  | { kind: 'dock'; width: number; right: number; bottom: 0 }
  | { kind: 'rail'; width: number; right: number; bottom: 0 }
  | { kind: 'sheet'; height: SheetHeight; px: number; right: 0; bottom: number }

export const isWide = (viewport: Pick<Viewport, 'width'>): boolean => viewport.width >= DOCK_MIN_VIEWPORT

/** The widest the panel may be in this window: 640, or less so the main area keeps 400px. */
export function maxPanelWidth(viewportWidth: number): number {
  return Math.max(PANEL_MIN, Math.min(PANEL_MAX, viewportWidth - MAIN_MIN))
}

/** The panel's width in this window: the preferred width, kept within 360 and the maximum. */
export function panelWidth(preferred: number, viewportWidth: number): number {
  const want = Number.isFinite(preferred) ? preferred : PANEL_DEFAULT
  return Math.round(Math.min(maxPanelWidth(viewportWidth), Math.max(PANEL_MIN, want)))
}

/** The sheet's height in px for a viewport: the peek bar as measured, half the screen, or full. */
export function sheetPx(height: SheetHeight, viewportHeight: number, peekPx: number): number {
  if (height === 'peek') return Math.round(peekPx)
  if (height === 'half') return Math.round(viewportHeight * 0.5)
  return Math.round(viewportHeight)
}

/**
 * The layout for a state. `tall` is the phone sheet at full height (open, phones only). The page
 * keeps the half sheet's room under it at full height too, so it does not jump while the sheet
 * covers it.
 */
export function dockLayout(
  state: PanelState,
  viewport: Viewport,
  prefs: { width: number; tall: boolean },
  peekPx: number,
): DockLayout {
  if (state === 'closed') return { kind: 'none', right: 0, bottom: 0 }
  if (isWide(viewport)) {
    if (state === 'collapsed') return { kind: 'rail', width: RAIL_WIDTH, right: RAIL_WIDTH, bottom: 0 }
    const width = panelWidth(prefs.width, viewport.page ?? viewport.width)
    return { kind: 'dock', width, right: width, bottom: 0 }
  }
  const height: SheetHeight = state === 'collapsed' ? 'peek' : prefs.tall ? 'full' : 'half'
  const px = sheetPx(height, viewport.height, peekPx)
  const bottom = height === 'full' ? sheetPx('half', viewport.height, peekPx) : px
  return { kind: 'sheet', height, px, right: 0, bottom }
}

/** Dragging the left edge: the width for the pointer at `x` (the edge follows the pointer). */
export function widthAt(x: number, viewportWidth: number): number {
  return panelWidth(viewportWidth - x, viewportWidth)
}

/**
 * The resize handle's keys (a vertical separator on the panel's left edge): Left widens, Right
 * narrows (Shift for bigger steps), Home goes to the narrowest, End to the widest. Null for any
 * other key.
 */
export function widthByKey(
  e: { key: string; shiftKey?: boolean },
  width: number,
  viewportWidth: number,
): number | null {
  const step = RESIZE_STEP * (e.shiftKey ? 4 : 1)
  switch (e.key) {
    case 'ArrowLeft':
      return panelWidth(width + step, viewportWidth)
    case 'ArrowRight':
      return panelWidth(width - step, viewportWidth)
    case 'Home':
      return PANEL_MIN
    case 'End':
      return maxPanelWidth(viewportWidth)
    default:
      return null
  }
}

/**
 * Dragging the phone sheet's handle: the height its top edge is nearest to when let go. A quick
 * flick (`velocity` in px per ms, positive downwards) moves one step that way instead.
 */
export function heightAt(
  top: number,
  viewportHeight: number,
  peekPx: number,
  velocity = 0,
  from: SheetHeight = 'half',
): SheetHeight {
  const order: SheetHeight[] = ['peek', 'half', 'full']
  if (Math.abs(velocity) > 0.6) {
    const i = order.indexOf(from) + (velocity > 0 ? -1 : 1)
    return order[Math.max(0, Math.min(order.length - 1, i))] as SheetHeight
  }
  const shown = viewportHeight - top
  let best: SheetHeight = 'half'
  let gap = Number.POSITIVE_INFINITY
  for (const h of order) {
    const d = Math.abs(sheetPx(h, viewportHeight, peekPx) - shown)
    if (d < gap) {
      gap = d
      best = h
    }
  }
  return best
}

/** The next height up or down from a button press (the handle's Expand and Shrink). */
export function stepHeight(h: SheetHeight, dir: 1 | -1): SheetHeight {
  const order: SheetHeight[] = ['peek', 'half', 'full']
  return order[Math.max(0, Math.min(order.length - 1, order.indexOf(h) + dir))] as SheetHeight
}

/* ───────────── what is remembered ───────────── */

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** Open or collapsed, as kept for the session; closed when nothing is kept. Never throws. */
export function readPanelState(store: Store | null): PanelState {
  try {
    const v = store?.getItem(PANEL_STATE_KEY)
    return v === 'open' || v === 'collapsed' ? v : 'closed'
  } catch {
    return 'closed'
  }
}

export function savePanelState(state: PanelState, store: Store | null): void {
  try {
    if (state === 'closed') store?.removeItem(PANEL_STATE_KEY)
    else store?.setItem(PANEL_STATE_KEY, state)
  } catch {
    /* not kept: the panel opens closed next time */
  }
}

/** The width chosen by dragging, as kept on this device; the default when none is. */
export function readPanelWidth(store: Store | null): number {
  try {
    const n = Number(store?.getItem(PANEL_WIDTH_KEY))
    return Number.isFinite(n) && n >= PANEL_MIN && n <= PANEL_MAX ? Math.round(n) : PANEL_DEFAULT
  } catch {
    return PANEL_DEFAULT
  }
}

export function savePanelWidth(width: number, store: Store | null): void {
  try {
    const w = Math.round(Math.min(PANEL_MAX, Math.max(PANEL_MIN, width)))
    if (w === PANEL_DEFAULT) store?.removeItem(PANEL_WIDTH_KEY)
    else store?.setItem(PANEL_WIDTH_KEY, String(w))
  } catch {
    /* not kept: the default width next time */
  }
}

/* ───────────── the peek bar ───────────── */

/**
 * The peek bar's line: what Census is doing while an answer comes, else the answer's first line
 * (a heading or the first sentence of its first paragraph), else nothing.
 */
export function peekLine(status: string | null, answer: string): string | null {
  if (status) return status
  const first = answer
    .split('\n')
    .map((l) => l.trim())
    .find(Boolean)
  if (!first) return null
  const sentence = /^(.+?[.!?])(\s|$)/.exec(first)?.[1] ?? first
  return sentence.replace(/^[#>*\-\s]+/, '').trim() || null
}
