/**
 * Ask Census state: the panel (closed, open or collapsed, its width, and on phones whether the
 * sheet is at full height), the conversation and its turns (in memory for the browser session
 * only: never written to storage, kept when the panel closes, cleared by New chat), the
 * composer's draft, the actions undone, the charts pinned to My charts, and a counter that changes
 * when the API key, team passcode, model or team relay changes so the panel and Settings read
 * them again. The key and the passcode themselves are never held here.
 *
 * The panel stays open across navigation (docs/ASK-ACTIONS.md, part 1): changing views, tabs or
 * filters, by hand or by Ask, keeps it and the conversation. Open or collapsed is remembered for
 * the session, the width on this device.
 */
import { createRef } from 'react'
import { create } from 'zustand'
import { ASK_NEW_CHAT } from '@/access/copy'
import { picksOfState, useMode } from '@/access/store'
import {
  type AskChart,
  type Conversation,
  createConversation,
  KEY_STORAGE_KEY,
  MODEL_STORAGE_KEY,
  PASSCODE_STORAGE_KEY,
  pickOfMode,
  SCREEN_ACTIONS_STORAGE_KEY,
  SOURCE_STORAGE_KEY,
  WORKSPACE_STORAGE_KEY,
} from '@/ask/engine'
import {
  type PanelState,
  readPanelState,
  readPanelWidth,
  type SheetHeight,
  savePanelState,
  savePanelWidth,
  stepHeight,
} from './dock'
import { abortAnswer } from './inflight'
import type { Turn } from './model'

/** The masthead Ask button: focus comes back here when nothing better is left. */
export const askTrigger = createRef<HTMLButtonElement>()

/** A chart kept in My charts for the session, with the conversation that resolves its names and records. */
export interface PinnedChart {
  /** `${chat}:${chart.id}`: unique across chats. */
  key: string
  chart: AskChart
  conversation: Conversation
  /** The question it answered, as typed. */
  question: string
}

const session = (): Storage | null => {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage
  } catch {
    return null
  }
}
const local = (): Storage | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

interface AskState {
  /** The panel: closed (the default), open beside the page, or collapsed to a rail (phones: the peek bar). */
  panel: PanelState
  /** The panel is open (not closed or collapsed). */
  open: boolean
  /** The width chosen by dragging (kept within the window's limits when drawn). */
  width: number
  /** Phones: the open sheet is at full height (else half). */
  tall: boolean
  /** Changes on every open request, so focus moves to the question box. */
  nonce: number
  /** Changes on New chat, so a late event from the old chat is ignored. */
  chat: number
  conversation: Conversation
  turns: Turn[]
  busy: boolean
  draft: string
  /** Changes when the key, model, workspace ID or "Let Ask change the screen" is saved or forgotten. */
  keyVersion: number
  /** An answer finished while the panel was not open and has not been seen yet. */
  unseen: boolean
  /** A line at the top of the panel until the next question: "Mode changed, so Ask started a new chat." */
  notice: string | null
  /** Actions undone (by tool_use id), so their lines say so. */
  undone: Readonly<Record<string, true>>
  /** Charts pinned to My charts, newest first. */
  pinned: readonly PinnedChart[]
  /** The panel shows My charts instead of the conversation. */
  showPinned: boolean

  openAsk: () => void
  closeAsk: () => void
  collapseAsk: () => void
  setWidth: (width: number) => void
  /** Phones: show the sheet at a height (peek collapses it). */
  setHeight: (h: SheetHeight) => void
  setDraft: (draft: string) => void
  /** Replace one turn (by id) in the current chat. */
  updateTurn: (chat: number, id: number, next: (t: Turn) => Turn) => void
  addTurn: (t: Turn) => void
  setBusy: (busy: boolean) => void
  /** An answer finished: unseen when the panel is not open. */
  answered: () => void
  markUndone: (actionId: string) => void
  pin: (p: Omit<PinnedChart, 'key'>) => void
  unpin: (key: string) => void
  setShowPinned: (on: boolean) => void
  /** A new conversation: new tokens, refs and history (pinned charts stay). */
  reset: () => void
  /** The mode changed: a new conversation, with a line saying why (earlier answers may hold numbers it hides). */
  modeChanged: () => void
  keyChanged: () => void
}

function setPanel(panel: PanelState) {
  savePanelState(panel, session())
  return { panel, open: panel === 'open' }
}

const initialPanel = readPanelState(session())

