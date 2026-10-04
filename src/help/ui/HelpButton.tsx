/**
 * The masthead Help button (question-mark icon and the word), which also mounts the Help sheet
 * and the tour layer, and opens Help with the ? key from anywhere outside a text field.
 */
import { useEffect } from 'react'
import { Button } from '@/components/ui'
import { openHelp, useHelp } from '../store'
import { HelpSheet } from './HelpSheet'
import { IconHelp } from './IconHelp'
import { helpTrigger } from './refs'
import { TourLayer } from './TourLayer'

/** True when the key press belongs to a text field, a select or an editable region. */
function typing(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false
  return (
    !!t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]') ||
    t.isContentEditable
  )
}

function useHelpKey() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '?' || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return
      if (typing(e.target)) return
      const { open, tour } = useHelp.getState()
      if (open || tour) return
      e.preventDefault()
      openHelp()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

export function HelpButton() {
  const open = useHelp((s) => s.open)
  useHelpKey()
  return (
    <>
      <Button
        ref={helpTrigger}
        data-tour="masthead-help"
        variant={open ? 'secondary' : 'ghost'}
        icon={<IconHelp />}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Help"
        aria-keyshortcuts="?"
        onClick={() => openHelp()}
      >
        <span className="hidden sm:inline">Help</span>
      </Button>
      <HelpSheet />
      <TourLayer />
    </>
  )
}
