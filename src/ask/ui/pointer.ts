/**
 * Pointing at a figure (docs/ASK-ACTIONS.md, part 3, `show_figure`): Census scrolls the figure into
 * the part of the page Ask leaves visible (above the phone sheet), switches it to its table or its
 * chart when asked, and rings it for a few seconds. With reduced motion the scroll jumps and the
 * ring appears and goes without fading.
 */
import { figureElement, onScreenEvent } from '@/ask/engine'
import { FIGURE_VIEW_EVENT } from '@/charts/figureView'

/** How long the ring stays, in ms. */
export const RING_MS = 3200
/** The gap kept above a figure scrolled to the top, in px. */
const GAP = 16

/**
 * Where to scroll so a figure shows in the visible part of the page (`visible` px tall from the
 * top of the window): centred when it fits, else its top `GAP` px below the window's top.
 */
export function pointScrollTop(
  figure: { top: number; height: number },
  scrollY: number,
  visible: number,
): number {
  const room = Math.max(0, visible)
  const top =
    figure.height + 2 * GAP <= room
      ? scrollY + figure.top - (room - figure.height) / 2
      : scrollY + figure.top - GAP
  return Math.max(0, Math.round(top))
}

/** Reduced motion: the system setting, or Settings > Display > Motion. */
export function reducedMotion(): boolean {
  if (typeof document === 'undefined') return true
  if (document.documentElement.dataset.motion === 'reduce') return true
  return (
    typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

const rings = new WeakMap<HTMLElement, number>()

function ring(el: HTMLElement): void {
  const reduce = reducedMotion()
  window.clearTimeout(rings.get(el))
  el.style.outline = '2px solid var(--focus)'
  el.style.outlineOffset = '3px'
  el.style.transition = reduce ? '' : 'outline-color 400ms ease-out'
  el.dataset.askPointed = ''
  rings.set(
    el,
    window.setTimeout(() => {
      el.style.outlineColor = 'transparent'
      rings.set(
        el,
        window.setTimeout(
          () => {
            el.style.removeProperty('outline')
            el.style.removeProperty('outline-offset')
            el.style.removeProperty('outline-color')
            el.style.removeProperty('transition')
            delete el.dataset.askPointed
          },
          reduce ? 0 : 420,
        ),
      )
    }, RING_MS),
  )
}

/** Scroll to a figure on the page, show its chart or table, and ring it. False when it is not there. */
export function pointAt(id: string, table: boolean, bottomReserve = 0): boolean {
  const el = figureElement(id)
  if (!el) return false
  el.dispatchEvent(new CustomEvent(FIGURE_VIEW_EVENT, { detail: { table } }))
  const r = el.getBoundingClientRect()
  const top = pointScrollTop(
    { top: r.top, height: r.height },
    window.scrollY,
    window.innerHeight - bottomReserve,
  )
  window.scrollTo({ top, behavior: reducedMotion() ? 'auto' : 'smooth' })
  ring(el)
  return true
}

/**
 * Listen for Ask's screen events for as long as the app runs. `reserve` says how much of the
 * window's foot the phone sheet covers. Returns the stop.
 */
export function connectPointer(reserve: () => number): () => void {
  return onScreenEvent((e) => {
    if (e.type !== 'show_figure') return
    // The tab may still be laying out its figures: try again briefly before giving up.
    let tries = 0
    const go = () => {
      if (pointAt(e.id, e.table, reserve()) || ++tries > 10) return
      window.setTimeout(go, 100)
    }
    go()
  })
}