export const useAsk = create<AskState>((set, get) => ({
  panel: initialPanel,
  open: initialPanel === 'open',
  width: readPanelWidth(local()),
  tall: false,
  nonce: 0,
  chat: 1,
  conversation: createConversation(),
  turns: [],
  busy: false,
  draft: '',
  keyVersion: 0,
  unseen: false,
  notice: null,
  undone: {},
  pinned: [],
  showPinned: false,

  openAsk() {
    set((s) => ({ ...setPanel('open'), nonce: s.nonce + 1, unseen: false }))
  },
  closeAsk() {
    set({ ...setPanel('closed'), tall: false })
  },
  collapseAsk() {
    set({ ...setPanel('collapsed'), tall: false })
  },
  setWidth(width) {
    savePanelWidth(width, local())
    set({ width })
  },
  setHeight(h) {
    if (h === 'peek') get().collapseAsk()
    else set({ ...setPanel('open'), tall: h === 'full', unseen: false })
  },
  setDraft(draft) {
    set({ draft })
  },
  updateTurn(chat, id, next) {
    if (get().chat !== chat) return
    set((s) => ({ turns: s.turns.map((t) => (t.id === id ? next(t) : t)) }))
  },
  addTurn(t) {
    // A question clears the line at the top ("Mode changed, so Ask started a new chat.").
    set((s) => ({ turns: [...s.turns, t], showPinned: false, notice: null }))
  },
  setBusy(busy) {
    set({ busy })
  },
  answered() {
    if (!get().open) set({ unseen: true })
  },
  markUndone(actionId) {
    set((s) => ({ undone: { ...s.undone, [actionId]: true } }))
  },
  pin(p) {
    const key = `${get().chat}:${p.chart.id}`
    if (get().pinned.some((x) => x.key === key)) return
    set((s) => ({ pinned: [{ ...p, key }, ...s.pinned] }))
  },
  unpin(key) {
    set((s) => {
      const pinned = s.pinned.filter((p) => p.key !== key)
      return { pinned, showPinned: s.showPinned && pinned.length > 0 }
    })
  },
  setShowPinned(on) {
    set({ showPinned: on && get().pinned.length > 0 })
  },
  reset() {
    set((s) => ({
      chat: s.chat + 1,
      conversation: createConversation(),
      turns: [],
      busy: false,
      unseen: false,
      notice: null,
      undone: {},
      showPinned: false,
    }))
  },
  modeChanged() {
    const had = get().turns.length > 0 || get().pinned.length > 0
    // The answer in flight was asked in the old mode: stop it before the chat goes.
    abortAnswer()
    get().reset()
    // Pinned charts may show numbers the new mode hides: they go with the chat.
    set({ pinned: [] })
    if (had) set({ notice: ASK_NEW_CHAT })
  },
  keyChanged() {
    set((s) => ({ keyVersion: s.keyVersion + 1 }))
  },
}))

/**
 * Ask on or off in the mode on screen (`S.ask()`, the Security center's "Ask: on or off"); the
 * shell's `AskGate` sets it. Off, nothing opens the panel and nothing is asked.
 */
let allowed = true

export const askAllowed = (): boolean => allowed

/** Ask turned off: stop any answer, forget the chat and its pinned charts, and close the panel. */
export function setAskAllowed(on: boolean): void {
  if (on === allowed) return
  allowed = on
  if (on) return
  const s = useAsk.getState()
  abortAnswer()
  s.reset()
  useAsk.setState({ pinned: [], notice: null, draft: '' })
  s.closeAsk()
}

export const openAsk = (): void => {
  if (allowed) useAsk.getState().openAsk()
}
export const closeAsk = (): void => useAsk.getState().closeAsk()
export const collapseAsk = (): void => useAsk.getState().collapseAsk()

/** Open, or collapse when open (the masthead button). */
export function toggleAsk(): void {
  if (!allowed) return
  const s = useAsk.getState()
  if (s.panel === 'open') s.collapseAsk()
  else s.openAsk()
}

/** One step taller or shorter on a phone (the sheet's Expand and Shrink). */
export function stepAsk(dir: 1 | -1): void {
  const s = useAsk.getState()
  const now: SheetHeight = s.panel !== 'open' ? 'peek' : s.tall ? 'full' : 'half'
  s.setHeight(stepHeight(now, dir))
}

/**
 * A link in an answer goes to another page (a view link, "Open in Metric definitions"). The panel
 * stays where it is beside the page; on a phone a sheet at full height drops to half so the page
 * shows.
 */
export function leaveAsk(): void {
  const s = useAsk.getState()
  if (s.open && s.tall) s.setHeight('half')
}

// Any mode change starts a new chat (docs/ROLES.md, 1.5), and so does a new pick in a scoped mode
// (manager, business unit, region, recruiter): earlier answers may hold numbers the new mode or
// scope does not show.
useMode.subscribe((s, prev) => {
  if (
    s.mode !== prev.mode ||
    s.managerId !== prev.managerId ||
    pickOfMode(s.mode, picksOfState(s)) !== pickOfMode(prev.mode, picksOfState(prev))
  )
    useAsk.getState().modeChanged()
})

// A key or team passcode kept on this device (or the model choice, workspace ID, "Use my own key
// instead" or "Let Ask change the screen") changed in another tab: read them again.
if (typeof window !== 'undefined') {
  try {
    window.addEventListener('storage', (e) => {
      if (
        e.key === KEY_STORAGE_KEY ||
        e.key === PASSCODE_STORAGE_KEY ||
        e.key === SOURCE_STORAGE_KEY ||
        e.key === MODEL_STORAGE_KEY ||
        e.key === WORKSPACE_STORAGE_KEY ||
        e.key === SCREEN_ACTIONS_STORAGE_KEY ||
        e.key === null
      )
        useAsk.getState().keyChanged()
    })
  } catch {
    /* no storage events: the next open reads them anyway */
  }
}
