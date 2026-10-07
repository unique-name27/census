/**
 * Focus between the page and the Ask panel (docs/ASK-ACTIONS.md, part 1): the panel is not a
 * modal, so focus stays wherever the person puts it, and Alt+A moves it between the page and the
 * question box. This remembers the last place on the page that had focus, to go back to.
 */

export const PANEL_ID = 'ask-panel'

/* ───────────── focus between the page and the panel ───────────── */

/** The last thing on the page (outside the panel) that had focus, for Alt+A to go back to. */
let lastOnPage: HTMLElement | null = null

if (typeof document !== 'undefined')
  document.addEventListener('focusin', (e) => {
    const t = e.target
    if (!(t instanceof HTMLElement)) return
    if (t.closest(`#${PANEL_ID}`)) return
    if (t.closest('.band, #census-main, footer')) lastOnPage = t
  })

export const panelEl = (): HTMLElement | null =>
  typeof document === 'undefined' ? null : document.getElementById(PANEL_ID)

/** Focus is inside the Ask panel. */
export const focusInPanel = (): boolean => {
  const a = typeof document === 'undefined' ? null : document.activeElement
  return !!a && !!panelEl()?.contains(a)
}

/** Back to the page: where focus was before, or the main region. */
export function focusPage(): void {
  const back = lastOnPage?.isConnected && lastOnPage.getClientRects().length ? lastOnPage : null
  ;(back ?? document.getElementById('census-main'))?.focus({ preventScroll: !!back })
}

/** Into the question box (or "Open Settings" without a key). */
export function focusComposer(): void {
  panelEl()?.querySelector<HTMLElement>('[data-ask-start]')?.focus({ preventScroll: true })
}
