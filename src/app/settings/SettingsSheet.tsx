/**
 * The Settings sheet: slides in from the right, like the drill panel, with one home for every
 * preference (docs/DATA-TIERS.md, Settings). `openSettings(section)` opens it at a section.
 * Escape or Close closes it, and focus returns to what opened it (the masthead button by default).
 */
import { Dialog as BDialog } from '@base-ui/react/dialog'
import { createRef, useEffect, useRef } from 'react'
import { IconClose } from '@/components/icons'
import { SECTION_LABEL, SETTINGS_SECTIONS, type SettingsSection } from '@/data/settings'
import { useCensus } from '@/data/store'
import { CompSection } from './CompSection'
import { DataSection } from './DataSection'
import { DeviceSection } from './DeviceSection'
import { DisplaySection } from './DisplaySection'
import { PrivacySection } from './PrivacySection'
import { ToolsSection } from './ToolsSection'
import { sectionId } from './ui'

/** The masthead Settings button: focus comes back here when nothing else opened the sheet. */
export const settingsTrigger = createRef<HTMLButtonElement>()

/** The element that had focus when the sheet was asked to open (captured before React re-renders). */
let opener: HTMLElement | null = null
if (typeof document !== 'undefined')
  useCensus.subscribe((s, prev) => {
    if (s.settingsOpen.open && s.settingsOpen.nonce !== prev.settingsOpen.nonce && !prev.settingsOpen.open)
      opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
  })

function returnFocus(): HTMLElement | null {
  const back = opener?.isConnected && opener !== document.body ? opener : settingsTrigger.current
  opener = null
  return back
}

function SectionNav({ onGo }: { onGo: (s: SettingsSection) => void }) {
  return (
    <nav aria-label="Settings sections" className="border-b border-rule px-5 pb-2.5">
      <ul className="-mx-1.5 flex flex-wrap gap-x-0.5 gap-y-1">
        {SETTINGS_SECTIONS.map((s) => (
          <li key={s}>
            <a
              href={`#${sectionId(s)}`}
              onClick={(e) => {
                e.preventDefault()
                onGo(s)
              }}
              className="inline-flex h-7 items-center rounded-control px-1.5 text-[12px] font-medium text-ink-2 hover:bg-hover hover:text-ink"
            >
              {SECTION_LABEL[s]}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/** Scroll the sheet to a section and put focus on its heading. */
function goToSection(s: SettingsSection) {
  const el = document.getElementById(sectionId(s))
  if (!el) return
  el.scrollIntoView({ block: 'start' })
  el.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true })
}

export function SettingsSheet() {
  const req = useCensus((s) => s.settingsOpen)
  const close = useCensus((s) => s.closeSettings)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  // Every open request lands on its section (or the top), even when the sheet is already open.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `nonce` changes on every request, so the effect runs again
  useEffect(() => {
    if (!req.open) return
    const frame = requestAnimationFrame(() => {
      if (req.section) goToSection(req.section)
      else bodyRef.current?.scrollTo({ top: 0 })
    })
    return () => cancelAnimationFrame(frame)
  }, [req.open, req.nonce, req.section])

  return (
    <BDialog.Root open={req.open} onOpenChange={(o) => !o && close()}>
      <BDialog.Portal>
        <BDialog.Backdrop className="fixed inset-0 z-40 bg-overlay transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <BDialog.Popup
          initialFocus={titleRef}
          finalFocus={returnFocus}
          className="fixed top-0 right-0 bottom-0 z-50 flex w-[min(560px,100vw)] flex-col bg-page pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)] text-ink shadow-(--shadow-pop) outline-none transition-transform duration-200 ease-out data-[ending-style]:translate-x-6 data-[ending-style]:opacity-0 data-[starting-style]:translate-x-6 data-[starting-style]:opacity-0"
        >
          <div className="flex items-center gap-2 px-5 pt-3.5 pb-2">
            <BDialog.Title
              ref={titleRef}
              tabIndex={-1}
              className="cut-head flex-1 rounded-[2px] text-[22px] leading-tight font-semibold outline-none focus-visible:outline-2 focus-visible:outline-focus"
            >
              Settings
            </BDialog.Title>
            <BDialog.Close
              aria-label="Close settings"
              className="-mr-1.5 inline-flex size-8 items-center justify-center rounded-control text-ink-2 hover:bg-hover hover:text-ink"
            >
              <IconClose />
            </BDialog.Close>
          </div>
          <BDialog.Description className="sr-only">
            Display, data, privacy, compensation cycle (now in Metric definitions), related tools and this
            device. Changes apply at once and are saved in this browser, except pay amounts, which last for
            this session.
          </BDialog.Description>
          <SectionNav onGo={goToSection} />
          <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto">
            <div className="m-3 rounded-sheet bg-sheet">
              <DisplaySection />
              <DataSection />
              <PrivacySection />
              <CompSection />
              <ToolsSection />
              <DeviceSection />
            </div>
          </div>
        </BDialog.Popup>
      </BDialog.Portal>
    </BDialog.Root>
  )
}
