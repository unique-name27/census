/**
 * The Ask panel (docs/ASK.md; docs/ASK-ACTIONS.md, part 1): Ask stays open beside the app. On wide
 * screens it docks on the right, the full height of the window, and the page narrows to make room;
 * its left edge drags (or takes the arrow keys) to resize it, 360 to 640px; collapsed, it is a
 * slim rail. On phones it is a bottom sheet at three heights (a peek bar with the last answer's
 * first line and the question box, half and full), and the page above stays usable at peek and
 * half height.
 *
 * Not a modal: no backdrop and no focus trap. Focus goes to the question box when Ask opens and
 * stays wherever the person clicks afterwards; Alt+A moves it between the page and the question
 * box (AskButton). Escape inside the panel collapses it. The records panel, person cards,
 * Settings and Help open above it and hand focus back to where it was. The panel and the
 * conversation stay through navigation: changing views, tabs or filters, by hand or by Ask.
 *
 * Empty, it says what Ask does, what is sent, and offers four questions about the page on screen;
 * without a key it says how to add one. A conversation lasts for the browser session (in memory
 * only); New chat clears it. Charts pinned from answers are listed under My charts.
 */
import { type PointerEvent as ReactPointerEvent, type RefObject, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { S } from '@/access/surfaces'
import {
  ASK_INTRO,
  answerText,
  askOffReason,
  NO_KEY,
  noKeyQuestions,
  onScreenEvent,
  PRIVACY_LINE,
  parseAnswer,
  readKey,
  readScreenActions,
  suggestionsFor,
  type ToolEnv,
} from '@/ask/engine'
import { IconChevronDown, IconChevronRight, IconClose, IconLock } from '@/components/icons'
import { AreaContext } from '@/components/mainArea'
import { Button, cx, IconButton, Segmented } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { openSettings, type RouteView, useCensus } from '@/data/store'
import { useActionMarks } from '@/views/actions/ui/store'
import { analysisSurface } from '@/views/hrbp/analyses/tab'
import { VIEWS } from '@/views/registry'
import { AskChartFigure } from './AskChartFigure'
import { Composer } from './Composer'
import {
  type DockLayout,
  heightAt,
  maxPanelWidth,
  PANEL_MIN,
  panelWidth,
  peekLine,
  type SheetHeight,
  widthAt,
  widthByKey,
} from './dock'
import { IconAsk, IconChevronUp, IconCollapse, IconNewChat, IconWorking } from './icons'
import { announcement, finalText, statusLine, type Turn, withNames } from './model'
import { panelAskApp } from './panelApp'
import { focusComposer, focusPage, PANEL_ID, panelEl } from './panelFocus'
import { connectPointer } from './pointer'
import { askQuestion, newChat } from './session'
import { askTrigger, closeAsk, collapseAsk, openAsk, stepAsk, useAsk } from './store'
import { TurnView } from './TurnView'
import { pageWidth, panelArea, useDock, usePeek, useViewport } from './useDock'

/* ───────────── empty states ───────────── */

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

/** Settings opens above the panel and hands focus back to the button when it closes. */
const goToSettings = () => openSettings('ask')

/**
 * Before a key is added: what Ask does, said once, four questions it would answer (disabled
 * until there is a key), and the way to add one. One surface, divided by hairlines.
 */
function NoKey({ buttonRef }: { buttonRef: RefObject<HTMLButtonElement | null> }) {
  const view = useCensus((s) => s.route.view)
  const tab = useCensus((s) => s.route.tab)
  const access = useAnalytics().access
  const questions = noKeyQuestions({
    mode: access.mode,
    scoped: access.scope != null,
    viewShown: (v) => access.can(S.view(v)),
    view,
    tab,
    shown: (k) => access.can(analysisSurface(k)),
  })
  return (
    <div className="flex flex-col gap-4 px-5 pt-1 pb-6">
      <p className="max-w-[60ch] text-body text-ink">{ASK_INTRO}</p>
      <section aria-labelledby="ask-examples" className="border-t border-rule pt-3">
        <h3 id="ask-examples" className="text-meta font-medium text-ink-2">
          Questions you could ask
        </h3>
        <ul className="mt-1.5 flex flex-col">
          {questions.map((q) => (
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

/** "Let Ask change the screen"; `version` changes when it is saved, so it is read again. */
const actionsNow = (_version: number) => readScreenActions()

function Suggestions({ onAsk }: { onAsk: (q: string) => void }) {
  const view = useCensus((s) => s.route.view)
  const tab = useCensus((s) => s.route.tab)
  const access = useAnalytics().access
  const version = useAsk((s) => s.keyVersion)
  const actions = actionsNow(version)
  return (
    <div className="flex flex-col gap-4 px-5 pt-1 pb-6">
      <p className="max-w-[60ch] text-body text-ink">{ASK_INTRO}</p>
      {actions ? (
        <p className="max-w-[60ch] text-small text-ink-2">
          Ask can also change the screen as it answers: filter, open a view or tab, point to a chart, or open
          the records behind a number. Each change has Undo. It can draw charts in its answers too.
        </p>
      ) : (
        <p className="max-w-[60ch] text-small text-ink-2">
          Ask can also draw charts. Changing the screen is turned off in{' '}
          <button
            type="button"
            onClick={goToSettings}
            className="rounded-mark font-medium text-link underline-offset-2 hover:underline"
          >
            Settings, Ask Census
          </button>
          .
        </p>
      )}
      <PrivacyNote />
      <section aria-labelledby="ask-try" className="-mx-2.5 border-t border-rule pt-3">
        <h3 id="ask-try" className="px-2.5 pb-1 text-meta font-medium text-ink-2">
          {NO_DATA.has(view) ? 'Questions to start with' : `Questions about ${pageLabel(view)}`}
        </h3>
        <ul className="flex flex-col">
          {suggestionsFor(view, tab, (k) => access.can(analysisSurface(k)), access.mode).map((q) => (
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
 * it streams. It lives outside the panel, so an answer that finishes while the panel is collapsed
 * is still announced.
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
  // the panel (the last turn is at least as tall as the body, so it can) and its answer then
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

/** Charts pinned from answers this session, newest first. */
function MyCharts() {
  const pinned = useAsk((s) => s.pinned)
  if (!pinned.length)
    return <p className="px-5 pt-2 text-small text-ink-2">Pin a chart from an answer to keep it here.</p>
  return (
    <div className="flex flex-col gap-6 px-5 pt-2 pb-6">
      <p className="text-meta text-muted">
        Kept until you reload the page or close the tab, or change the mode. Nothing here is saved anywhere
        else.
      </p>
      {pinned.map((p) => (
        <section key={p.key} aria-label={p.chart.title} className="flex flex-col gap-2">
          <p className="text-meta text-muted">
            From: <span className="text-ink-2">{withNames(p.question, (t) => p.conversation.person(t))}</span>
          </p>
          <AskChartFigure
            chart={p.chart}
            conversation={p.conversation}
            question={p.question}
            pinKey={p.key}
          />
        </section>
      ))}
    </div>
  )
}

/* ───────────── the header ───────────── */

/**
 * The phone sheet one step taller or shorter, from its height buttons. The header changes with the
 * height (the peek bar has its own, and full has no Taller), so the button pressed may be gone:
 * focus stays on the same button when the new height has it, else moves to the other one.
 */
function stepKeepingFocus(dir: 1 | -1): void {
  flushSync(() => stepAsk(dir))
  const panel = panelEl()
  const pick = (d: 'up' | 'down') => panel?.querySelector<HTMLElement>(`[data-ask-step="${d}"]`)
  ;(pick(dir > 0 ? 'up' : 'down') ?? pick(dir > 0 ? 'down' : 'up'))?.focus({ preventScroll: true })
}

function Header({
  kind,
  height,
  onNewChat,
}: {
  kind: 'dock' | 'sheet'
  height: SheetHeight | null
  onNewChat: () => void
}) {
  const hasTurns = useAsk((s) => s.turns.length > 0)
  return (
    <div className="flex items-center gap-1 border-b border-rule pt-3 pr-3 pb-2.5 pl-5">
      <h2
        id="ask-title"
        className="cut-head min-w-0 flex-1 truncate text-section leading-tight font-semibold"
      >
        Ask Census
      </h2>
      {hasTurns && (
        <Button size="sm" variant="ghost" icon={<IconNewChat />} onClick={onNewChat}>
          New chat
        </Button>
      )}
      {kind === 'sheet' ? (
        <>
          <IconButton
            data-ask-step="down"
            label="Make Ask Census shorter"
            onClick={() => stepKeepingFocus(-1)}
          >
            <IconChevronDown />
          </IconButton>
          {height !== 'full' && (
            <IconButton data-ask-step="up" label="Make Ask Census taller" onClick={() => stepKeepingFocus(1)}>
              <IconChevronUp />
            </IconButton>
          )}
        </>
      ) : (
        <IconButton
          label="Collapse Ask Census"
          aria-controls={PANEL_ID}
          onClick={() => {
            collapseAsk()
            window.setTimeout(() => panelEl()?.querySelector<HTMLElement>('[data-ask-expand]')?.focus(), 0)
          }}
        >
          <IconCollapse />
        </IconButton>
      )}
      <IconButton
        label="Close Ask Census"
        onClick={() => {
          closeAsk()
          ;(askTrigger.current?.getClientRects().length ? askTrigger.current : null)?.focus()
          if (!askTrigger.current?.getClientRects().length) focusPage()
        }}
      >
        <IconClose />
      </IconButton>
    </div>
  )
}

/** Chat or My charts, once a chart is pinned. */
function Switcher() {
  const count = useAsk((s) => s.pinned.length)
  const showPinned = useAsk((s) => s.showPinned)
  const setShowPinned = useAsk((s) => s.setShowPinned)
  if (!count) return null
  return (
    <div className="border-b border-rule px-5 py-2">
      <Segmented
        label="Show"
        value={showPinned ? 'charts' : 'chat'}
        onChange={(v) => setShowPinned(v === 'charts')}
        options={[
          { value: 'chat', label: 'Conversation' },
          { value: 'charts', label: `My charts (${count})` },
        ]}
      />
    </div>
  )
}

/* ───────────── resizing ───────────── */

/** Keep the pointer's moves on the handle while it drags (a pen or touch may refuse it). */
function capture(e: ReactPointerEvent): void {
  try {
    e.currentTarget.setPointerCapture(e.pointerId)
  } catch {
    /* moves still arrive while the pointer stays over the handle */
  }
}

/** The left edge of the docked panel: drag it, or use the arrow keys, Home and End. */
function ResizeHandle({ width }: { width: number }) {
  const setWidth = useAsk((s) => s.setWidth)
  const vp = useViewport()
  const guide = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number } | null>(null)
  const move = (x: number) => {
    drag.current = { x }
    const g = guide.current
    if (g) {
      g.hidden = false
      g.style.left = `${pageWidth() - widthAt(x, pageWidth())}px`
    }
  }
  const end = (e: ReactPointerEvent) => {
    const d = drag.current
    drag.current = null
    if (guide.current) guide.current.hidden = true
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* not captured */
    }
    if (d) setWidth(widthAt(d.x, pageWidth()))
  }
  return (
    <>
      {/* biome-ignore lint/a11y/useSemanticElements: a focusable separator that resizes the panel (the ARIA window splitter pattern); <hr> cannot take focus or keys */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize Ask Census"
        aria-controls={PANEL_ID}
        aria-valuenow={width}
        aria-valuemin={PANEL_MIN}
        aria-valuemax={maxPanelWidth(vp.page ?? vp.width)}
        aria-valuetext={`${width} pixels wide`}
        tabIndex={0}
        onKeyDown={(e) => {
          // The width as drawn now (a held key repeats faster than the panel re-renders).
          const now = panelWidth(useAsk.getState().width, pageWidth())
          const next = widthByKey(e, now, pageWidth())
          if (next == null) return
          e.preventDefault()
          setWidth(next)
        }}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          e.preventDefault()
          capture(e)
          move(e.clientX)
        }}
        onPointerMove={(e) => {
          if (drag.current) move(e.clientX)
        }}
        onPointerUp={end}
        onPointerCancel={end}
        className="group absolute top-0 bottom-0 -left-1 z-10 w-2 cursor-col-resize touch-none outline-none"
      >
        <span
          aria-hidden="true"
          className="absolute top-0 bottom-0 left-[3px] w-0.5 bg-transparent transition-colors group-hover:bg-rule-strong group-focus-visible:bg-focus"
        />
      </div>
      <div
        ref={guide}
        hidden
        aria-hidden="true"
        className="pointer-events-none fixed top-0 bottom-0 z-40 w-0.5 -translate-x-1/2 bg-focus"
      />
    </>
  )
}

/* ───────────── the rail ───────────── */

function Rail() {
  const busy = useAsk((s) => s.busy)
  const unseen = useAsk((s) => s.unseen)
  const failed = useAsk((s) => s.turns.at(-1)?.status === 'error')
  const pinned = useAsk((s) => s.pinned.length)
  const state = busy ? 'answering' : unseen ? 'ready' : null
  const label =
    state === 'answering'
      ? 'Open Ask Census, answering'
      : state === 'ready'
        ? failed
          ? 'Open Ask Census, the answer did not finish'
          : 'Open Ask Census, answer ready'
        : 'Open Ask Census'
  return (
    <aside
      id={PANEL_ID}
      aria-label="Ask Census, collapsed"
      className="fixed top-0 right-0 bottom-0 z-30 flex w-11 flex-col items-center gap-1 border-l border-rule bg-sheet pt-3 pb-3 text-ink"
    >
      <IconButton
        data-ask-expand
        label={label}
        aria-expanded={false}
        aria-controls={PANEL_ID}
        aria-keyshortcuts="Alt+A"
        onClick={() => openAsk()}
      >
        {state === 'answering' ? (
          <IconWorking className="motion-safe:animate-spin [:root[data-motion=reduce]_&]:animate-none" />
        ) : (
          <span className="relative inline-flex">
            <IconAsk />
            {state === 'ready' && (
              <span
                aria-hidden="true"
                className="absolute -top-0.5 -right-0.5 size-[7px] rounded-full bg-ink ring-2 ring-sheet"
              />
            )}
          </span>
        )}
      </IconButton>
      {pinned > 0 && (
        <IconButton
          label={`Open My charts (${pinned})`}
          onClick={() => {
            useAsk.getState().setShowPinned(true)
            openAsk()
          }}
        >
          <span className="cut-head text-small font-semibold tnum">{pinned}</span>
        </IconButton>
      )}
      <span className="flex-1" />
      <IconButton label="Close Ask Census" onClick={() => closeAsk()}>
        <IconClose />
      </IconButton>
    </aside>
  )
}

/* ───────────── the phone sheet's handle ───────────── */

function SheetHandle({ height, sheet }: { height: SheetHeight; sheet: RefObject<HTMLElement | null> }) {
  const setHeight = useAsk((s) => s.setHeight)
  const peek = usePeek((s) => s.px)
  const drag = useRef<{ y0: number; h0: number; t0: number; y: number } | null>(null)
  const done = (e: ReactPointerEvent) => {
    const d = drag.current
    drag.current = null
    const el = sheet.current
    if (!d || !el) return
    el.style.removeProperty('height')
    el.style.removeProperty('transition')
    const moved = d.y - d.y0
    if (Math.abs(moved) < 6) return
    const ms = Math.max(1, e.timeStamp - d.t0)
    setHeight(heightAt(d.y, window.innerHeight, peek, moved / ms, height))
  }
  return (
    <div
      aria-hidden="true"
      onPointerDown={(e) => {
        const el = sheet.current
        if (!el || e.button !== 0) return
        capture(e)
        drag.current = { y0: e.clientY, h0: el.getBoundingClientRect().height, t0: e.timeStamp, y: e.clientY }
      }}
      onPointerMove={(e) => {
        const d = drag.current
        const el = sheet.current
        if (!d || !el) return
        d.y = e.clientY
        const h = Math.max(peek, Math.min(window.innerHeight, d.h0 - (e.clientY - d.y0)))
        el.style.transition = 'none'
        el.style.height = `${h}px`
      }}
      onPointerUp={done}
      onPointerCancel={done}
      className="flex h-4 shrink-0 cursor-grab touch-none items-center justify-center"
    >
      <span className="h-1 w-9 rounded-full bg-rule-strong" />
    </div>
  )
}

/** The peek bar's line: what Census is doing, or the last answer's first sentence. Tap for half height. */
function PeekLine() {
  const turn = useAsk((s) => s.turns.at(-1))
  const conversation = useAsk((s) => s.conversation)
  if (!turn) return null
  const person = (t: string) => conversation.person(t)
  const status = statusLine(turn, person)
  const answer = turn.text ? answerText(parseAnswer(finalText(turn)), person) : ''
  const line = peekLine(status, answer) ?? turn.question
  return (
    <button
      type="button"
      onClick={() => useAsk.getState().setHeight('half')}
      className="flex w-full items-center gap-2 px-5 pb-1 text-left text-small text-ink-2 outline-none hover:text-ink focus-visible:text-ink"
    >
      {status && (
        <IconWorking className="size-3.5 shrink-0 motion-safe:animate-spin [:root[data-motion=reduce]_&]:animate-none" />
      )}
      <span className="min-w-0 flex-1 truncate">{line}</span>
      <span className="sr-only">Show the conversation</span>
    </button>
  )
}

/* ───────────── the panel ───────────── */

export function AskPanel() {
  const dock = useDock()
  const lastTurn = useAsk((s) => s.turns[s.turns.length - 1])
  // Ask's screen events: point at a figure on the page (scroll, ring, table view).
  const reserve = useRef(0)
  reserve.current = dock.kind === 'sheet' ? dock.bottom : 0
  useEffect(() => connectPointer(() => reserve.current), [])
  // On a phone, when Ask changes the screen while the sheet covers it, the sheet drops to half
  // height so the change shows.
  useEffect(() => {
    const drop = () => {
      const a = useAsk.getState()
      if (a.busy && a.open && a.tall) a.setHeight('half')
    }
    const stopScreen = onScreenEvent(drop)
    const stopStore = useCensus.subscribe((s, prev) => {
      if (s.route !== prev.route || s.filters !== prev.filters) drop()
    })
    return () => {
      stopScreen()
      stopStore()
    }
  }, [])
  // The room the panel takes, for what floats over the page (toasts sit clear of it).
  const sheetBottom = dock.kind === 'sheet' ? dock.bottom : 0
  useEffect(() => {
    const root = document.documentElement.style
    root.setProperty('--ask-right', `${dock.right}px`)
    root.setProperty('--ask-bottom', `${sheetBottom}px`)
    return () => {
      root.removeProperty('--ask-right')
      root.removeProperty('--ask-bottom')
    }
  }, [dock.right, sheetBottom])
  return (
    <>
      {dock.kind === 'rail' ? <Rail /> : dock.kind === 'none' ? null : <OpenPanel dock={dock} />}
      <LiveRegion turn={lastTurn} />
    </>
  )
}

function OpenPanel({ dock }: { dock: Exclude<DockLayout, { kind: 'none' | 'rail' }> }) {
  const nonce = useAsk((s) => s.nonce)
  const version = useAsk((s) => s.keyVersion)
  const hasTurns = useAsk((s) => s.turns.length > 0)
  const notice = useAsk((s) => s.notice)
  const showPinned = useAsk((s) => s.showPinned)
  const ctx = useAnalytics()
  // A scoped mode under the anonymity minimum, or without its pick: Ask is off, and says why.
  const off = askOffReason(ctx)
  const hasKey = keyNow(version, nonce) != null
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const settingsButton = useRef<HTMLButtonElement | null>(null)
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const rootRef = useRef<HTMLElement | null>(null)
  const sheet = dock.kind === 'sheet'
  const height = sheet ? dock.height : null
  const peek = height === 'peek'

  // Every open request lands in the question box (or on "Open Settings" without a key).
  useEffect(() => {
    if (!nonce) return
    const timer = window.setTimeout(focusComposer, 0)
    return () => window.clearTimeout(timer)
  }, [nonce])

  // The panel's width is its own area: breakpoints and useNarrow inside it read it.
  useEffect(() => {
    const el = rootRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect
      if (!box) return
      panelArea.set(box.width)
      if (peek) usePeek.getState().set(box.height)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [peek])

  // The tools compute with the app as it is when the question is asked: filters, period, data
  // standard, metric definitions and the Action center's handled and snoozed items. `app`: Ask
  // reads and drives the screen (docs/ASK-ACTIONS.md); records it opens mid-answer while the person
  // is in the panel wait for the answer to finish (panelApp.ts).
  const env = (): ToolEnv => ({
    ctx,
    views: VIEWS,
    marks: useActionMarks.getState().marks,
    now: Date.now(),
    app: panelAskApp,
  })
  const ask = (q: string) => {
    void askQuestion(q, env())
    inputRef.current?.focus({ preventScroll: true })
  }
  const onNewChat = () => {
    // The button goes with the chat: render the empty panel now and move focus to the question
    // box (or Open Settings) before the button's removal loses it.
    flushSync(() => newChat())
    focusComposer()
  }

  const style = dock.kind === 'sheet' ? (peek ? undefined : { height: dock.px }) : { width: dock.width }

  return (
    <AreaContext value={panelArea}>
      <aside
        ref={rootRef}
        id={PANEL_ID}
        aria-labelledby="ask-title"
        data-area=""
        data-ask-panel={sheet ? dock.height : 'dock'}
        onKeyDown={(e) => {
          // Escape inside the panel collapses it, unless a menu, popover or definition opened from
          // an answer is open: that one closes first.
          if (e.key !== 'Escape' || e.defaultPrevented) return
          if (!(e.target instanceof Node) || !rootRef.current?.contains(e.target)) return
          if (rootRef.current.querySelector('[data-popup-open]')) return
          if (peek) return
          e.preventDefault()
          collapseAsk()
          window.setTimeout(() => {
            if (sheet) focusComposer()
            else panelEl()?.querySelector<HTMLElement>('[data-ask-expand]')?.focus()
          }, 0)
        }}
        className={cx(
          '@container/shell fixed z-30 flex flex-col bg-sheet text-ink',
          sheet
            ? cx(
                'inset-x-0 bottom-0 max-h-dvh rounded-t-sheet pb-[env(safe-area-inset-bottom,0px)] shadow-(--shadow-pop) transition-[height] duration-200 ease-out',
                dock.height === 'full' && 'pt-[env(safe-area-inset-top,0px)]',
              )
            : 'top-0 right-0 bottom-0 border-l border-rule pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]',
        )}
        style={style}
      >
        {sheet ? <SheetHandle height={dock.height} sheet={rootRef} /> : <ResizeHandle width={dock.width} />}
        {peek ? (
          <div className="flex items-center gap-1 pr-3 pl-5">
            <h2 id="ask-title" className="cut-head min-w-0 flex-1 text-title font-semibold">
              Ask Census
            </h2>
            <IconButton data-ask-step="up" label="Make Ask Census taller" onClick={() => stepKeepingFocus(1)}>
              <IconChevronUp />
            </IconButton>
            <IconButton label="Close Ask Census" onClick={() => closeAsk()}>
              <IconClose />
            </IconButton>
          </div>
        ) : (
          <Header kind={sheet ? 'sheet' : 'dock'} height={height} onNewChat={onNewChat} />
        )}
        {peek ? (
          <PeekLine />
        ) : (
          <>
            {notice && (
              <p className="mx-5 mt-3 rounded-control bg-sheet-2 px-3 py-2 text-small text-ink">{notice}</p>
            )}
            {!off && <Switcher />}
            <div ref={bodyRef} className="relative min-h-0 flex-1 overflow-y-auto pt-3 [container-type:size]">
              {off ? (
                <div className="flex flex-col gap-3 px-5 pt-1 pb-6">
                  <p className="max-w-[60ch] text-body text-ink">{ASK_INTRO}</p>
                  <p data-ask-start tabIndex={-1} className="max-w-[60ch] text-small text-ink-2 outline-none">
                    {off}
                  </p>
                </div>
              ) : showPinned ? (
                <MyCharts />
              ) : hasTurns ? (
                <Turns env={env} bodyRef={bodyRef} />
              ) : hasKey ? (
                <Suggestions onAsk={ask} />
              ) : (
                <NoKey buttonRef={settingsButton} />
              )}
            </div>
          </>
        )}
        {off ? null : hasKey ? (
          <Composer onAsk={ask} inputRef={inputRef} />
        ) : (
          (hasTurns || peek) && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-rule px-5 py-3 text-small text-ink-2">
              <span className="min-w-0 flex-1">{NO_KEY.title} Add it to ask more.</span>
              <Button ref={settingsButton} data-ask-start size="sm" onClick={goToSettings}>
                Open Settings, Ask Census
              </Button>
            </div>
          )
        )}
      </aside>
    </AreaContext>
  )
}
