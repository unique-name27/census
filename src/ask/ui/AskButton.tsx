/**
 * The masthead Ask button (beside Help): it opens the Ask panel, and collapses it when it is open.
 * Alt+A (Option+A on a Mac) moves focus between the page and the question box: from the page it
 * opens Ask (or expands it) and goes to the question box; from inside the panel it goes back to
 * where focus was on the page. Nothing else in Census, and no browser, binds Alt+A; with a
 * modifier it also reaches the page while a screen reader is in browse mode. An answer keeps
 * coming while the panel is collapsed or closed: the button then says it is answering, and that
 * an answer is ready once it is, until the panel opens again.
 */
import { useEffect } from 'react'
import { Button } from '@/components/ui'
import { useCensus } from '@/data/store'
import { useDrillStore } from '@/drill/store'
import { useHelp } from '@/help/store'
import { IconAsk, IconWorking } from './icons'
import { isAskShortcut } from './model'
import { focusComposer, focusInPanel, focusPage, PANEL_ID } from './panelFocus'
import { askTrigger, openAsk, toggleAsk, useAsk } from './store'

/** True when the key press belongs to a text field, a select or an editable region. */
function typing(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false
  return (
    !!t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]') ||
    t.isContentEditable
  )
}

function useAskKey() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !isAskShortcut(e)) return
      // Not over a tour, Help, Settings or the records panel.
      const help = useHelp.getState()
      if (help.tour || help.open || useCensus.getState().settingsOpen.open) return
      if (useDrillStore.getState().stack.length) return
      // From the open panel (the question box included): back to the page.
      if (focusInPanel() && useAsk.getState().open) {
        e.preventDefault()
        focusPage()
        return
      }
      // A text field on the page keeps the key (Option+A types a character on a Mac).
      if (typing(e.target) && !focusInPanel()) return
      e.preventDefault()
      if (useAsk.getState().open) focusComposer()
      else openAsk()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

/** The button's icon: a turning ring while an answer comes behind the closed panel, a dot when one is ready. */
function AskIcon({ state }: { state: 'answering' | 'ready' | null }) {
  if (state === 'answering')
    return <IconWorking className="motion-safe:animate-spin [:root[data-motion=reduce]_&]:animate-none" />
  return (
    <span className="relative inline-flex">
      <IconAsk />
      {state === 'ready' && (
        <span
          aria-hidden="true"
          className="absolute -top-0.5 -right-0.5 size-[7px] rounded-full bg-ink ring-2 ring-band"
        />
      )}
    </span>
  )
}

export function AskButton() {
  const open = useAsk((s) => s.open)
  const shown = useAsk((s) => s.panel !== 'closed')
  const busy = useAsk((s) => s.busy)
  const unseen = useAsk((s) => s.unseen)
  const failed = useAsk((s) => s.turns.at(-1)?.status === 'error')
  useAskKey()
  const state = open ? null : busy ? 'answering' : unseen ? 'ready' : null
  const label =
    state === 'answering'
      ? 'Ask Census, answering'
      : state === 'ready'
        ? failed
          ? 'Ask Census, the answer did not finish'
          : 'Ask Census, answer ready'
        : 'Ask Census'
  return (
    <Button
      ref={askTrigger}
      data-tour="masthead-ask"
      variant={open ? 'secondary' : 'ghost'}
      icon={<AskIcon state={state} />}
      aria-expanded={open}
      aria-controls={shown ? PANEL_ID : undefined}
      aria-label={label}
      aria-keyshortcuts="Alt+A"
      title={`${label} (Alt+A)`}
      onClick={() => toggleAsk()}
    >
      <span className="hidden sm:inline">Ask</span>
    </Button>
  )
}
