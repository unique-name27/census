/**
 * The chart tooltip: one quiet floating sheet that follows the pointer inside the chart.
 * Values lead (strong ink), labels follow (secondary ink); series rows are keyed by a short
 * line or swatch in the series color. Content is set with textContent only, because category
 * and series names come from uploaded files.
 */
import type { LegendShape } from './legend'

export interface TipRow {
  value: string
  label?: string
  /** Resolved series color for the key; omit for unkeyed rows. */
  color?: string
  shape?: LegendShape
  /** Emphasize this row (e.g. the hovered series among several). */
  strong?: boolean
}

export interface TipContent {
  title?: string
  rows: TipRow[]
  /** Muted footnote, e.g. "Hidden to protect anonymity (n < 5)". */
  note?: string
}

export const TIP_CLASS =
  'pointer-events-none absolute top-0 left-0 z-20 w-max max-w-72 rounded-control bg-sheet px-2.5 py-2 text-[12px] leading-snug text-ink shadow-(--shadow-pop)'

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  e.className = className
  if (text !== undefined) e.textContent = text
  return e
}

function keyEl(color: string, shape: LegendShape = 'line'): HTMLElement {
  const k = el('span', 'inline-block shrink-0')
  k.setAttribute('aria-hidden', 'true')
  k.style.background = color
  if (shape === 'line') Object.assign(k.style, { width: '12px', height: '2px', borderRadius: '1px' })
  else if (shape === 'dot') Object.assign(k.style, { width: '8px', height: '8px', borderRadius: '50%' })
  else Object.assign(k.style, { width: '9px', height: '9px', borderRadius: '2px' })
  return k
}

export function renderTip(host: HTMLElement, content: TipContent): void {
  const nodes: HTMLElement[] = []
  if (content.title) nodes.push(el('div', 'mb-1 text-[11px] font-medium text-ink-2', content.title))
  const keyed = content.rows.some((r) => r.color)
  if (content.rows.length) {
    const grid = el('div', 'grid items-center gap-x-2 gap-y-0.5')
    grid.style.gridTemplateColumns = keyed ? 'auto auto 1fr' : 'auto 1fr'
    for (const r of content.rows) {
      if (keyed) {
        const cell = el('span', 'flex items-center')
        if (r.color) cell.append(keyEl(r.color, r.shape))
        grid.append(cell)
      }
      grid.append(
        el('span', `tnum text-ink ${r.strong === false ? 'font-medium' : 'font-semibold'}`, r.value),
      )
      grid.append(el('span', r.strong ? 'font-medium text-ink' : 'text-ink-2', r.label ?? ''))
    }
    nodes.push(grid)
  }
  if (content.note) nodes.push(el('div', 'mt-1 max-w-60 text-[11px] text-muted', content.note))
  host.replaceChildren(...nodes)
}

/** Place the tip near (x, y) in the container's coordinates, flipping to stay inside it horizontally. */
export function placeTip(host: HTMLElement, container: HTMLElement, x: number, y: number): void {
  const gap = 14
  const w = host.offsetWidth
  const h = host.offsetHeight
  const cw = container.clientWidth
  let left = x + gap
  if (left + w > cw) left = x - gap - w
  left = Math.max(0, Math.min(left, Math.max(0, cw - w)))
  let top = y + gap
  if (top + h > container.clientHeight + 24) top = y - gap - h
  host.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`
}
