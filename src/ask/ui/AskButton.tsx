/**
 * The masthead Ask button (beside Help), which also mounts the Ask sheet and opens it with Alt+A
 * (Option+A on a Mac) from anywhere outside a text field. Nothing else in Census, and no browser,
 * binds Alt+A; with a modifier it also reaches the page while a screen reader is in browse mode.
 * An answer keeps coming when the sheet is closed: the button then says it is answering, and
 * that an answer is ready once it is, until the sheet opens again.
 */
import { useEffect } from 'react'
import { Button } from '@/components/ui'
import { useCensus } from '@/data/store'
import { useDrillStore } from '@/drill/store'
import { useHelp } from '@/help/store'
import { AskSheet } from './AskSheet'
import { IconAsk, IconWorking } from './icons'
import { isAskShortcut } from './model'
import { askTrigger, openAsk, useAsk } from './store'

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
      if (e.defaultPrevented || !isAskShortcut(e) || typing(e.target)) return
      // Not over a tour, Help, Settings or the records panel.
      const help = useHelp.getState()
      if (help.tour || help.open || useCensus.getState().settingsOpen.open) return
      if (useDrillStore.getState().stack.length) return
      e.preventDefault()
      if (useAsk.getState().open) document.getElementById('ask-composer')?.focus()
      else openAsk()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

/** The button's icon: a turning ring while an answer comes behind the closed sheet, a dot when one is ready. */
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
    <>
      <Button
        ref={askTrigger}
        data-tour="masthead-ask"
        variant={open ? 'secondary' : 'ghost'}
        icon={<AskIcon state={state} />}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        aria-keyshortcuts="Alt+A"
        title={`${label} (Alt+A)`}
        onClick={() => openAsk()}
      >
        <span className="hidden sm:inline">Ask</span>
      </Button>
      <AskSheet />
    </>
  )
}
