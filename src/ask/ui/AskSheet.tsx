/**
 * The Ask sheet (docs/ASK.md): slides in from the right like Help. Empty, it says what Ask does,
 * what is sent, and offers four questions about the page on screen; without a key it says how to
 * add one. A conversation lasts for the browser session (in memory only) and survives closing the
 * sheet; New chat clears it. The drill panel and the person card open on top of the sheet, and
 * Escape closes them first. Focus goes to the question box on open, stays there while an answer
 * comes, and returns to what opened the sheet on close.
 */
import { Dialog as BDialog } from '@base-ui/react/dialog'
import { type RefObject, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import {
  ASK_INTRO,
  answerText,
  askOffReason,
  NO_KEY,
  PRIVACY_LINE,
  parseAnswer,
  readKey,
  suggestionsFor,
  type ToolEnv,
} from '@/ask/engine'
import { IconChevronRight, IconClose, IconLock } from '@/components/icons'
import { Button } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { openSettings, type RouteView, useCensus } from '@/data/store'
import { useDrillStore } from '@/drill/store'
import { useHelp } from '@/help/store'
import { useActionMarks } from '@/views/actions/ui/store'
import { VIEWS } from '@/views/registry'
import { Composer } from './Composer'
import { IconNewChat } from './icons'
import { announcement, finalText, type Turn } from './model'
import { askQuestion, newChat } from './session'
import { askTrigger, closeAsk, closedFor, useAsk } from './store'
import { TurnView } from './TurnView'

/** What had focus when the sheet was asked to open (captured before React re-renders). */
let opener: HTMLElement | null = null

const UNDER = '.band, #census-main, footer'

/** Focus is on the page under the sheets, or nowhere. */
const focusUnder = (): boolean => {
  const a = document.activeElement
  return !a || a === document.body || (a instanceof HTMLElement && !!a.closest(UNDER))
}

/**
 * While the sheet is open, focus that lands on the page under it comes back to the sheet. Another
 * sheet closing (Settings after "Open Ask Census") hands focus to its own opener on the page,
 * sometimes before this sheet has rendered, so this listens from the moment Ask opens.
 */
function guardFocus(e: FocusEvent): void {
  if (!(e.target instanceof HTMLElement) || !e.target.closest(UNDER)) return
  window.setTimeout(() => {
    if (!useAsk.getState().open || sheetAbove() || !focusUnder()) return
    document.querySelector<HTMLElement>('[data-ask-start]')?.focus({ preventScroll: true })
  }, 0)
}

if (typeof document !== 'undefined')
  useAsk.subscribe((s, prev) => {
    if (s.open && !prev.open) {
      opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
      document.addEventListener('focusin', guardFocus)
    } else if (!s.open && prev.open) document.removeEventListener('focusin', guardFocus)
  })

/** Another sheet is open on top of Ask (records, a person card, Help or Settings). */
function sheetAbove(): boolean {
  return (
    useDrillStore.getState().stack.length > 0 ||
    useHelp.getState().open ||
    useCensus.getState().settingsOpen.open
  )
}

/**
 * The sheet closed because the page changed (a view link, or "Show in org chart" on a person card
 * opened from an answer): focus goes to the new page's main region. The sheets closing on the way
 * (Ask, and the records panel or person card over it) each hand focus back to what opened them,
 * which is on the old page or gone, and Base UI then falls back to whatever had focus before (the
 * first control of the page, a masthead button); so for a moment any focus that lands elsewhere is
 * moved to the main region, until the user clicks or presses a key or another sheet opens.
 */
function focusNewPage(): void {
  let timer = 0
  const settle = () => {
    if (useAsk.getState().open || sheetAbove()) return stop()
    const main = document.getElementById('census-main')
    if (main && document.activeElement !== main) main.focus({ preventScroll: true })
  }
  const onFocus = () => window.setTimeout(settle, 0)
  const stop = () => {
    window.clearTimeout(timer)
    document.removeEventListener('focusin', onFocus)
    document.removeEventListener('pointerdown', stop, true)
    document.removeEventListener('keydown', stop, true)
  }
  document.addEventListener('focusin', onFocus)
  document.addEventListener('pointerdown', stop, true)
  document.addEventListener('keydown', stop, true)
  window.setTimeout(settle, 0)
  timer = window.setTimeout(() => {
    settle()
    stop()
  }, 600)
}

/** Focus goes back to the opener, or the Ask button; nowhere when another sheet took over. */
function returnFocus(): HTMLElement | false | null {
  if (closedFor.route) {
    closedFor.route = false
    opener = null
    focusNewPage()
    return false
  }
  if (sheetAbove() || useHelp.getState().tour) return false
  const back = opener?.isConnected && opener !== document.body ? opener : askTrigger.current
  opener = null
  return back
}

/** The key in force; `version` and `nonce` change when it may have changed, so it is read again. */
const keyNow = (_version: number, _nonce: number) => readKey()

const PAGE_LABEL: Partial<Record<RouteView, string>> = { data: 'the Data room', actions: 'the Action center' }

function pageLabel(view: RouteView): string {
  return PAGE_LABEL[view] ?? VIEWS.find((v) => v.key === view)?.label ?? 'this page'
}

function PrivacyNote() {
  return (
    <p className="flex items-start gap-1.5 text-meta leading-snug text-muted">
      <IconLock className="mt-px size-3.5 shrink-0" />
      <span>{PRIVACY_LINE}</span>
    </p>
  )
}

function goToSettings() {
  closeAsk()
  openSettings('ask')
}

/** What a reader could ask, shown (not yet askable) before a key is added. */
const NO_KEY_EXAMPLES: readonly string[] = [
  'How has voluntary attrition in Bengaluru changed this year?',
  'Which departments have reqs open longer than 90 days?',
  'How many people start in the next 30 days?',
  'Which critical roles have no ready-now successor?',
]

/**
 * Before a key is added: what Ask does, said once, four questions it would answer (disabled
 * until there is a key), and the way to add one. One surface, divided by hairlines.
 */
function NoKey({ buttonRef }: { buttonRef: RefObject<HTMLButtonElement | null> }) {
  return (
    <div className="flex flex-col gap-4 px-5 pt-1 pb-6">
      <p className="max-w-[60ch] text-body text-ink">{ASK_INTRO}</p>
      <section aria-labelledby="ask-examples" className="border-t border-rule pt-3">
        <h3 id="ask-examples" className="text-meta font-medium text-ink-2">
          Questions you could ask
        </h3>
        <ul className="mt-1.5 flex flex-col">
          {NO_KEY_EXAMPLES.map((q) => (
            <li key={q}>
              <button
                type="button"
                disabled
                aria-describedby="ask-no-key"
                className="flex w-full items-start gap-3 rounded-control px-2.5 py-2 text-left text-small text-ink-2 disabled:cursor-default"
              >
                <span className="min-w-0 flex-1">{q}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="ask-no-key" className="border-t border-rule pt-4">
        <h3 id="ask-no-key" className="cut-head text-title font-semibold text-ink">
          {NO_KEY.title}
        </h3>
        <p className="mt-1 max-w-[60ch] text-small text-ink-2">
          Add a key from the Claude Console in Settings, Ask Census, to ask these. Nothing is sent until you
          do.
        </p>
        <Button ref={buttonRef} data-ask-start variant="primary" className="mt-3" onClick={goToSettings}>
          Open Settings, Ask Census
        </Button>
      </section>
      <PrivacyNote />
    </div>
  )
}

/** Views that read no data (AI in HR) get questions about Census as a whole. */
const NO_DATA: ReadonlySet<string> = new Set(VIEWS.filter((v) => !v.datasets.length).map((v) => v.key))

function Suggestions({ onAsk }: { onAsk: (q: string) => void }) {
  const view = useCensus((s) => s.route.view)
  return (
    <div className="flex flex-col gap-4 px-5 pt-1 pb-6">
      <p className="max-w-[60ch] text-body text-ink">{ASK_INTRO}</p>
      <PrivacyNote />
      <section aria-labelledby="ask-try" className="-mx-2.5 border-t border-rule pt-3">
        <h3 id="ask-try" className="px-2.5 pb-1 text-meta font-medium text-ink-2">
          {NO_DATA.has(view) ? 'Questions to start with' : `Questions about ${pageLabel(view)}`}
        </h3>
        <ul className="flex flex-col">
          {suggestionsFor(view).map((q) => (
            <li key={q}>
              <button
                type="button"
                onClick={() => onAsk(q)}
                className="group flex w-full items-start gap-3 rounded-control px-2.5 py-2 text-left text-small text-ink outline-none hover:bg-hover focus-visible:bg-hover"
              >
                <span className="min-w-0 flex-1">{q}</span>
                <IconChevronRight className="mt-0.5 size-3.5 shrink-0 text-muted group-hover:text-ink-2" />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

/**
 * The polite live region: what Census is doing and when the answer is ready, never each word as
 * it streams. It lives outside the sheet, so an answer that finishes after the sheet was closed is
 * still announced (a live region present when the sheet opens is left readable by it).
 */
function LiveRegion({ turn }: { turn: Turn | undefined }) {
  const conversation = useAsk((s) => s.conversation)
  const prev = useRef<Turn | undefined>(turn)
  const [said, setSaid] = useState({ text: '', n: 0 })
  useEffect(() => {
    const before = prev.current && prev.current.id === turn?.id ? prev.current : undefined
    const unchanged = prev.current === turn
    prev.current = turn
    if (!turn || unchanged) return
    const person = (t: string) => conversation.person(t)
    const msg = announcement(before, turn, () => answerText(parseAnswer(finalText(turn)), person), person)
    if (msg) setSaid((s) => ({ text: msg, n: s.n + 1 }))
  }, [turn, conversation])
  return (
    <div aria-live="polite" aria-atomic="true" className="sr-only">
      <p key={said.n}>{said.text}</p>
    </div>
  )
}

function Turns({ env, bodyRef }: { env: () => ToolEnv; bodyRef: RefObject<HTMLDivElement | null> }) {
  const turns = useAsk((s) => s.turns)
  const conversation = useAsk((s) => s.conversation)
  const busy = useAsk((s) => s.busy)
  const count = useRef(-1)
  // Opening on a conversation shows its last question; a new question scrolls up to the top of
  // the sheet (the last turn is at least as tall as the body, so it can) and its answer then
  // grows below it, so the reader's place never jumps.
  useEffect(() => {
    const was = count.current
    count.current = turns.length
    if (turns.length <= was && was !== -1) return
    const body = bodyRef.current
    const last = turns[turns.length - 1]
    if (!body || !last) return
    const el = body.querySelector<HTMLElement>(`[data-turn="${last.id}"]`)
    if (el) body.scrollTo({ top: Math.max(0, el.offsetTop - 4) })
  }, [turns, bodyRef])
  return (
    <div>
      {turns.map((t, i) => (
        <TurnView
          key={t.id}
          turn={t}
          turnNo={i + 1}
          earlier={() => turns.slice(0, i).flatMap((x) => x.calls)}
          conversation={conversation}
          env={env}
          busy={busy}
        />
      ))}
    </div>
  )
}

export function AskSheet() {
  const open = useAsk((s) => s.open)
  const nonce = useAsk((s) => s.nonce)
  const version = useAsk((s) => s.keyVersion)
  const hasTurns = useAsk((s) => s.turns.length > 0)
  const lastTurn = useAsk((s) => s.turns[s.turns.length - 1])
  const notice = useAsk((s) => s.notice)
  const ctx = useAnalytics()
  // Manager mode with an org under the anonymity minimum: Ask is off, and says why.
  const off = askOffReason(ctx)
  const hasKey = keyNow(version, nonce) != null
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const settingsButton = useRef<HTMLButtonElement | null>(null)
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const popupRef = useRef<HTMLDivElement | null>(null)

  // Every open request lands in the question box (or on "Open Settings" without a key), also
  // when the sheet was already open or another sheet was closing as it opened.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `nonce` changes on every open request
  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => {
      if (popupRef.current?.contains(document.activeElement) && document.activeElement !== popupRef.current)
        return
      document.querySelector<HTMLElement>('[data-ask-start]')?.focus({ preventScroll: true })
    }, 0)
    return () => window.clearTimeout(timer)
  }, [open, nonce])

  // The tools compute with the app as it is when the question is asked: filters, period, data
  // standard, metric definitions and the Action center's handled and snoozed items.
  const env = (): ToolEnv => ({ ctx, views: VIEWS, marks: useActionMarks.getState().marks, now: Date.now() })
  const ask = (q: string) => {
    void askQuestion(q, env())
    inputRef.current?.focus({ preventScroll: true })
  }

  return (
    <>
      <BDialog.Root
        open={open}
        onOpenChange={(o, d) => {
          if (o) return
          // Escape or a press outside belongs to the layer on top: the records panel or a person
          // card over the sheet, or a definition or menu opened from the answer. It closes that
          // one, not Ask under it.
          const layerOpen = !!popupRef.current?.querySelector('[data-popup-open]')
          if (d.reason !== 'close-press' && (sheetAbove() || layerOpen || d.event?.defaultPrevented)) {
            d.cancel()
            // Let the key reach the layer on top even when focus is still in this sheet.
            d.allowPropagation()
            return
          }
          closeAsk()
        }}
      >
        <BDialog.Portal>
          <BDialog.Backdrop className="fixed inset-0 z-40 bg-overlay transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
          <BDialog.Popup
            ref={popupRef}
            initialFocus={() => (readKey() ? inputRef.current : settingsButton.current)}
            finalFocus={returnFocus}
            className="fixed top-0 right-0 bottom-0 z-50 flex w-[min(640px,100vw)] flex-col bg-sheet pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)] text-ink shadow-(--shadow-pop) outline-none transition-transform duration-200 ease-out data-[ending-style]:translate-x-6 data-[ending-style]:opacity-0 data-[starting-style]:translate-x-6 data-[starting-style]:opacity-0"
          >
            <div className="flex items-center gap-2 border-b border-rule px-5 pt-3.5 pb-2.5">
              <BDialog.Title className="cut-head flex-1 text-section leading-tight font-semibold">
                Ask Census
              </BDialog.Title>
              {hasTurns && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<IconNewChat />}
                  onClick={() => {
                    // This button goes with the chat: render the empty sheet now and move focus to
                    // the question box (or Open Settings) before the button's removal loses it.
                    flushSync(() => newChat())
                    popupRef.current
                      ?.querySelector<HTMLElement>('[data-ask-start]')
                      ?.focus({ preventScroll: true })
                  }}
                >
                  New chat
                </Button>
              )}
              <BDialog.Close
                aria-label="Close Ask Census"
                className="-mr-1.5 inline-flex size-8 items-center justify-center rounded-control text-ink-2 hover:bg-hover hover:text-ink"
              >
                <IconClose />
              </BDialog.Close>
            </div>
            {/* The introduction is on screen once (in the body); the description adds only what it
                does not say. How long a conversation lasts only matters once there can be one. */}
            {hasKey && !off && (
              <BDialog.Description className="sr-only">
                The conversation lasts until you choose New chat, reload the page or close the tab.
              </BDialog.Description>
            )}
            <div ref={bodyRef} className="relative min-h-0 flex-1 overflow-y-auto pt-3 [container-type:size]">
              {notice && (
                <p className="mx-5 mb-3 rounded-control bg-sheet-2 px-3 py-2 text-small text-ink">{notice}</p>
              )}
              {off ? (
                <div className="flex flex-col gap-3 px-5 pt-1 pb-6">
                  <p className="max-w-[60ch] text-body text-ink">{ASK_INTRO}</p>
                  <p data-ask-start tabIndex={-1} className="max-w-[60ch] text-small text-ink-2 outline-none">
                    {off}
                  </p>
                </div>
              ) : hasTurns ? (
                <Turns env={env} bodyRef={bodyRef} />
              ) : hasKey ? (
                <Suggestions onAsk={ask} />
              ) : (
                <NoKey buttonRef={settingsButton} />
              )}
            </div>
            {off ? null : hasKey ? (
              <Composer onAsk={ask} inputRef={inputRef} />
            ) : (
              hasTurns && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-rule px-5 py-3 text-small text-ink-2">
                  <span className="min-w-0 flex-1">{NO_KEY.title} Add it to ask more.</span>
                  <Button ref={settingsButton} data-ask-start size="sm" onClick={goToSettings}>
                    Open Settings, Ask Census
                  </Button>
                </div>
              )
            )}
          </BDialog.Popup>
        </BDialog.Portal>
      </BDialog.Root>
      <LiveRegion turn={lastTurn} />
    </>
  )
}
